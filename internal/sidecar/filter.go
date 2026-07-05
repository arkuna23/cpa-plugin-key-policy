package sidecar

import (
	"encoding/json"
	"strings"
)

// openAIModelsList is the minimal OpenAI shape used by tests and empty fallbacks.
type openAIModelsList struct {
	Object string           `json:"object"`
	Data   []map[string]any `json:"data"`
}

// FilterModelsResponse keeps only models whose model identifier matches one of
// the allowed aliases (case-insensitive). It handles CPA's OpenAI/Claude
// "data" shape and Codex-client "models" shape. Unknown JSON shapes pass
// through unchanged.
func FilterModelsResponse(body []byte, allowedAliases []string) ([]byte, error) {
	allow := allowedAliasSet(allowedAliases)

	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		if len(allow) == 0 {
			return marshalEmptyList()
		}
		return body, nil
	}
	if filterKnownModelCollections(payload, allow) {
		return json.Marshal(payload)
	}
	if len(allow) == 0 {
		return marshalEmptyList()
	}
	return body, nil
}

func marshalEmptyList() ([]byte, error) {
	return json.Marshal(openAIModelsList{Object: "list", Data: []map[string]any{}})
}

func allowedAliasSet(aliases []string) map[string]struct{} {
	allow := make(map[string]struct{}, len(aliases))
	for _, alias := range aliases {
		if normalized := normalizeModelID(alias); normalized != "" {
			allow[normalized] = struct{}{}
		}
	}
	return allow
}

func filterKnownModelCollections(payload map[string]any, allow map[string]struct{}) bool {
	changed := false
	if filterModelCollection(payload, "data", allow) {
		changed = true
	}
	if filterModelCollection(payload, "models", allow) {
		changed = true
	}
	return changed
}

func filterModelCollection(payload map[string]any, field string, allow map[string]struct{}) bool {
	raw, exists := payload[field]
	if !exists {
		return false
	}
	items, ok := raw.([]any)
	if !ok {
		return false
	}
	filtered := make([]any, 0, len(items))
	for _, item := range items {
		if modelAllowed(item, allow) {
			filtered = append(filtered, item)
		}
	}
	payload[field] = filtered
	if field == "data" {
		updatePagingFields(payload, filtered)
	}
	return true
}

func modelAllowed(item any, allow map[string]struct{}) bool {
	if len(allow) == 0 {
		return false
	}
	for _, id := range modelIdentifiers(item) {
		if _, ok := allow[normalizeModelID(id)]; ok {
			return true
		}
	}
	return false
}

func modelIdentifiers(item any) []string {
	m, ok := item.(map[string]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, 4)
	for _, field := range []string{"id", "slug", "name", "model"} {
		if value, ok := m[field].(string); ok {
			if value = strings.TrimSpace(value); value != "" {
				out = append(out, value)
			}
		}
	}
	return out
}

func updatePagingFields(payload map[string]any, items []any) {
	first, last := "", ""
	if len(items) > 0 {
		ids := modelIdentifiers(items[0])
		if len(ids) > 0 {
			first = ids[0]
		}
		ids = modelIdentifiers(items[len(items)-1])
		if len(ids) > 0 {
			last = ids[0]
		}
	}
	if _, ok := payload["first_id"]; ok {
		payload["first_id"] = first
	}
	if _, ok := payload["last_id"]; ok {
		payload["last_id"] = last
	}
	if _, ok := payload["has_more"]; ok {
		payload["has_more"] = false
	}
}

func normalizeModelID(id string) string {
	id = strings.TrimSpace(strings.ToLower(id))
	id = strings.TrimPrefix(id, "models/")
	return id
}
