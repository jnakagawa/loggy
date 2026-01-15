package proxy

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/jnakagawa/loggy/loggy-proxy/internal/config"
)

func startAPIServer() {
	mux := http.NewServeMux()

	mux.HandleFunc("/events", handleEvents)
	mux.HandleFunc("/clear", handleClear)
	mux.HandleFunc("/sources", handleSources)
	mux.HandleFunc("/unmatched", handleUnmatched)

	log.Printf("Starting API server on :%d", APIPort)
	if err := http.ListenAndServe(fmt.Sprintf(":%d", APIPort), corsMiddleware(mux)); err != nil {
		log.Fatalf("API server failed: %v", err)
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func handleEvents(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	eventsMu.RLock()
	events := make([]CapturedEvent, len(capturedEvents))
	copy(events, capturedEvents)
	eventsMu.RUnlock()

	unmatchedMu.RLock()
	unmatched := make(map[string]int)
	for k, v := range unmatchedDomains {
		unmatched[k] = v
	}
	unmatchedMu.RUnlock()

	response := map[string]interface{}{
		"events":           events,
		"count":            len(events),
		"unmatchedDomains": unmatched,
	}

	json.NewEncoder(w).Encode(response)
}

func handleClear(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	eventsMu.Lock()
	capturedEvents = capturedEvents[:0]
	eventsMu.Unlock()

	unmatchedMu.Lock()
	unmatchedDomains = make(map[string]int)
	unmatchedMu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

func handleSources(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "POST" {
		// Sync sources from extension
		var newSources []config.Source
		if err := json.NewDecoder(r.Body).Decode(&newSources); err != nil {
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}

		sourcesMu.Lock()
		sources = newSources
		sourcesMu.Unlock()

		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"count":   len(newSources),
		})
		return
	}

	// GET - return current sources
	sourcesMu.RLock()
	currentSources := make([]config.Source, len(sources))
	copy(currentSources, sources)
	sourcesMu.RUnlock()

	json.NewEncoder(w).Encode(currentSources)
}

func handleUnmatched(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	unmatchedMu.RLock()
	unmatched := make(map[string]int)
	for k, v := range unmatchedDomains {
		unmatched[k] = v
	}
	unmatchedMu.RUnlock()

	json.NewEncoder(w).Encode(unmatched)
}
