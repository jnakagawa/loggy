package main

import (
	"fmt"
	"os"

	"github.com/jnakagawa/loggy/loggy-proxy/internal/certs"
	"github.com/jnakagawa/loggy/loggy-proxy/internal/nativehost"
	"github.com/jnakagawa/loggy/loggy-proxy/internal/proxy"
)

func main() {
	if len(os.Args) < 2 {
		// Check if stdin is a TTY - if not, we're being called by Chrome
		stat, _ := os.Stdin.Stat()
		if (stat.Mode() & os.ModeCharDevice) == 0 {
			// Stdin is not a TTY - run as native messaging host
			nativehost.Run()
			return
		}

		// Stdin is a TTY - show help
		printHelp()
		return
	}

	switch os.Args[1] {
	case "proxy":
		proxy.Run()
	case "install":
		runInstall()
	case "trust-cert":
		certs.TrustCert()
	case "help", "-h", "--help":
		printHelp()
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n", os.Args[1])
		printHelp()
		os.Exit(1)
	}
}

func printHelp() {
	fmt.Println(`Loggy Proxy - Analytics event interception proxy

Usage:
  loggy-proxy [command]

Commands:
  proxy       Run the MITM proxy server (port 8888) and API server (port 8889)
  install     Install the Chrome native messaging host manifest
  trust-cert  Trust the CA certificate in the macOS keychain

When run without arguments and stdin is not a TTY, operates as a
Chrome native messaging host (for use by the Loggy extension).`)
}

func runInstall() {
	// Get extension ID from args or prompt
	var extensionID string
	if len(os.Args) > 2 {
		extensionID = os.Args[2]
	} else {
		fmt.Print("Enter your Loggy extension ID (from chrome://extensions): ")
		fmt.Scanln(&extensionID)
	}

	if extensionID == "" {
		fmt.Fprintln(os.Stderr, "Error: Extension ID is required")
		os.Exit(1)
	}

	if err := nativehost.Install(extensionID); err != nil {
		fmt.Fprintf(os.Stderr, "Error installing native host: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("✅ Native messaging host installed successfully!")
	fmt.Println("   You can now use the Loggy extension to start the proxy.")
}
