package proxy

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"os"

	"github.com/jnakagawa/loggy/loggy-proxy/internal/certs"
)

func loadCA() (*x509.Certificate, *rsa.PrivateKey, error) {
	// Read certificate
	certPEM, err := os.ReadFile(certs.GetCACertPath())
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read CA cert: %w", err)
	}

	block, _ := pem.Decode(certPEM)
	if block == nil {
		return nil, nil, fmt.Errorf("failed to decode CA cert PEM")
	}

	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to parse CA cert: %w", err)
	}

	// Read private key
	keyPEM, err := os.ReadFile(certs.GetCAKeyPath())
	if err != nil {
		return nil, nil, fmt.Errorf("failed to read CA key: %w", err)
	}

	keyBlock, _ := pem.Decode(keyPEM)
	if keyBlock == nil {
		return nil, nil, fmt.Errorf("failed to decode CA key PEM")
	}

	key, err := x509.ParsePKCS1PrivateKey(keyBlock.Bytes)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to parse CA key: %w", err)
	}

	return cert, key, nil
}
