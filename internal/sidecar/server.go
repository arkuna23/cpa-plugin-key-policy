package sidecar

import (
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
	Enabled  bool
	Listen   string // e.g. 127.0.0.1:19090
	Upstream string // e.g. http://127.0.0.1:8317
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
		decision := s.store.Authenticate(r.Method, path, r.Header, r.URL.Query(), nil)
		if !decision.Known || !decision.Allowed {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
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
	aliases := make([]string, 0, len(key.Models))
	for _, m := range key.Models {
		if strings.TrimSpace(m.Alias) != "" {
			aliases = append(aliases, m.Alias)
		}
	}

	upURL := *up
	upURL.Path = r.URL.Path
	upURL.RawQuery = r.URL.RawQuery
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, upURL.String(), nil)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	copyHeaders(req.Header, r.Header)

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

	filtered, err := FilterModelsResponse(body, aliases)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(filtered)
}

func copyHeaders(dst, src http.Header) {
	for k, vv := range src {
		if strings.EqualFold(k, "Host") {
			continue
		}
		for _, v := range vv {
			dst.Add(k, v)
		}
	}
}