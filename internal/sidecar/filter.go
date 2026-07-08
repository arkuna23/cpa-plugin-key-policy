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

// AliasModelInfo describes one alias to expose in the /v1/models list.
type AliasModelInfo struct {
	Alias        string   // the alias name (what the client uses to make requests)
	TargetModels []string // target model identifiers for this alias (for metadata enrichment)
}

// SynthesizeModelsResponse builds a /v1/models response from the key's
// unique aliases. For each alias, it tries to enrich the entry with metadata
// from the upstream list by looking up the alias's target model. Aliases whose
// targets aren't in the upstream list get minimal entries.
//
// This replaces FilterModelsResponse for alias-based keys where the alias name
// differs from the target model name (e.g., alias "test" → "z-ai/glm-5.2").
// The upstream /v1/models list contains real model names, not alias names, so
// filtering by alias name yields an empty list for such keys. Synthesis shows
// the alias names (what the client uses to make requests) instead.
func SynthesizeModelsResponse(body []byte, aliases []AliasModelInfo) ([]byte, error) {
	if len(aliases) == 0 {
		return marshalEmptyList()
	}

	// Parse the upstream body to build a lookup map for metadata enrichment.
	var payload map[string]any
	hasUpstream := false
	if err := json.Unmarshal(body, &payload); err == nil {
		hasUpstream = true
	}

	// Build a lookup: normalized model identifier → upstream entry.
	lookup := make(map[string]map[string]any)
	if hasUpstream {
		for _, field := range []string{"data", "models"} {
			raw, ok := payload[field].([]any)
			if !ok {
				continue
			}
			for _, item := range raw {
				m, ok := item.(map[string]any)
				if !ok {
					continue
				}
				for _, id := range modelIdentifiers(m) {
					lookup[normalizeModelID(id)] = m
				}
			}
		}
	}

	// Synthesize entries for each unique alias (in order).
	synthesized := make([]any, 0, len(aliases))
	for _, info := range aliases {
		aliasNorm := normalizeModelID(info.Alias)
		if aliasNorm == "" {
			continue
		}
		// 1. If the alias name itself is in the upstream list (alias = target_model),
		//    use the upstream entry directly — preserves full metadata.
		if entry, ok := lookup[aliasNorm]; ok {
			synthesized = append(synthesized, entry)
			continue
		}
		// 2. Look up the first target model in the upstream list, clone its entry,
		//    and set the id to the alias name so the client knows what to use.
		var enriched bool
		for _, target := range info.TargetModels {
			targetNorm := normalizeModelID(target)
			if targetNorm == "" {
				continue
			}
			entry, ok := lookup[targetNorm]
			if !ok {
				continue
			}
			clone := make(map[string]any, len(entry))
			for k, v := range entry {
				clone[k] = v
			}
			clone["id"] = info.Alias
			if _, hasSlug := clone["slug"]; hasSlug {
				clone["slug"] = info.Alias
			}
			synthesized = append(synthesized, clone)
			enriched = true
			break
		}
		if enriched {
			continue
		}
		// 3. No upstream metadata available — create a minimal entry.
		synthesized = append(synthesized, map[string]any{
			"id":     info.Alias,
			"object": "model",
		})
	}

	// Build the response payload.
	if hasUpstream {
		replaced := false
		if _, ok := payload["data"]; ok {
			payload["data"] = synthesized
			updatePagingFields(payload, synthesized)
			replaced = true
		}
		if _, ok := payload["models"]; ok {
			payload["models"] = synthesized
			replaced = true
		}
		if !replaced {
			payload["object"] = "list"
			payload["data"] = synthesized
		}
		return json.Marshal(payload)
	}

	// No upstream to parse — return a minimal OpenAI-shaped list.
	return json.Marshal(map[string]any{
		"object": "list",
		"data":   synthesized,
	})
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
