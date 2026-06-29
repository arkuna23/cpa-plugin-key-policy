package policy

import (
	"encoding/json"
	"net/url"
	"regexp"
	"strings"
)

var geminiModelPathPattern = regexp.MustCompile(`/models/([^/:]+)(?::|/)`)

func ExtractRequestedModel(path string, query url.Values, body []byte) string {
	if model := extractModelFromJSON(body); model != "" {
		return model
	}
	if model := strings.TrimSpace(query.Get("model")); model != "" {
		return model
	}
	if model := extractModelFromPath(path); model != "" {
		return model
	}
	return ""
}

func extractModelFromJSON(body []byte) string {
	if len(body) == 0 || !json.Valid(body) {
		return ""
	}
	var payload any
	if err := json.Unmarshal(body, &payload); err != nil {
		return ""
	}
	return findModelValue(payload)
}

func findModelValue(value any) string {
	switch v := value.(type) {
	case map[string]any:
		if raw, ok := v["model"]; ok {
			if model, ok := raw.(string); ok {
				return strings.TrimSpace(model)
			}
		}
		for _, raw := range v {
			if model := findModelValue(raw); model != "" {
				return model
			}
		}
	case []any:
		for _, raw := range v {
			if model := findModelValue(raw); model != "" {
				return model
			}
		}
	}
	return ""
}

func extractModelFromPath(path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return ""
	}
	if match := geminiModelPathPattern.FindStringSubmatch(path); len(match) == 2 {
		if decoded, err := url.PathUnescape(match[1]); err == nil {
			return strings.TrimSpace(decoded)
		}
		return strings.TrimSpace(match[1])
	}
	return ""
}

func IsModelsEndpoint(path string) bool {
	path = strings.TrimRight(strings.TrimSpace(path), "/")
	switch {
	case path == "/v1/models":
		return true
	case path == "/openai/v1/models":
		return true
	case strings.HasSuffix(path, "/v1/models"):
		return true
	default:
		return false
	}
}

func RewriteTopLevelModel(body []byte, model string) ([]byte, bool) {
	model = strings.TrimSpace(model)
	if model == "" || len(body) == 0 || !json.Valid(body) {
		return nil, false
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, false
	}
	if _, ok := payload["model"]; !ok {
		return nil, false
	}
	payload["model"] = model
	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, false
	}
	return raw, true
}
