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

func TestFilterModelsResponseUpdatesPagingFields(t *testing.T) {
	upstream := `{"data":[{"id":"a"},{"id":"b"},{"id":"c"}],"has_more":true,"first_id":"a","last_id":"c"}`
	out, err := FilterModelsResponse([]byte(upstream), []string{"b"})
	if err != nil {
		t.Fatal(err)
	}
	var parsed map[string]any
	if err := json.Unmarshal(out, &parsed); err != nil {
		t.Fatal(err)
	}
	data := parsed["data"].([]any)
	if len(data) != 1 {
		t.Fatalf("want 1 model, got %d", len(data))
	}
	if got := data[0].(map[string]any)["id"]; got != "b" {
		t.Fatalf("want b, got %v", got)
	}
	if parsed["first_id"] != "b" || parsed["last_id"] != "b" || parsed["has_more"] != false {
		t.Fatalf("paging fields not updated: %v", parsed)
	}
}

func TestFilterModelsResponseCodexClientModelsShape(t *testing.T) {
	upstream := `{"models":[{"slug":"gpt-a","display_name":"A"},{"slug":"gpt-b","display_name":"B"}]}`
	out, err := FilterModelsResponse([]byte(upstream), []string{"GPT-B"})
	if err != nil {
		t.Fatal(err)
	}
	var parsed map[string][]map[string]any
	if err := json.Unmarshal(out, &parsed); err != nil {
		t.Fatal(err)
	}
	models := parsed["models"]
	if len(models) != 1 {
		t.Fatalf("want 1 model, got %d", len(models))
	}
	if models[0]["slug"] != "gpt-b" {
		t.Fatalf("want gpt-b, got %v", models[0]["slug"])
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

func TestSynthesizeModelsResponseAliasNotInUpstream(t *testing.T) {
	// Alias "test" maps to targets "z-ai/glm-5.2" and "glm-5.2", neither of
	// which is named "test". The old FilterModelsResponse would return empty
	// (no upstream entry has id="test"). SynthesizeModelsResponse should show
	// the alias name "test", enriched with metadata from the first target.
	upstream := `{"object":"list","data":[{"id":"z-ai/glm-5.2","object":"model","owned_by":"nvidia"},{"id":"glm-5.2","object":"model","owned_by":"opencode"},{"id":"other","object":"model"}]}`
	aliases := []AliasModelInfo{
		{Alias: "test", TargetModels: []string{"z-ai/glm-5.2", "glm-5.2"}},
	}
	out, err := SynthesizeModelsResponse([]byte(upstream), aliases)
	if err != nil {
		t.Fatal(err)
	}
	var parsed openAIModelsList
	if err := json.Unmarshal(out, &parsed); err != nil {
		t.Fatal(err)
	}
	if len(parsed.Data) != 1 {
		t.Fatalf("want 1 model (the alias), got %d: %v", len(parsed.Data), parsed.Data)
	}
	if parsed.Data[0]["id"] != "test" {
		t.Fatalf("want id=test, got %v", parsed.Data[0]["id"])
	}
	// Should be enriched from the first target's upstream entry.
	if parsed.Data[0]["owned_by"] != "nvidia" {
		t.Fatalf("want owned_by=nvidia (from first target), got %v", parsed.Data[0]["owned_by"])
	}
}

func TestSynthesizeModelsResponseAliasEqualsTarget(t *testing.T) {
	// When alias = target_model (simple keys), the upstream entry is used
	// directly with full metadata.
	upstream := `{"object":"list","data":[{"id":"gemma-4-31b","object":"model","owned_by":"cerebras"},{"id":"other"}]}`
	aliases := []AliasModelInfo{
		{Alias: "gemma-4-31b", TargetModels: []string{"gemma-4-31b"}},
	}
	out, err := SynthesizeModelsResponse([]byte(upstream), aliases)
	if err != nil {
		t.Fatal(err)
	}
	var parsed openAIModelsList
	if err := json.Unmarshal(out, &parsed); err != nil {
		t.Fatal(err)
	}
	if len(parsed.Data) != 1 || parsed.Data[0]["id"] != "gemma-4-31b" {
		t.Fatalf("want single gemma-4-31b, got %v", parsed.Data)
	}
	if parsed.Data[0]["owned_by"] != "cerebras" {
		t.Fatalf("want owned_by=cerebras, got %v", parsed.Data[0]["owned_by"])
	}
}

func TestSynthesizeModelsResponseNoUpstreamMatch(t *testing.T) {
	// Alias target not in upstream list at all → minimal entry.
	upstream := `{"object":"list","data":[{"id":"other"}]}`
	aliases := []AliasModelInfo{
		{Alias: "custom-alias", TargetModels: []string{"some-model"}},
	}
	out, err := SynthesizeModelsResponse([]byte(upstream), aliases)
	if err != nil {
		t.Fatal(err)
	}
	var parsed openAIModelsList
	if err := json.Unmarshal(out, &parsed); err != nil {
		t.Fatal(err)
	}
	if len(parsed.Data) != 1 || parsed.Data[0]["id"] != "custom-alias" {
		t.Fatalf("want minimal entry with id=custom-alias, got %v", parsed.Data)
	}
}

func TestSynthesizeModelsResponseMultipleAliases(t *testing.T) {
	// Mix of alias=target and alias≠target, verifying order and dedup.
	upstream := `{"object":"list","data":[{"id":"gemma-4-31b","object":"model"},{"id":"z-ai/glm-5.2","object":"model","owned_by":"nvidia"},{"id":"other"}]}`
	aliases := []AliasModelInfo{
		{Alias: "gemma-4-31b", TargetModels: []string{"gemma-4-31b"}},
		{Alias: "test", TargetModels: []string{"z-ai/glm-5.2", "glm-5.2"}},
	}
	out, err := SynthesizeModelsResponse([]byte(upstream), aliases)
	if err != nil {
		t.Fatal(err)
	}
	var parsed openAIModelsList
	if err := json.Unmarshal(out, &parsed); err != nil {
		t.Fatal(err)
	}
	if len(parsed.Data) != 2 {
		t.Fatalf("want 2 models, got %d: %v", len(parsed.Data), parsed.Data)
	}
	if parsed.Data[0]["id"] != "gemma-4-31b" {
		t.Fatalf("want first=gemma-4-31b, got %v", parsed.Data[0]["id"])
	}
	if parsed.Data[1]["id"] != "test" {
		t.Fatalf("want second=test, got %v", parsed.Data[1]["id"])
	}
}

func TestSynthesizeModelsResponseEmpty(t *testing.T) {
	out, err := SynthesizeModelsResponse([]byte(`{"data":[{"id":"x"}]}`), nil)
	if err != nil {
		t.Fatal(err)
	}
	var parsed openAIModelsList
	json.Unmarshal(out, &parsed)
	if len(parsed.Data) != 0 {
		t.Fatalf("want empty, got %v", parsed.Data)
	}
}
