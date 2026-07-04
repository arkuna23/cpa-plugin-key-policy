package sidecar

import (
	"encoding/json"
	"testing"
)

func TestFilterModelsResponse(t *testing.T) {
	upstream := `{"object":"list","data":[{"id":"gpt-a","object":"model"},{"id":"gpt-b","object":"model"},{"id":"other","object":"model"}]}`
	out, err := FilterModelsResponse([]byte(upstream), []string{"gpt-b", "GPT-A"})
	if err != nil {
		t.Fatal(err)
	}
	var parsed openAIModelsList
	if err := json.Unmarshal(out, &parsed); err != nil {
		t.Fatal(err)
	}
	if len(parsed.Data) != 2 {
		t.Fatalf("want 2 models, got %d", len(parsed.Data))
	}
	ids := map[string]bool{}
	for _, m := range parsed.Data {
		ids[m["id"].(string)] = true
	}
	if !ids["gpt-a"] || !ids["gpt-b"] || ids["other"] {
		t.Fatalf("unexpected ids: %v", ids)
	}
}

func TestFilterModelsResponseEmptyAllow(t *testing.T) {
	out, err := FilterModelsResponse([]byte(`{"data":[{"id":"x"}]}`), nil)
	if err != nil {
		t.Fatal(err)
	}
	var parsed openAIModelsList
	json.Unmarshal(out, &parsed)
	if len(parsed.Data) != 0 {
		t.Fatalf("want empty data, got %v", parsed.Data)
	}
}

func TestFilterModelsResponseInvalidJSONPassthrough(t *testing.T) {
	raw := []byte("not json")
	out, err := FilterModelsResponse(raw, []string{"a"})
	if err != nil {
		t.Fatal(err)
	}
	if string(out) != string(raw) {
		t.Fatalf("want passthrough, got %q", out)
	}
}