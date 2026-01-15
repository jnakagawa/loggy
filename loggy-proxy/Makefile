BINARY=loggy-proxy
VERSION=$(shell git describe --tags --always 2>/dev/null || echo "dev")
LDFLAGS=-ldflags="-s -w -X main.Version=$(VERSION)"

.PHONY: build build-all clean test install

# Build for current platform
build:
	go build $(LDFLAGS) -o $(BINARY) ./cmd

# Build for macOS ARM64 (Apple Silicon)
build-darwin-arm64:
	GOOS=darwin GOARCH=arm64 go build $(LDFLAGS) -o $(BINARY)-darwin-arm64 ./cmd

# Build for macOS AMD64 (Intel)
build-darwin-amd64:
	GOOS=darwin GOARCH=amd64 go build $(LDFLAGS) -o $(BINARY)-darwin-amd64 ./cmd

# Build for both macOS architectures
build-all: build-darwin-arm64 build-darwin-amd64

# Run tests
test:
	go test -v ./...

# Install locally
install: build
	cp $(BINARY) /usr/local/bin/
	@echo "Installed to /usr/local/bin/$(BINARY)"
	@echo "Run '$(BINARY) install <extension-id>' to set up native messaging"

# Clean build artifacts
clean:
	rm -f $(BINARY) $(BINARY)-darwin-arm64 $(BINARY)-darwin-amd64

# Fetch dependencies
deps:
	go mod tidy
	go mod download

# Run the proxy directly (for development)
run:
	go run ./cmd proxy

# Run native host mode (for testing)
run-host:
	go run ./cmd
