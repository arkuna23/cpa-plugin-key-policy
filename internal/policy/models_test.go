package policy

import (
	"net/url"
	"strings"
	"testing"
)

func TestExtractRequestedModel(t *testing.T) {
	cases := []struct {
		name  string
		path  string
		query url.Values
		body  []byte
		want  string
	}{
		{
			name: "openai body",
			body: []byte(`{"model":"fast","messages":[]}`),
			want: "fast",
		},
		{
			name: "nested body",
			body: []byte(`{"request":{"model":"nested"}}`),
			want: "nested",
		},
		{
			name: "query model",
			query: url.Values{
				"model": []string{"query-model"},
			},
			want: "query-model",
		},
		{
			name: "gemini path",
			path: "/v1beta/models/gemini-2.5-pro:generateContent",
			want: "gemini-2.5-pro",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := ExtractRequestedModel(tc.path, tc.query, tc.body); got != tc.want {
				t.Fatalf("ExtractRequestedModel() = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestExtractRequestedModelTopLevelUsesLastDuplicate(t *testing.T) {
	body := []byte(`{"model":"first","input":"x","model":"last"}`)
	if got := ExtractRequestedModel("", nil, body); got != "last" {
		t.Fatalf("ExtractRequestedModel() = %q, want last", got)
	}
}

func TestExtractRequestedModelLargeTopLevelAvoidsBodySizedAllocation(t *testing.T) {
	body := []byte(`{"model":"fast","input":"` + strings.Repeat("x", 1<<20) + `"}`)
	if got := ExtractRequestedModel("", nil, body); got != "fast" {
		t.Fatalf("ExtractRequestedModel() = %q, want fast", got)
	}
	allocs := testing.AllocsPerRun(10, func() {
		_ = ExtractRequestedModel("", nil, body)
	})
	if allocs > 30 {
		t.Fatalf("large top-level model extraction allocated %.0f objects, want <= 30", allocs)
	}
}

func BenchmarkExtractRequestedModelLargeTopLevel(b *testing.B) {
	body := []byte(`{"model":"fast","input":"` + strings.Repeat("x", 1<<20) + `"}`)
	b.ReportAllocs()
	b.SetBytes(int64(len(body)))
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = ExtractRequestedModel("", nil, body)
	}
}

func TestIsModelsEndpoint(t *testing.T) {
	for _, path := range []string{"/v1/models", "/openai/v1/models", "/proxy/v1/models/"} {
		if !IsModelsEndpoint(path) {
			t.Fatalf("IsModelsEndpoint(%q) = false", path)
		}
	}
}

func TestRewriteTopLevelModel(t *testing.T) {
	got, ok := RewriteTopLevelModel([]byte(`{"id":"1","model":"real"}`), "alias")
	if !ok {
		t.Fatal("RewriteTopLevelModel() changed = false")
	}
	if string(got) != `{"id":"1","model":"alias"}` {
		t.Fatalf("RewriteTopLevelModel() = %s", got)
	}
}
