package policy

import "testing"

func TestQuotaModeNormalizationAndValidation(t *testing.T) {
	cfg := Config{Keys: []KeyConfig{{ID: "legacy"}}}
	if err := normalizeConfig(&cfg); err != nil {
		t.Fatal(err)
	}
	if cfg.Keys[0].QuotaMode != QuotaModePeriodic {
		t.Fatalf("legacy quota mode = %q, want %q", cfg.Keys[0].QuotaMode, QuotaModePeriodic)
	}

	badMode := Config{Keys: []KeyConfig{{ID: "bad", QuotaMode: "rolling"}}}
	if err := normalizeConfig(&badMode); err == nil {
		t.Fatal("unknown quota mode should be rejected")
	}

	badLimit := Config{Keys: []KeyConfig{{ID: "bad-limit", QuotaMode: QuotaModeFixed, FixedLimitUSD: -1}}}
	if err := normalizeConfig(&badLimit); err == nil {
		t.Fatal("negative fixed limit should be rejected")
	}
}

func TestFixedUsageSurvivesModeSwitchAndFreezesInPeriodicMode(t *testing.T) {
	store := NewStore()
	store.usage.RecordCost("switch", "fast", 1, 0, 0, 0, 0, 1, true)

	fixed := KeyConfig{ID: "switch", QuotaMode: QuotaModeFixed, FixedLimitUSD: 5}
	if got := store.usage.Summary(fixed).FixedUSD; got != 1 {
		t.Fatalf("initial fixed total = %v, want 1", got)
	}

	store.usage.RecordCost("switch", "fast", 2, 0, 0, 0, 0, 1)
	periodic := KeyConfig{ID: "switch", QuotaMode: QuotaModePeriodic, DailyLimitUSD: 10}
	if got := store.usage.Summary(periodic).FixedUSD; got != 1 {
		t.Fatalf("fixed total changed in periodic mode: %v", got)
	}
	if got := store.usage.Summary(fixed).FixedUSD; got != 1 {
		t.Fatalf("fixed total was not preserved when switching back: %v", got)
	}
}
