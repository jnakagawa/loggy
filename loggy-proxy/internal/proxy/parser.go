package proxy

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/url"
	"strings"
	"time"

	"github.com/jnakagawa/loggy/loggy-proxy/internal/config"
)

func generateID() string {
	bytes := make([]byte, 16)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

func parsePayload(data []byte, contentType string, source *config.Source, requestURL string) []CapturedEvent {
	var events []CapturedEvent

	// Try to parse as JSON
	var payload interface{}
	if err := json.Unmarshal(data, &payload); err != nil {
		// Not JSON, maybe URL-encoded
		payload = parseURLEncoded(string(data))
	}

	now := time.Now()
	timestamp := now.Format(time.RFC3339)

	// Extract events based on source configuration
	rawEvents := extractEvents(payload, source)

	for _, rawEvent := range rawEvents {
		eventName := extractEventName(rawEvent, source)
		eventData := extractEventData(rawEvent)
		userID, anonID := extractUserIDs(rawEvent)
		context := extractContext(rawEvent)

		event := CapturedEvent{
			ID:          generateID(),
			Timestamp:   timestamp,
			Event:       eventName,
			Properties:  eventData,
			Context:     context,
			UserID:      userID,
			AnonymousID: anonID,
			Type:        "track",
			Source:      source.ID,
			SourceName:  source.Name,
			SourceIcon:  source.Icon,
			SourceColor: source.Color,
			RawPayload:  rawEvent,
			Metadata: EventMetadata{
				URL:        requestURL,
				CapturedAt: timestamp,
			},
		}

		events = append(events, event)
	}

	// If no events extracted, create one from the whole payload
	if len(events) == 0 && payload != nil {
		eventName := extractEventName(payload, source)
		eventData := extractEventData(payload)
		userID, anonID := extractUserIDs(payload)
		context := extractContext(payload)

		event := CapturedEvent{
			ID:          generateID(),
			Timestamp:   timestamp,
			Event:       eventName,
			Properties:  eventData,
			Context:     context,
			UserID:      userID,
			AnonymousID: anonID,
			Type:        "track",
			Source:      source.ID,
			SourceName:  source.Name,
			SourceIcon:  source.Icon,
			SourceColor: source.Color,
			RawPayload:  payload,
			Metadata: EventMetadata{
				URL:        requestURL,
				CapturedAt: timestamp,
			},
		}

		events = append(events, event)
	}

	return events
}

func parseURLEncoded(data string) map[string]interface{} {
	values, err := url.ParseQuery(data)
	if err != nil {
		return nil
	}

	result := make(map[string]interface{})
	for key, vals := range values {
		if len(vals) == 1 {
			result[key] = vals[0]
		} else {
			result[key] = vals
		}
	}
	return result
}

func extractEvents(payload interface{}, source *config.Source) []interface{} {
	var events []interface{}

	payloadMap, ok := payload.(map[string]interface{})
	if !ok {
		return events
	}

	// Check for batch path
	if source.BatchPath != "" {
		if batch := getNestedValue(payloadMap, source.BatchPath); batch != nil {
			if arr, ok := batch.([]interface{}); ok {
				return arr
			}
		}
	}

	// Check common batch field names
	batchFields := []string{"batch", "events", "data", "items", "hits", "b"}
	for _, field := range batchFields {
		if val, ok := payloadMap[field]; ok {
			if arr, ok := val.([]interface{}); ok {
				return arr
			}
		}
	}

	return events
}

func extractEventName(event interface{}, source *config.Source) string {
	eventMap, ok := event.(map[string]interface{})
	if !ok {
		return "unknown"
	}

	// Try source-specific event name path
	if source.EventNamePath != "" {
		if name := getNestedValue(eventMap, source.EventNamePath); name != nil {
			if str, ok := name.(string); ok {
				return str
			}
		}
	}

	// Try common event name fields
	nameFields := []string{"event", "eventName", "event_name", "name", "action", "en", "e", "a", "type", "t"}
	for _, field := range nameFields {
		if val, ok := eventMap[field]; ok {
			if str, ok := val.(string); ok && str != "" {
				return str
			}
		}
	}

	return "unknown"
}

func extractEventData(event interface{}) map[string]interface{} {
	eventMap, ok := event.(map[string]interface{})
	if !ok {
		return nil
	}

	// Try to find properties/params sub-object
	propFields := []string{"properties", "params", "data", "traits", "p"}
	for _, field := range propFields {
		if val, ok := eventMap[field]; ok {
			if props, ok := val.(map[string]interface{}); ok {
				return props
			}
		}
	}

	// Return the whole event as data
	return eventMap
}

func extractUserIDs(event interface{}) (string, string) {
	eventMap, ok := event.(map[string]interface{})
	if !ok {
		return "", ""
	}

	var userID, anonID string

	// Try common user ID fields
	userFields := []string{"userId", "user_id", "uid"}
	for _, field := range userFields {
		if val, ok := eventMap[field]; ok {
			if str, ok := val.(string); ok && str != "" {
				userID = str
				break
			}
		}
	}

	// Try common anonymous ID fields
	anonFields := []string{"anonymousId", "anonymous_id", "anonId"}
	for _, field := range anonFields {
		if val, ok := eventMap[field]; ok {
			if str, ok := val.(string); ok && str != "" {
				anonID = str
				break
			}
		}
	}

	return userID, anonID
}

func extractContext(event interface{}) map[string]interface{} {
	eventMap, ok := event.(map[string]interface{})
	if !ok {
		return nil
	}

	if ctx, ok := eventMap["context"]; ok {
		if ctxMap, ok := ctx.(map[string]interface{}); ok {
			return ctxMap
		}
	}

	return nil
}

// getNestedValue gets a value from a nested map using dot notation and array indexing
// e.g., "events[0].name" or "user.profile.email"
func getNestedValue(data map[string]interface{}, path string) interface{} {
	parts := parseJSONPath(path)
	var current interface{} = data

	for _, part := range parts {
		switch v := current.(type) {
		case map[string]interface{}:
			if val, ok := v[part.Key]; ok {
				if part.Index >= 0 {
					if arr, ok := val.([]interface{}); ok && part.Index < len(arr) {
						current = arr[part.Index]
					} else {
						return nil
					}
				} else {
					current = val
				}
			} else {
				return nil
			}
		case []interface{}:
			if part.Index >= 0 && part.Index < len(v) {
				current = v[part.Index]
			} else {
				return nil
			}
		default:
			return nil
		}
	}

	return current
}

type pathPart struct {
	Key   string
	Index int // -1 means no index
}

func parseJSONPath(path string) []pathPart {
	var parts []pathPart

	// Split by dots, but handle array notation
	segments := strings.Split(path, ".")
	for _, segment := range segments {
		// Check for array notation like "events[0]"
		if idx := strings.Index(segment, "["); idx != -1 {
			key := segment[:idx]
			indexStr := strings.Trim(segment[idx:], "[]")
			var index int
			if _, err := parseIndex(indexStr, &index); err == nil {
				parts = append(parts, pathPart{Key: key, Index: index})
			} else {
				parts = append(parts, pathPart{Key: segment, Index: -1})
			}
		} else {
			parts = append(parts, pathPart{Key: segment, Index: -1})
		}
	}

	return parts
}

func parseIndex(s string, index *int) (string, error) {
	*index = 0
	for _, c := range s {
		if c >= '0' && c <= '9' {
			*index = *index*10 + int(c-'0')
		} else {
			return "", nil
		}
	}
	return s, nil
}
