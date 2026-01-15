package certs

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

// GetCertDir returns the directory where certificates are stored
func GetCertDir() string {
	homeDir, _ := os.UserHomeDir()
	return filepath.Join(homeDir, ".loggy-proxy", "certs")
}

// GetCACertPath returns the path to the CA certificate
func GetCACertPath() string {
	return filepath.Join(GetCertDir(), "ca.pem")
}

// GetCAKeyPath returns the path to the CA private key
func GetCAKeyPath() string {
	return filepath.Join(GetCertDir(), "ca-key.pem")
}

// EnsureCA generates a CA certificate if one doesn't exist
func EnsureCA() error {
	certPath := GetCACertPath()
	keyPath := GetCAKeyPath()

	// Check if both files exist
	if _, err := os.Stat(certPath); err == nil {
		if _, err := os.Stat(keyPath); err == nil {
			return nil // Both exist
		}
	}

	return GenerateCA()
}

// GenerateCA creates a new CA certificate and private key
func GenerateCA() error {
	certDir := GetCertDir()
	if err := os.MkdirAll(certDir, 0755); err != nil {
		return fmt.Errorf("failed to create cert directory: %w", err)
	}

	// Generate RSA key pair
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return fmt.Errorf("failed to generate private key: %w", err)
	}

	// Create CA certificate template
	serialNumber, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return fmt.Errorf("failed to generate serial number: %w", err)
	}

	template := &x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			CommonName:   "Loggy Proxy CA",
			Organization: []string{"Loggy Proxy"},
		},
		NotBefore:             time.Now().AddDate(0, 0, -1),
		NotAfter:              time.Now().AddDate(10, 0, 0), // Valid for 10 years
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth, x509.ExtKeyUsageClientAuth},
		BasicConstraintsValid: true,
		IsCA:                  true,
		MaxPathLen:            2,
	}

	// Self-sign the certificate
	certDER, err := x509.CreateCertificate(rand.Reader, template, template, &privateKey.PublicKey, privateKey)
	if err != nil {
		return fmt.Errorf("failed to create certificate: %w", err)
	}

	// Write certificate to file
	certFile, err := os.Create(GetCACertPath())
	if err != nil {
		return fmt.Errorf("failed to create cert file: %w", err)
	}
	defer certFile.Close()

	if err := pem.Encode(certFile, &pem.Block{Type: "CERTIFICATE", Bytes: certDER}); err != nil {
		return fmt.Errorf("failed to encode certificate: %w", err)
	}

	// Write private key to file
	keyFile, err := os.OpenFile(GetCAKeyPath(), os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return fmt.Errorf("failed to create key file: %w", err)
	}
	defer keyFile.Close()

	if err := pem.Encode(keyFile, &pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(privateKey)}); err != nil {
		return fmt.Errorf("failed to encode private key: %w", err)
	}

	fmt.Printf("CA certificate generated at: %s\n", GetCACertPath())
	return nil
}

// TrustCert adds the CA certificate to the macOS keychain
func TrustCert() {
	certPath := GetCACertPath()

	if _, err := os.Stat(certPath); os.IsNotExist(err) {
		// Generate cert if it doesn't exist
		if err := GenerateCA(); err != nil {
			fmt.Fprintf(os.Stderr, "Error generating CA: %v\n", err)
			os.Exit(1)
		}
	}

	homeDir, _ := os.UserHomeDir()
	keychainPath := filepath.Join(homeDir, "Library", "Keychains", "login.keychain-db")

	fmt.Println("Adding CA certificate to macOS keychain...")
	fmt.Println("You may be prompted for your password.")

	cmd := exec.Command("security", "add-trusted-cert", "-d", "-r", "trustRoot", "-k", keychainPath, certPath)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Error trusting certificate: %v\n", err)
		fmt.Println("\nYou can manually trust the certificate by:")
		fmt.Printf("1. Open Keychain Access\n")
		fmt.Printf("2. Import %s\n", certPath)
		fmt.Printf("3. Double-click 'Loggy Proxy CA' and set Trust to 'Always Trust'\n")
		os.Exit(1)
	}

	fmt.Println("✅ CA certificate trusted successfully!")
}
