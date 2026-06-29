package policy

import (
	"net/http"
	"path/filepath"
	"testing"
)

func newTestStore(t *testing.T) (*Store, string) {
	t.Helper()
	plain := "cpa_test_key"
	hash, err := HashKey(plain)
	if err != nil {
		t.Fatal(err)
	}
	store := NewStore()
	err = store.Configure(Config{
		Enabled:   true,
		StateFile: filepath.Join(t.TempDir(), "state.json"),
		Keys: []KeyConfig{
			{
				ID:         "team-a",
				Name:       "Team A",
				Enabled:    true,
				KeyHash:    hash,
				KeyPreview: PreviewKey(plain),
				RPM:        1,
				Models: []ModelRule{
					{Alias: "fast", Provider: "codex", TargetModel: "gpt-5-codex"},
				},
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	return store, plain
}

func TestStoreAuthenticateUnknownKeyFallsThrough(t *testing.T) {
	store, _ := newTestStore(t)
	decision := store.Authenticate("POST", "/v1/chat/completions", http.Header{"Authorization": {"Bearer other"}}, nil, []byte(`{"model":"fast"}`))
	if decision.Known || decision.Allowed {
		t.Fatalf("decision = %+v, want unknown fallthrough", decision)
	}
}

func TestStoreAuthenticateAllowedAndRoute(t *testing.T) {
	store, plain := newTestStore(t)
	headers := http.Header{"Authorization": {"Bearer " + plain}}
	decision := store.Authenticate("POST", "/v1/chat/completions", headers, nil, []byte(`{"model":"fast"}`))
	if !decision.Known || !decision.Allowed || decision.Rule.TargetModel != "gpt-5-codex" {
		t.Fatalf("decision = %+v, want allowed", decision)
	}
	rule, keyID, ok := store.Route(headers, nil, "fast")
	if !ok || keyID != "team-a" || rule.Provider != "codex" {
		t.Fatalf("Route() = %+v, %q, %v", rule, keyID, ok)
	}
}

func TestStoreAuthenticateRejectsUnauthorizedModel(t *testing.T) {
	store, plain := newTestStore(t)
	decision := store.Authenticate("POST", "/v1/chat/completions", http.Header{"Authorization": {"Bearer " + plain}}, nil, []byte(`{"model":"slow"}`))
	if !decision.Known || decision.Allowed || decision.Reason != "model_not_allowed" {
		t.Fatalf("decision = %+v, want model_not_allowed", decision)
	}
}

func TestStoreAuthenticateRejectsModelsEndpoint(t *testing.T) {
	store, plain := newTestStore(t)
	decision := store.Authenticate("GET", "/v1/models", http.Header{"Authorization": {"Bearer " + plain}}, nil, nil)
	if !decision.Known || decision.Allowed || decision.Reason != "models_endpoint_disabled" {
		t.Fatalf("decision = %+v, want models endpoint denied", decision)
	}
}

func TestStoreAuthenticateRateLimits(t *testing.T) {
	store, plain := newTestStore(t)
	headers := http.Header{"Authorization": {"Bearer " + plain}}
	_ = store.Authenticate("POST", "/v1/chat/completions", headers, nil, []byte(`{"model":"fast"}`))
	decision := store.Authenticate("POST", "/v1/chat/completions", headers, nil, []byte(`{"model":"fast"}`))
	if !decision.RateLimited || decision.Allowed {
		t.Fatalf("decision = %+v, want rate limited", decision)
	}
}
