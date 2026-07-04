package sidecar

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"cpa-key-policy/internal/policy"
)

func TestServerModelsFiltered(t *testing.T) {
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/models" {
			http.NotFound(w, r)
			return
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
		Enabled: true,
		Keys: []policy.KeyConfig{{
			ID: "k1", Enabled: true, KeyHash: hash,
			Models: []policy.ModelRule{{Alias: "allowed-a", Provider: "openai", TargetModel: "gpt"}},
		}},
	}); err != nil {
		t.Fatal(err)
	}

	srv := New(Config{Enabled: true, Listen: "127.0.0.1:0", Upstream: up.URL}, store)
	if err := srv.Start(); err != nil {
		t.Fatal(err)
	}
	addr := srv.Addr()
	if addr == "" {
		t.Fatal("sidecar addr empty")
	}
	defer func() { _ = srv.Stop(context.Background()) }()

	req, _ := http.NewRequest(http.MethodGet, "http://"+addr+"/v1/models", nil)
	req.Header.Set("Authorization", "Bearer cpa_test_secret_key_12345")
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

func TestServerModelsUnauthorized(t *testing.T) {
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer up.Close()
	store := policy.NewStore()
	_ = store.Configure(policy.Config{Enabled: true})

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