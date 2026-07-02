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

// perCallImageStore builds a store with one per_call-billed image alias, used
// to exercise the access-time pre-charge for image/video endpoints.
func perCallImageStore(t *testing.T) (*Store, string) {
	t.Helper()
	plain := "cpa_image_key"
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
				ID:      "img-team",
				Name:    "Image Team",
				Enabled: true,
				KeyHash: hash,
				Models: []ModelRule{
					{Alias: "grok-imagine-image-quality", Provider: "xai", TargetModel: "grok-imagine-image-quality", BillingMode: "per_call", PerCallUSD: 2},
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

// imgTeamKey returns the configured KeyConfig for the per_call image test key.
func imgTeamKey(store *Store) KeyConfig {
	k := store.findByID("img-team")
	if k == nil {
		panic("img-team key not found")
	}
	return *k
}

func TestAuthenticatePerCallImagePreCharged(t *testing.T) {
	store, plain := perCallImageStore(t)
	headers := http.Header{"Authorization": {"Bearer " + plain}}
	decision := store.Authenticate("POST", "/v1/images/generations", headers, nil, []byte(`{"model":"grok-imagine-image-quality","prompt":"a boat"}`))
	if !decision.Allowed || !decision.PreCharged {
		t.Fatalf("decision = %+v, want Allowed+PreCharged", decision)
	}
	sum := store.UsageSummaryFor(imgTeamKey(store))
	if sum.DailyUSD != 2 || sum.DailyCallCount != 1 {
		t.Fatalf("summary = %+v, want DailyUSD=2, DailyCallCount=1", sum)
	}
}

func TestAuthenticatePerCallVideoPreCharged(t *testing.T) {
	store, plain := perCallImageStore(t)
	headers := http.Header{"Authorization": {"Bearer " + plain}}
	body := []byte(`{"model":"grok-imagine-image-quality","prompt":"a clip"}`)
	// Path-parameter video subresource (/v1/videos/<id>) must also pre-charge.
	decision := store.Authenticate("GET", "/v1/videos/req_123", headers, nil, body)
	if !decision.Allowed || !decision.PreCharged {
		t.Fatalf("decision = %+v, want Allowed+PreCharged on video subresource", decision)
	}
	sum := store.UsageSummaryFor(imgTeamKey(store))
	if sum.DailyUSD != 2 {
		t.Fatalf("summary.DailyUSD = %v, want 2", sum.DailyUSD)
	}
}

func TestAuthenticatePerCallChatNotPreCharged(t *testing.T) {
	store, plain := perCallImageStore(t)
	headers := http.Header{"Authorization": {"Bearer " + plain}}
	// Same per_call alias, but on a chat endpoint — must NOT pre-charge. Chat
	// is billed via usage.handle (CPA emits a record there), and pre-charging
	// would double-bill.
	decision := store.Authenticate("POST", "/v1/chat/completions", headers, nil, []byte(`{"model":"grok-imagine-image-quality"}`))
	if !decision.Allowed || decision.PreCharged {
		t.Fatalf("decision = %+v, want Allowed and NOT PreCharged on chat path", decision)
	}
	sum := store.UsageSummaryFor(imgTeamKey(store))
	if sum.DailyUSD != 0 {
		t.Fatalf("summary.DailyUSD = %v, want 0 (chat not pre-charged)", sum.DailyUSD)
	}
}

func TestAuthenticateTokenModeImageNotPreCharged(t *testing.T) {
	store, plain := perCallImageStore(t)
	headers := http.Header{"Authorization": {"Bearer " + plain}}
	// Image endpoint, but the alias is token-billed ("fast") — pre-charge only
	// applies to per_call aliases. Token-mode images would be billed by tokens
	// if CPA reported usage, and pre-charging a fixed USD would be wrong.
	decision := store.Authenticate("POST", "/v1/images/generations", headers, nil, []byte(`{"model":"fast","prompt":"x"}`))
	if !decision.Allowed || decision.PreCharged {
		t.Fatalf("decision = %+v, want Allowed and NOT PreCharged for token-mode alias", decision)
	}
	sum := store.UsageSummaryFor(imgTeamKey(store))
	if sum.DailyUSD != 0 {
		t.Fatalf("summary.DailyUSD = %v, want 0 (token mode not pre-charged)", sum.DailyUSD)
	}
}

func TestIsImageVideoEndpoint(t *testing.T) {
	cases := []struct {
		path string
		want bool
	}{
		{"/v1/images/generations", true},
		{"/v1/images/edits", true},
		{"/openai/v1/images/generations", true},
		{"/v1/videos", true},
		{"/v1/videos/generations", true},
		{"/v1/videos/req_abc", true},
		{"/openai/v1/videos/extensions", true},
		{"/v1/chat/completions", false},
		{"/v1/models", false},
		{"/v1/responses", false},
		{"", false},
	}
	for _, c := range cases {
		if got := IsImageVideoEndpoint(c.path); got != c.want {
			t.Errorf("IsImageVideoEndpoint(%q) = %v, want %v", c.path, got, c.want)
		}
	}
}
