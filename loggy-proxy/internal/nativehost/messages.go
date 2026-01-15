package nativehost

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// Message represents an incoming message from the extension
type Message struct {
	Action string `json:"action"`
}

// Response represents a response to the extension
type Response struct {
	Success      bool   `json:"success"`
	Error        string `json:"error,omitempty"`
	Message      string `json:"message,omitempty"`
	Running      bool   `json:"running,omitempty"`
	PID          int    `json:"pid,omitempty"`
	AutoLaunched bool   `json:"autoLaunched,omitempty"`
}

var proxyProcess *os.Process

func getPIDFile() string {
	homeDir, _ := os.UserHomeDir()
	return filepath.Join(homeDir, ".loggy-proxy", ".proxy.pid")
}

func handleMessage(msg Message) Response {
	switch msg.Action {
	case "ping":
		return handlePing()
	case "startProxy":
		return handleStartProxy()
	case "stopProxy":
		return handleStopProxy()
	case "getStatus":
		return handleGetStatus()
	default:
		return Response{Success: false, Error: "Unknown action: " + msg.Action}
	}
}

func handlePing() Response {
	return Response{
		Success: true,
	}
}

func handleStartProxy() Response {
	// Check if proxy is already running on ports 8888 or 8889
	if isPortInUse(8888) || isPortInUse(8889) {
		// Kill existing processes
		killProcessOnPort(8888)
		killProcessOnPort(8889)
		time.Sleep(500 * time.Millisecond)
	}

	// Get the path to our own binary
	execPath, err := os.Executable()
	if err != nil {
		return Response{Success: false, Error: "Failed to get executable path: " + err.Error()}
	}

	// Start the proxy as a detached subprocess
	cmd := exec.Command(execPath, "proxy")
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setpgid: true,
	}

	if err := cmd.Start(); err != nil {
		return Response{Success: false, Error: "Failed to start proxy: " + err.Error()}
	}

	proxyProcess = cmd.Process

	// Save PID to file
	pidFile := getPIDFile()
	os.MkdirAll(filepath.Dir(pidFile), 0755)
	os.WriteFile(pidFile, []byte(strconv.Itoa(cmd.Process.Pid)), 0644)

	// Detach the process
	go cmd.Wait()

	// Wait a moment and verify it started
	time.Sleep(500 * time.Millisecond)

	if !isPortInUse(8888) {
		return Response{Success: false, Error: "Proxy failed to start"}
	}

	// Trust the certificate and launch Chrome
	go func() {
		time.Sleep(1 * time.Second)
		trustCertSilent()
		launchChromeWithProxy()
	}()

	return Response{
		Success:      true,
		Message:      "MITM Proxy started! Extension loaded. Can now intercept HTTPS.",
		PID:          cmd.Process.Pid,
		AutoLaunched: true,
	}
}

func handleStopProxy() Response {
	pid := getProxyPID()
	if pid == 0 {
		return Response{Success: false, Error: "No proxy PID found. Proxy may not be running."}
	}

	process, err := os.FindProcess(pid)
	if err != nil {
		return Response{Success: false, Error: "Failed to find process: " + err.Error()}
	}

	if err := process.Signal(syscall.SIGTERM); err != nil {
		// Process might already be dead
		if !strings.Contains(err.Error(), "process already finished") {
			return Response{Success: false, Error: "Failed to stop proxy: " + err.Error()}
		}
	}

	// Clean up PID file
	os.Remove(getPIDFile())

	// Wait and verify
	time.Sleep(300 * time.Millisecond)

	if isPortInUse(8888) {
		return Response{Success: false, Error: "Proxy may still be running"}
	}

	return Response{Success: true, Message: "Proxy stopped successfully"}
}

func handleGetStatus() Response {
	pid := getProxyPID()
	running := pid != 0 && isProcessRunning(pid)

	return Response{
		Success: true,
		Running: running,
		PID:     pid,
	}
}

func getProxyPID() int {
	data, err := os.ReadFile(getPIDFile())
	if err != nil {
		return 0
	}

	pid, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil {
		return 0
	}

	return pid
}

func isProcessRunning(pid int) bool {
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}

	// On Unix, FindProcess always succeeds, so we need to send signal 0 to check
	err = process.Signal(syscall.Signal(0))
	return err == nil
}

func isPortInUse(port int) bool {
	cmd := exec.Command("lsof", "-i", fmt.Sprintf(":%d", port), "-t")
	output, _ := cmd.Output()
	return len(strings.TrimSpace(string(output))) > 0
}

func killProcessOnPort(port int) {
	cmd := exec.Command("lsof", "-i", fmt.Sprintf(":%d", port), "-t")
	output, err := cmd.Output()
	if err != nil {
		return
	}

	pids := strings.Split(strings.TrimSpace(string(output)), "\n")
	for _, pidStr := range pids {
		if pid, err := strconv.Atoi(pidStr); err == nil {
			syscall.Kill(pid, syscall.SIGTERM)
		}
	}
}

func trustCertSilent() {
	homeDir, _ := os.UserHomeDir()
	certPath := filepath.Join(homeDir, ".loggy-proxy", "certs", "ca.pem")

	if _, err := os.Stat(certPath); os.IsNotExist(err) {
		return
	}

	cmd := exec.Command("security", "add-trusted-cert", "-d", "-r", "trustRoot",
		"-k", filepath.Join(homeDir, "Library", "Keychains", "login.keychain-db"),
		certPath)
	cmd.Run()
}

func launchChromeWithProxy() {
	execPath, _ := os.Executable()
	extensionPath := filepath.Dir(filepath.Dir(execPath))

	cmd := exec.Command("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"--proxy-server=http://127.0.0.1:8888",
		"--user-data-dir=/tmp/chrome-proxy-profile",
		fmt.Sprintf("--load-extension=%s", extensionPath),
		"--ignore-certificate-errors",
	)
	cmd.Start()
}
