package proxy

import (
	"bytes"
	"compress/flate"
	"compress/gzip"
	"crypto/tls"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"

	"github.com/andybalholm/brotli"
	"github.com/elazarl/goproxy"
	"github.com/jnakagawa/loggy/loggy-proxy/internal/certs"
	"github.com/jnakagawa/loggy/loggy-proxy/internal/config"
)

const (
	ProxyPort = 8888
	APIPort   = 8889
	MaxEvents = 1000
)

var (
	capturedEvents   []CapturedEvent
	eventsMu         sync.RWMutex
	unmatchedDomains = make(map[string]int)
	unmatchedMu      sync.RWMutex
	sources          []config.Source
	sourcesMu        sync.RWMutex
)

// CapturedEvent represents an analytics event captured by the proxy
// Field names match the JavaScript parser format expected by the extension
type CapturedEvent struct {
	ID          string                 `json:"id"`
	Timestamp   string                 `json:"timestamp"`
	Event       string                 `json:"event"`
	Properties  map[string]interface{} `json:"properties"`
	Context     map[string]interface{} `json:"context,omitempty"`
	UserID      string                 `json:"userId,omitempty"`
	AnonymousID string                 `json:"anonymousId,omitempty"`
	Type        string                 `json:"type"`
	Source      string                 `json:"_source"`
	SourceName  string                 `json:"_sourceName"`
	SourceIcon  string                 `json:"_sourceIcon"`
	SourceColor string                 `json:"_sourceColor"`
	RawPayload  interface{}            `json:"_rawPayload,omitempty"`
	Metadata    EventMetadata          `json:"_metadata"`
}

// EventMetadata contains capture metadata
type EventMetadata struct {
	URL        string `json:"url"`
	CapturedAt string `json:"capturedAt"`
}

// Run starts the MITM proxy and API servers
func Run() {
	// Ensure CA certificate exists
	if err := certs.EnsureCA(); err != nil {
		log.Fatalf("Failed to ensure CA certificate: %v", err)
	}

	// Load default sources
	sources = config.GetDefaultSources()

	// Set up signal handling for graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// Start API server in background
	go startAPIServer()

	// Start proxy server
	go startProxyServer()

	fmt.Printf("🪵 Loggy Proxy running\n")
	fmt.Printf("   MITM Proxy: http://127.0.0.1:%d\n", ProxyPort)
	fmt.Printf("   API Server: http://127.0.0.1:%d\n", APIPort)
	fmt.Println("   Press Ctrl+C to stop")

	// Wait for shutdown signal
	<-sigChan
	fmt.Println("\nShutting down...")
}

func startProxyServer() {
	proxy := goproxy.NewProxyHttpServer()
	proxy.Verbose = false

	// Load CA certificate for MITM
	caCert, caKey, err := loadCA()
	if err != nil {
		log.Fatalf("Failed to load CA: %v", err)
	}

	// Set the CA for MITM
	goproxy.GoproxyCa = tls.Certificate{
		Certificate: [][]byte{caCert.Raw},
		PrivateKey:  caKey,
		Leaf:        caCert,
	}
	goproxy.OkConnect = &goproxy.ConnectAction{Action: goproxy.ConnectAccept, TLSConfig: goproxy.TLSConfigFromCA(&goproxy.GoproxyCa)}
	goproxy.MitmConnect = &goproxy.ConnectAction{Action: goproxy.ConnectMitm, TLSConfig: goproxy.TLSConfigFromCA(&goproxy.GoproxyCa)}
	goproxy.HTTPMitmConnect = &goproxy.ConnectAction{Action: goproxy.ConnectHTTPMitm, TLSConfig: goproxy.TLSConfigFromCA(&goproxy.GoproxyCa)}
	goproxy.RejectConnect = &goproxy.ConnectAction{Action: goproxy.ConnectReject, TLSConfig: goproxy.TLSConfigFromCA(&goproxy.GoproxyCa)}

	// MITM all HTTPS connections
	proxy.OnRequest().HandleConnect(goproxy.AlwaysMitm)

	// Intercept requests
	proxy.OnRequest().DoFunc(func(req *http.Request, ctx *goproxy.ProxyCtx) (*http.Request, *http.Response) {
		if req.Method == "POST" || req.Method == "PUT" {
			handleRequest(req)
		}
		return req, nil
	})

	log.Printf("Starting MITM proxy on :%d", ProxyPort)
	if err := http.ListenAndServe(fmt.Sprintf(":%d", ProxyPort), proxy); err != nil {
		log.Fatalf("Proxy server failed: %v", err)
	}
}

func handleRequest(req *http.Request) {
	url := req.URL.String()
	if req.URL.Scheme == "" {
		url = "https://" + req.Host + req.URL.Path
		if req.URL.RawQuery != "" {
			url += "?" + req.URL.RawQuery
		}
	}

	// Find matching source
	source := findMatchingSource(url)
	if source == nil {
		// Track unmatched domain for suggestions
		trackUnmatchedDomain(req.Host)
		return
	}

	// Read and restore body
	if req.Body == nil {
		return
	}

	body, err := io.ReadAll(req.Body)
	if err != nil {
		return
	}
	req.Body = io.NopCloser(bytes.NewReader(body))

	if len(body) == 0 {
		return
	}

	// Decompress if needed
	decompressed := decompress(body, req.Header.Get("Content-Encoding"))

	// Parse and store event
	contentType := req.Header.Get("Content-Type")
	events := parsePayload(decompressed, contentType, source, url)

	eventsMu.Lock()
	for _, event := range events {
		capturedEvents = append(capturedEvents, event)
		if len(capturedEvents) > MaxEvents {
			capturedEvents = capturedEvents[1:]
		}
	}
	eventsMu.Unlock()
}

func findMatchingSource(url string) *config.Source {
	sourcesMu.RLock()
	defer sourcesMu.RUnlock()

	for i := range sources {
		if sources[i].Matches(url) {
			return &sources[i]
		}
	}
	return nil
}

func trackUnmatchedDomain(host string) {
	// Extract base domain
	parts := strings.Split(host, ".")
	if len(parts) >= 2 {
		host = strings.Join(parts[len(parts)-2:], ".")
	}

	// Skip common non-analytics domains
	skipDomains := []string{"google.com", "gstatic.com", "googleapis.com", "cloudflare.com"}
	for _, skip := range skipDomains {
		if host == skip {
			return
		}
	}

	unmatchedMu.Lock()
	unmatchedDomains[host]++
	unmatchedMu.Unlock()
}

func decompress(data []byte, encoding string) []byte {
	switch strings.ToLower(encoding) {
	case "gzip":
		reader, err := gzip.NewReader(bytes.NewReader(data))
		if err != nil {
			return data
		}
		defer reader.Close()
		decompressed, err := io.ReadAll(reader)
		if err != nil {
			return data
		}
		return decompressed

	case "deflate":
		reader := flate.NewReader(bytes.NewReader(data))
		defer reader.Close()
		decompressed, err := io.ReadAll(reader)
		if err != nil {
			return data
		}
		return decompressed

	case "br":
		reader := brotli.NewReader(bytes.NewReader(data))
		decompressed, err := io.ReadAll(reader)
		if err != nil {
			return data
		}
		return decompressed
	}

	return data
}
