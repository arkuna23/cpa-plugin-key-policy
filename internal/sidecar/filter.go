package sidecar

import (
	"encoding/json"
	"strings"
)

// openAIModelsList is the minimal shape we need from CPA's /v1/models response.
type openAIModelsList struct {
	Object string           `json:"object"`
	Data   []map[string]any `json:"data"`
}

// FilterModelsResponse keeps only models whose "id" matches one of the allowed
// aliases (case-insensitive). Unknown JSON shapes pass through unchanged.
func FilterModelsResponse(body []byte, allowedAliases []string) ([]byte, error) {
	if len(allowedAliases) == 0 {
		return marshalEmptyList()
	}
	allow := make(map[string]struct{}, len(allowedAliases))
	for _, a := range allowedAliases {
		a = strings.TrimSpace(a)
		if a == "" {
			continue
		}
		allow[strings.ToLower(a)] = struct{}{}
	}
	if len(allow) == 0 {
		return marshalEmptyList()
	}

	var list openAIModelsList
	if err := json.Unmarshal(body, &list); err != nil {
		return body, nil
	}
	if list.Data == nil {
		return body, nil
	}
	filtered := make([]map[string]any, 0, len(list.Data))
	for _, m := range list.Data {
		id, _ := m["id"].(string)
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, ok := allow[strings.ToLower(id)]; ok {
			filtered = append(filtered, m)
		}
	}
	list.Data = filtered
	if list.Object == "" {
		list.Object = "list"
	}
	return json.Marshal(list)
}

func marshalEmptyList() ([]byte, error) {
	return json.Marshal(openAIModelsList{Object: "list", Data: []map[string]any{}})
}