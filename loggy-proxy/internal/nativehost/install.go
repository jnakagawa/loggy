package nativehost

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// NativeHostManifest represents the Chrome native messaging host manifest
type NativeHostManifest struct {
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	Path           string   `json:"path"`
	Type           string   `json:"type"`
	AllowedOrigins []string `json:"allowed_origins"`
}

// Install creates the native messaging host manifest for Chrome
func Install(extensionID string) error {
	execPath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to get executable path: %w", err)
	}

	// Ensure the path is absolute
	execPath, err = filepath.Abs(execPath)
	if err != nil {
		return fmt.Errorf("failed to get absolute path: %w", err)
	}

	// Create wrapper script (fixes Chrome native messaging communication issues)
	wrapperPath := filepath.Join(filepath.Dir(execPath), "loggy-proxy-host")
	wrapperContent := fmt.Sprintf("#!/bin/bash\nexec %s \"$@\"\n", execPath)
	if err := os.WriteFile(wrapperPath, []byte(wrapperContent), 0755); err != nil {
		return fmt.Errorf("failed to create wrapper script: %w", err)
	}
	fmt.Printf("Wrapper script created: %s\n", wrapperPath)

	manifest := NativeHostManifest{
		Name:        "com.analytics_logger.proxy",
		Description: "Loggy Analytics Proxy Control",
		Path:        wrapperPath,
		Type:        "stdio",
		AllowedOrigins: []string{
			fmt.Sprintf("chrome-extension://%s/", extensionID),
		},
	}

	// Get the native messaging hosts directory
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("failed to get home directory: %w", err)
	}

	hostsDir := filepath.Join(homeDir, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts")

	// Create directory if it doesn't exist
	if err := os.MkdirAll(hostsDir, 0755); err != nil {
		return fmt.Errorf("failed to create native messaging hosts directory: %w", err)
	}

	// Write manifest file
	manifestPath := filepath.Join(hostsDir, "com.analytics_logger.proxy.json")
	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal manifest: %w", err)
	}

	if err := os.WriteFile(manifestPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write manifest: %w", err)
	}

	fmt.Printf("Manifest written to: %s\n", manifestPath)
	return nil
}
