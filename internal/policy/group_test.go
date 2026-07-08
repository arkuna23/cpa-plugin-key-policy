package policy

import (
	"encoding/json"
	"net/http"
	"path/filepath"
	"testing"
)

// ModelRule.Group is an optional field: legacy state/config without it must
// round-trip as an empty string (no tier narrowing), and a config that sets it
// must normalize it (trim + lowercase) and survive YAML decode + state JSON
// save/load.
func TestModelRuleGroupRoundTrip(t *testing.T) {
	yaml := []byte(`
enabled: true
state_file: "` + filepath.ToSlash(filepath.Join(t.TempDir(), "state.json")) + `"
keys:
  - id: k
    enabled: true
    key_hash: x
    models:
      - alias: fast
        provider: Codex
        target_model: gpt-5-codex
        group: TEAM
      - alias: any
        provider: codex
        target_model: gpt-5-codex
`)
	cfg, err := DecodeConfig(yaml)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	// Migration: per-key Models are promoted to the global alias table.
	// The key now references aliases by name (Models is empty, Aliases has refs).
	if len(cfg.Keys) != 1 || len(cfg.Keys[0].Aliases) != 2 {
		t.Fatalf("unexpected decode: %+v", cfg)
	}
	if len(cfg.Aliases) != 2 {
		t.Fatalf("expected 2 global aliases, got %d", len(cfg.Aliases))
	}
	// Find the "fast" alias and check its target's group was normalized.
	var fastAlias *AliasMapping
	for i := range cfg.Aliases {
		if cfg.Aliases[i].Alias == "fast" {
			fastAlias = &cfg.Aliases[i]
		}
	}
	if fastAlias == nil || len(fastAlias.Targets) != 1 {
		t.Fatalf("fast alias not found or wrong targets: %+v", cfg.Aliases)
	}
	if fastAlias.Targets[0].Group != "team" {
		t.Fatalf("expected normalized group 'team', got %q", fastAlias.Targets[0].Group)
	}
	// The "any" alias should have empty group.
	var anyAlias *AliasMapping
	for i := range cfg.Aliases {
		if cfg.Aliases[i].Alias == "any" {
			anyAlias = &cfg.Aliases[i]
		}
	}
	if anyAlias == nil || anyAlias.Targets[0].Group != "" {
		t.Fatalf("expected empty group for 'any' alias, got: %+v", cfg.Aliases)
	}

	// State JSON serialization must keep group and omit empty.
	// Serialize the global alias table (the migrated form).
	out, err := json.Marshal(cfg.Aliases)
	if err != nil {
		t.Fatal(err)
	}
	var back []AliasMapping
	if err := json.Unmarshal(out, &back); err != nil {
		t.Fatal(err)
	}
	if back[0].Targets[0].Group != "team" && back[1].Targets[0].Group != "" {
		t.Fatalf("json round-trip lost group: %+v", back)
	}
}

// Group is surfaced via Authenticate's decision.Rule so the plugin can stamp it
// into request metadata for the scheduler.
func TestAuthenticateSurfacesGroup(t *testing.T) {
	store := NewStore()
	hash, _ := HashKey("k1")
	if err := store.Configure(Config{
		Enabled:   true,
		StateFile: filepath.Join(t.TempDir(), "state.json"),
		Keys: []KeyConfig{{
			ID:      "k",
			Enabled: true,
			KeyHash: hash,
			Models: []ModelRule{
				{Alias: "fast", Provider: "codex", TargetModel: "gpt-5-codex", Group: "team"},
			},
		}},
	}); err != nil {
		t.Fatal(err)
	}
	dec := store.Authenticate("POST", "/v1/chat/completions", http.Header{"Authorization": {"Bearer k1"}}, nil, []byte(`{"model":"fast"}`))
	if !dec.Allowed {
		t.Fatalf("expected allowed, got %+v", dec)
	}
	if dec.Rule.Group != "team" {
		t.Fatalf("expected group surfaced on decision, got %q", dec.Rule.Group)
	}
}
