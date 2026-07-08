package sidecar

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"cpa-key-policy/internal/policy"
)

func TestServerModelsFiltered(t *testing.T) {
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/models" {
			http.NotFound(w, r)
			return
		}
		if got := r.Header.Get("Authorization"); got != "Bearer cpa_admin_models_key" {
			t.Fatalf("upstream auth = %q, want models key", got)
		}
		if got := r.URL.Query().Get("api_key"); got != "" {
			t.Fatalf("upstream api_key query leaked: %q", got)
		}
		if got := r.URL.Query().Get("client_version"); got != "test-client" {
			t.Fatalf("client_version = %q, want preserved", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"object":"list","data":[{"id":"allowed-a"},{"id":"blocked"}]}`))
	}))
	defer up.Close()

	hash, err := policy.HashKey("cpa_test_secret_key_12345")
	if err != nil {
		t.Fatal(err)
	}
	store := policy.NewStore()
	if err := store.Configure(policy.Config{
		Enabled:   true,
		StateFile: filepath.Join(t.TempDir(), "state.json"),
		Keys: []policy.KeyConfig{{
			ID: "k1", Enabled: true, KeyHash: hash,
			Models: []policy.ModelRule{{Alias: "allowed-a", Provider: "openai", TargetModel: "gpt"}},
		}},
	}); err != nil {
		t.Fatal(err)
	}

	srv := New(Config{Enabled: true, Listen: "127.0.0.1:0", Upstream: up.URL, ModelsAPIKey: "cpa_admin_models_key"}, store)
	if err := srv.Start(); err != nil {
		t.Fatal(err)
	}
	addr := srv.Addr()
	if addr == "" {
		t.Fatal("sidecar addr empty")
	}
	defer func() { _ = srv.Stop(context.Background()) }()

	req, _ := http.NewRequest(http.MethodGet, "http://"+addr+"/v1/models?api_key=cpa_test_secret_key_12345&client_version=test-client", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("status %d body %s", resp.StatusCode, b)
	}
	body, _ := io.ReadAll(resp.Body)
	var list openAIModelsList
	if err := json.Unmarshal(body, &list); err != nil {
		t.Fatal(err)
	}
	if len(list.Data) != 1 {
		t.Fatalf("want 1 model, got %d %v", len(list.Data), list.Data)
	}
	if list.Data[0]["id"] != "allowed-a" {
		t.Fatalf("want allowed-a, got %v", list.Data[0]["id"])
	}
}

func TestServerModelsFiltersGzipUpstream(t *testing.T) {
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var buf bytes.Buffer
		zw := gzip.NewWriter(&buf)
		_, _ = zw.Write([]byte(`{"object":"list","data":[{"id":"allowed"},{"id":"blocked"}]}`))
		_ = zw.Close()
		w.Header().Set("Content-Encoding", "gzip")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(buf.Bytes())
	}))
	defer up.Close()

	hash, err := policy.HashKey("cpa_test_secret_key_12345")
	if err != nil {
		t.Fatal(err)
	}
	store := policy.NewStore()
	if err := store.Configure(policy.Config{
		Enabled:   true,
		StateFile: filepath.Join(t.TempDir(), "state.json"),
		Keys: []policy.KeyConfig{{
			ID: "k1", Enabled: true, KeyHash: hash,
			Models: []policy.ModelRule{{Alias: "allowed", Provider: "openai", TargetModel: "gpt"}},
		}},
	}); err != nil {
		t.Fatal(err)
	}

	srv := New(Config{Enabled: true, Listen: "127.0.0.1:0", Upstream: up.URL}, store)
	if err := srv.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = srv.Stop(context.Background()) }()

	req, _ := http.NewRequest(http.MethodGet, "http://"+srv.Addr()+"/v1/models", nil)
	req.Header.Set("Authorization", "Bearer cpa_test_secret_key_12345")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var list openAIModelsList
	if err := json.Unmarshal(body, &list); err != nil {
		t.Fatal(err)
	}
	if len(list.Data) != 1 || list.Data[0]["id"] != "allowed" {
		t.Fatalf("unexpected filtered list: %v", list.Data)
	}
}

func TestServerModelsUnauthorized(t *testing.T) {
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer up.Close()
	store := policy.NewStore()
	_ = store.Configure(policy.Config{Enabled: true, StateFile: filepath.Join(t.TempDir(), "state.json")})

	srv := New(Config{Enabled: true, Listen: "127.0.0.1:0", Upstream: up.URL}, store)
	if err := srv.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = srv.Stop(context.Background()) }()

	req, _ := http.NewRequest(http.MethodGet, "http://"+srv.Addr()+"/v1/models", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("want 401, got %d", resp.StatusCode)
	}
}

func TestServerNonModelsRequestProxiesWithoutLocalAuth(t *testing.T) {
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" {
			http.NotFound(w, r)
			return
		}
		if got := r.Header.Get("Authorization"); got != "Bearer downstream" {
			t.Fatalf("authorization = %q, want downstream key", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer up.Close()

	store := policy.NewStore()
	_ = store.Configure(policy.Config{Enabled: true, StateFile: filepath.Join(t.TempDir(), "state.json")})
	srv := New(Config{Enabled: true, Listen: "127.0.0.1:0", Upstream: up.URL}, store)
	if err := srv.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = srv.Stop(context.Background()) }()

	req, _ := http.NewRequest(http.MethodPost, "http://"+srv.Addr()+"/v1/chat/completions", strings.NewReader(`{"model":"fast"}`))
	req.Header.Set("Authorization", "Bearer downstream")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
}

func TestServerModelsSynthesizesAliasNotInUpstream(t *testing.T) {
	// Regression: when a key's alias name differs from the target model name
	// (e.g., alias "test" → target "z-ai/glm-5.2"), the sidecar must still show
	// the alias in /v1/models. The old FilterModelsResponse filtered by alias
	// name and found nothing in the upstream list → empty response.
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"object":"list","data":[{"id":"z-ai/glm-5.2","object":"model","owned_by":"nvidia"},{"id":"glm-5.2","object":"model","owned_by":"opencode"},{"id":"gemma-4-31b","object":"model","owned_by":"cerebras"}]}`))
	}))
	defer up.Close()

	hash, err := policy.HashKey("cpa_alias_test_key")
	if err != nil {
		t.Fatal(err)
	}
	store := policy.NewStore()
	if err := store.Configure(policy.Config{
		Enabled:   true,
		StateFile: filepath.Join(t.TempDir(), "state.json"),
		Keys: []policy.KeyConfig{{
			ID: "k1", Enabled: true, KeyHash: hash,
			// Alias "test" with 2 targets (alias ≠ target_model).
			Models: []policy.ModelRule{
				{Alias: "test", Provider: "nvidia", TargetModel: "z-ai/glm-5.2"},
				{Alias: "test", Provider: "opencode", TargetModel: "glm-5.2"},
				// Simple alias (alias = target_model).
				{Alias: "gemma-4-31b", Provider: "cerebras", TargetModel: "gemma-4-31b"},
			},
		}},
	}); err != nil {
		t.Fatal(err)
	}

	srv := New(Config{Enabled: true, Listen: "127.0.0.1:0", Upstream: up.URL}, store)
	if err := srv.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = srv.Stop(context.Background()) }()

	req, _ := http.NewRequest(http.MethodGet, "http://"+srv.Addr()+"/v1/models", nil)
	req.Header.Set("Authorization", "Bearer cpa_alias_test_key")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status %d body %s", resp.StatusCode, body)
	}
	var list openAIModelsList
	if err := json.Unmarshal(body, &list); err != nil {
		t.Fatal(err)
	}
	// Should have 2 entries: "test" (synthesized from first target) and
	// "gemma-4-31b" (direct from upstream). NOT "z-ai/glm-5.2" or "glm-5.2".
	if len(list.Data) != 2 {
		t.Fatalf("want 2 models (test + gemma-4-31b), got %d: %v", len(list.Data), list.Data)
	}
	ids := map[string]bool{}
	for _, m := range list.Data {
		ids[m["id"].(string)] = true
	}
	if !ids["test"] || !ids["gemma-4-31b"] {
		t.Fatalf("want ids {test, gemma-4-31b}, got %v", ids)
	}
}
