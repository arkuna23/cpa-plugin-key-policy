package sidecar

import (
	"bytes"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"sync"
	"time"

	"cpa-key-policy/internal/policy"
)

// Config drives the optional HTTP sidecar that proxies CPA and filters
// GET /v1/models per downstream key aliases.
type Config struct {
	Enabled      bool
	Listen       string // e.g. 127.0.0.1:19090
	Upstream     string // e.g. http://127.0.0.1:8317
	ModelsAPIKey string // upstream key used only for fetching the global models list
}

// Server runs the sidecar listener until Stop.
type Server struct {
	cfg    Config
	store  *policy.Store
	srv    *http.Server
	addr   string
	mu     sync.Mutex
	client *http.Client
}

func New(cfg Config, store *policy.Store) *Server {
	return &Server{
		cfg:   cfg,
		store: store,
		client: &http.Client{
			Timeout: 120 * time.Second,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
	}
}

func (s *Server) Start() error {
	if !s.cfg.Enabled {
		return nil
	}
	up, err := url.Parse(strings.TrimSpace(s.cfg.Upstream))
	if err != nil || up.Scheme == "" || up.Host == "" {
		return fmt.Errorf("sidecar: invalid upstream %q", s.cfg.Upstream)
	}
	listen := strings.TrimSpace(s.cfg.Listen)
	if listen == "" {
		listen = "127.0.0.1:19090"
	}
	proxy := httputil.NewSingleHostReverseProxy(up)
	proxy.FlushInterval = -1
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		http.Error(w, "sidecar upstream error: "+err.Error(), http.StatusBadGateway)
	}
	origDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		origDirector(req)
		req.Host = up.Host
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if policy.IsModelsEndpoint(path) && r.Method == http.MethodGet {
			s.handleModels(w, r, up)
			return
		}
		// Let CPA's normal auth/plugin chain handle non-model requests. Calling
		// Store.Authenticate here would pre-consume RPM/cost gates and then CPA
		// would authenticate the same downstream key again after proxying.
		proxy.ServeHTTP(w, r)
	})

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.srv != nil {
		return fmt.Errorf("sidecar: already started")
	}
	s.srv = &http.Server{
		Addr:              listen,
		Handler:           handler,
		ReadHeaderTimeout: 30 * time.Second,
	}
	ln, err := net.Listen("tcp", listen)
	if err != nil {
		s.srv = nil
		return err
	}
	s.addr = ln.Addr().String()
	go func() {
		_ = s.srv.Serve(ln)
	}()
	return nil
}

func (s *Server) Addr() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.addr
}

func (s *Server) Stop(ctx context.Context) error {
	s.mu.Lock()
	srv := s.srv
	s.srv = nil
	s.addr = ""
	s.mu.Unlock()
	if srv == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	return srv.Shutdown(ctx)
}

func (s *Server) handleModels(w http.ResponseWriter, r *http.Request, up *url.URL) {
	rawKey := policy.ExtractAPIKey(r.Header, r.URL.Query())
	key := s.store.FindByAPIKey(rawKey)
	if key == nil || !key.Enabled {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Build unique alias info from the key's resolved Models. Each alias maps
	// to one or more target models; we expose one entry per unique alias name
	// (what the client uses to make requests). A multi-target alias like
	// "test" (→ z-ai/glm-5.2, glm-5.2) produces a single entry with id="test".
	aliasSeen := make(map[string]int) // lowercased alias → index in aliasInfos
	var aliasInfos []AliasModelInfo
	for _, m := range key.Models {
		alias := strings.TrimSpace(m.Alias)
		if alias == "" {
			continue
		}
		if idx, dup := aliasSeen[strings.ToLower(alias)]; dup {
			aliasInfos[idx].TargetModels = append(aliasInfos[idx].TargetModels, m.TargetModel)
			continue
		}
		aliasSeen[strings.ToLower(alias)] = len(aliasInfos)
		aliasInfos = append(aliasInfos, AliasModelInfo{
			Alias:        alias,
			TargetModels: []string{m.TargetModel},
		})
	}

	upURL := *up
	upURL.Path = r.URL.Path
	upURL.RawQuery = modelListRawQuery(r.URL.Query(), s.cfg.ModelsAPIKey)
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, upURL.String(), nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	copyModelListHeaders(req.Header, r.Header, s.cfg.ModelsAPIKey)

	resp, err := s.client.Do(req)
	if err != nil {
		http.Error(w, "upstream: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	if resp.StatusCode != http.StatusOK {
		for k, vv := range resp.Header {
			for _, v := range vv {
				w.Header().Add(k, v)
			}
		}
		w.WriteHeader(resp.StatusCode)
		_, _ = w.Write(body)
		return
	}

	body, err = decodeResponseBody(resp.Header, body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	filtered, err := SynthesizeModelsResponse(body, aliasInfos)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(filtered)
}

func copyModelListHeaders(dst, src http.Header, modelsAPIKey string) {
	for k, vv := range src {
		if strings.EqualFold(k, "Host") || strings.EqualFold(k, "Accept-Encoding") {
			continue
		}
		if strings.TrimSpace(modelsAPIKey) != "" && isAuthHeader(k) {
			continue
		}
		for _, v := range vv {
			dst.Add(k, v)
		}
	}
	dst.Set("Accept-Encoding", "identity")
	if key := strings.TrimSpace(modelsAPIKey); key != "" {
		dst.Set("Authorization", "Bearer "+key)
	}
}

func modelListRawQuery(query url.Values, modelsAPIKey string) string {
	if strings.TrimSpace(modelsAPIKey) != "" {
		query.Del("api_key")
		query.Del("key")
	}
	return query.Encode()
}

func isAuthHeader(name string) bool {
	for _, candidate := range []string{"Authorization", "X-API-Key", "api-key", "x-api-key", "x-goog-api-key"} {
		if strings.EqualFold(name, candidate) {
			return true
		}
	}
	return false
}

func decodeResponseBody(headers http.Header, body []byte) ([]byte, error) {
	if !strings.EqualFold(strings.TrimSpace(headers.Get("Content-Encoding")), "gzip") {
		return body, nil
	}
	zr, err := gzip.NewReader(bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	defer zr.Close()
	return io.ReadAll(io.LimitReader(zr, 32<<20))
}
