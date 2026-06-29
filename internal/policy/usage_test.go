package policy

import (
	"path/filepath"
	"testing"
	"time"
)

func newClockedStore(t *testing.T, now time.Time) (*Store, time.Time) {
	t.Helper()
	tm := now
	store := NewStore()
	store.SetClock(func() time.Time { return tm })
	err := store.Configure(Config{
		Enabled:   true,
		StateFile: filepath.Join(t.TempDir(), "state.json"),
		Keys: []KeyConfig{
			{
				ID: "team-a", Enabled: true,
				KeyHash:    hashForUsageTest(t, "cpa_usage"),
				KeyPreview: "cpa_us..._age",
				Models: []ModelRule{
					{Alias: "fast", Provider: "codex", TargetModel: "gpt-5-codex",
						InputPricePerMillion: 1, OutputPricePerMillion: 2},
				},
				DailyLimitUSD:  1.00,
				WeeklyLimitUSD: 5.00,
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	return store, tm
}

func hashForUsageTest(t *testing.T, key string) string {
	t.Helper()
	h, err := HashKey(key)
	if err != nil {
		t.Fatal(err)
	}
	return h
}

func TestUsageRecordAndOverLimitDaily(t *testing.T) {
	now := time.Date(2026, 6, 29, 10, 0, 0, 0, time.UTC)
	store, tm := newClockedStore(t, now)
	headers := map[string][]string{"Authorization": {"Bearer cpa_usage"}}

	// 500K prompt × $1/M = $0.50 → under the $1 daily limit.
	_ = store.RecordResponseCost(headers, nil, "fast", []byte(`{"usage":{"prompt_tokens":500000,"completion_tokens":0}}`))
	d := store.Authenticate("POST", "/v1/chat/completions", headers, nil, []byte(`{"model":"fast"}`))
	if !d.Allowed {
		t.Fatalf("first request should be allowed: %+v", d)
	}
	// Another $0.50 → total $1.00, equals the daily limit. Billing is
	// post-hoc: this request itself was allowed (the prior Authenticate
	// passed), but the NEXT request now sees daily_usd >= limit and is
	// rejected (Authenticate is a pre-request gate on accumulated usage).
	_ = store.RecordResponseCost(headers, nil, "fast", []byte(`{"usage":{"prompt_tokens":500000,"completion_tokens":0}}`))
	d = store.Authenticate("POST", "/v1/chat/completions", headers, nil, []byte(`{"model":"fast"}`))
	if d.Allowed || !d.CostLimited || d.Reason != "daily_exceeded" {
		t.Fatalf("at-limit request should be rejected on the next Authenticate: %+v", d)
	}
	// Crossing UTC midnight resets the daily window.
	tm = tm.Add(14 * time.Hour) // next day
	store.SetClock(func() time.Time { return tm })
	d = store.Authenticate("POST", "/v1/chat/completions", headers, nil, []byte(`{"model":"fast"}`))
	if !d.Allowed {
		t.Fatalf("after midnight should be allowed again: %+v", d)
	}
}

func TestUsageUnlimitedKeyNeverBlocked(t *testing.T) {
	now := time.Date(2026, 6, 29, 10, 0, 0, 0, time.UTC)
	store := NewStore()
	store.SetClock(func() time.Time { return now })
	err := store.Configure(Config{
		Enabled:   true,
		StateFile: filepath.Join(t.TempDir(), "state.json"),
		Keys: []KeyConfig{{
			ID: "free", Enabled: true,
			KeyHash: hashForUsageTest(t, "cpa_free"),
			Models: []ModelRule{{Alias: "fast", Provider: "codex", TargetModel: "gpt-5-codex",
				InputPricePerMillion: 10, OutputPricePerMillion: 10}},
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	hdr := map[string][]string{"Authorization": {"Bearer cpa_free"}}
	for i := 0; i < 50; i++ {
		_ = store.RecordResponseCost(hdr, nil, "fast", []byte(`{"usage":{"prompt_tokens":1000000,"completion_tokens":1000000}}`))
		d := store.Authenticate("POST", "/v1/chat/completions", hdr, nil, []byte(`{"model":"fast"}`))
		if !d.Allowed {
			t.Fatalf("unlimited key blocked at iter %d: %+v", i, d)
		}
	}
}

func TestUsageUnpricedAliasNotBilled(t *testing.T) {
	now := time.Date(2026, 6, 29, 10, 0, 0, 0, time.UTC)
	store := NewStore()
	store.SetClock(func() time.Time { return now })
	err := store.Configure(Config{
		Enabled:   true,
		StateFile: filepath.Join(t.TempDir(), "state.json"),
		Keys: []KeyConfig{{
			ID: "cheap", Enabled: true, DailyLimitUSD: 0.01,
			KeyHash: hashForUsageTest(t, "cpa_cheap"),
			Models: []ModelRule{{Alias: "fast", Provider: "codex", TargetModel: "gpt-5-codex"}}, // no prices
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	hdr := map[string][]string{"Authorization": {"Bearer cpa_cheap"}}
	_ = store.RecordResponseCost(hdr, nil, "fast", []byte(`{"usage":{"prompt_tokens":99999999,"completion_tokens":99999999}}`))
	d := store.Authenticate("POST", "/v1/chat/completions", hdr, nil, []byte(`{"model":"fast"}`))
	if !d.Allowed {
		t.Fatalf("unpriced alias should never exceed: %+v", d)
	}
}

func TestUsageStreamingBilledWhenUsageFrame(t *testing.T) {
	now := time.Date(2026, 6, 29, 10, 0, 0, 0, time.UTC)
	store := NewStore()
	store.SetClock(func() time.Time { return now })
	err := store.Configure(Config{
		Enabled:   true,
		StateFile: filepath.Join(t.TempDir(), "state.json"),
		Keys: []KeyConfig{{
			ID: "streamy", Enabled: true, DailyLimitUSD: 0.01,
			KeyHash: hashForUsageTest(t, "cpa_stream"),
			Models: []ModelRule{{Alias: "fast", Provider: "codex", TargetModel: "gpt-5-codex",
				InputPricePerMillion: 1, OutputPricePerMillion: 1}},
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	hdr := map[string][]string{"Authorization": {"Bearer cpa_stream"}}

	// A streaming response whose host passed us an SSE body WITH a final usage
	// frame is billed (post-hoc billing applies to streams too).
	sse := []byte("data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\ndata: {\"usage\":{\"prompt_tokens\":1000000,\"completion_tokens\":0}}\n\ndata: [DONE]\n\n")
	_ = store.RecordResponseCost(hdr, nil, "fast", sse)
	d := store.Authenticate("POST", "/v1/chat/completions", hdr, nil, []byte(`{"model":"fast"}`))
	// 1M tokens × $1/M = $1.00 >= $0.01 limit → rejected.
	if d.Allowed || !d.CostLimited || d.Reason != "daily_exceeded" {
		t.Fatalf("streaming with usage frame should be billed & blocked: %+v", d)
	}

	// A streaming body the host passes WITHOUT any usage frame is not billed.
	store2 := NewStore()
	store2.SetClock(func() time.Time { return now })
	if err := store2.Configure(Config{
		Enabled: true, StateFile: filepath.Join(t.TempDir(), "state2.json"),
		Keys: []KeyConfig{{
			ID: "streamy2", Enabled: true, DailyLimitUSD: 0.01,
			KeyHash: hashForUsageTest(t, "cpa_stream2"),
			Models: []ModelRule{{Alias: "fast", Provider: "codex", TargetModel: "gpt-5-codex",
				InputPricePerMillion: 1, OutputPricePerMillion: 1}},
		}},
	}); err != nil {
		t.Fatal(err)
	}
	hdr2 := map[string][]string{"Authorization": {"Bearer cpa_stream2"}}
	_ = store2.RecordResponseCost(hdr2, nil, "fast", nil)
	_ = store2.RecordResponseCost(hdr2, nil, "fast", []byte(`data: {"delta":"hi"}`))
	d = store2.Authenticate("POST", "/v1/chat/completions", hdr2, nil, []byte(`{"model":"fast"}`))
	if !d.Allowed {
		t.Fatalf("streaming without usage frame should not be billed: %+v", d)
	}
}

func TestUsageSummaryReflectsUsage(t *testing.T) {
	now := time.Date(2026, 6, 29, 10, 0, 0, 0, time.UTC)
	store, _ := newClockedStore(t, now)
	hdr := map[string][]string{"Authorization": {"Bearer cpa_usage"}}
	_ = store.RecordResponseCost(hdr, nil, "fast", []byte(`{"usage":{"prompt_tokens":200000,"completion_tokens":100000}}`))
	keys := store.Keys()
	var key KeyConfig
	for _, k := range keys {
		if k.ID == "team-a" {
			key = k
		}
	}
	s := store.UsageSummaryFor(key)
	// 200K×$1/M + 100K×$2/M = $0.20 + $0.20 = $0.40
	if !nearly(s.DailyUSD, 0.40) || !nearly(s.WeeklyUSD, 0.40) {
		t.Fatalf("summary = %+v, want 0.40/0.40", s)
	}
	if s.DailyLimitUSD != 1.0 || s.WeeklyLimitUSD != 5.0 {
		t.Fatalf("limits = %+v", s)
	}
	if s.DailyResetAt.IsZero() {
		t.Fatal("daily_reset_at should be set")
	}
}

func TestUsagePersistsAcrossRestart(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "state.json")
	mk := func(clock func() time.Time) *Store {
		s := NewStore()
		s.SetClock(clock)
		if err := s.Configure(Config{
			Enabled: true, StateFile: path,
			Keys: []KeyConfig{{
				ID: "team-a", Enabled: true, DailyLimitUSD: 1.0,
				KeyHash: hashForUsageTest(t, "cpa_usage"),
				Models: []ModelRule{{Alias: "fast", Provider: "codex", TargetModel: "gpt-5-codex",
					InputPricePerMillion: 1, OutputPricePerMillion: 0}},
			}},
		}); err != nil {
			t.Fatal(err)
		}
		return s
	}
	now := time.Date(2026, 6, 29, 10, 0, 0, 0, time.UTC)
	s1 := mk(func() time.Time { return now })
	hdr := map[string][]string{"Authorization": {"Bearer cpa_usage"}}
	_ = s1.RecordResponseCost(hdr, nil, "fast", []byte(`{"usage":{"prompt_tokens":800000,"completion_tokens":0}}`))
	if err := s1.FlushUsage(); err != nil {
		t.Fatal(err)
	}

	// "Restart": a fresh store loads from the same state file.
	s2 := mk(func() time.Time { return now })
	keys := s2.Keys()
	var key KeyConfig
	for _, k := range keys {
		if k.ID == "team-a" {
			key = k
		}
	}
	s := s2.UsageSummaryFor(key)
	if !nearly(s.DailyUSD, 0.80) {
		t.Fatalf("usage after restart = %+v, want 0.80", s)
	}
	// Over-limit is enforced post-restart (0.80 < 1.0, allowed; then bill to >1).
	d := s2.Authenticate("POST", "/v1/chat/completions", hdr, nil, []byte(`{"model":"fast"}`))
	if !d.Allowed {
		t.Fatalf("should be allowed at 0.80/1.0: %+v", d)
	}
}
