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
