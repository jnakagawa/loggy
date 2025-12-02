#!/opt/homebrew/bin/node

/**
 * Native Messaging Host for Analytics Logger
 * Allows the extension to start/stop the proxy server
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

let proxyProcess = null;
const PID_FILE = path.join(__dirname, '.proxy.pid');

// Native messaging uses stdin/stdout for communication
process.stdin.on('readable', () => {
  let input = [];
  let chunk;

  while ((chunk = process.stdin.read()) !== null) {
    input.push(chunk);
  }

  if (input.length > 0) {
    const buffer = Buffer.concat(input);

    // First 4 bytes are message length
    if (buffer.length < 4) return;

    const msgLength = buffer.readUInt32LE(0);
    const msgContent = buffer.slice(4, 4 + msgLength).toString();

    try {
      const message = JSON.parse(msgContent);
      handleMessage(message);
    } catch (err) {
      sendMessage({ error: 'Invalid message format' });
    }
  }
});

function handleMessage(message) {
  switch (message.action) {
    case 'startProxy':
      startProxy();
      break;

    case 'stopProxy':
      stopProxy();
      break;

    case 'getStatus':
      sendMessage({
        running: proxyProcess !== null,
        pid: proxyProcess?.pid
      });
      break;

    default:
      sendMessage({ error: 'Unknown action' });
  }
}

function startProxy() {
  // Check if proxy is already running
  exec('/usr/sbin/lsof -i :8888 -i :8889 2>/dev/null | grep LISTEN', (error, stdout) => {
    if (stdout) {
      // Proxy already running - stop it first, then restart
      // Extract PID from lsof output
      const lines = stdout.trim().split('\n');
      const pids = new Set();

      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length > 1) {
          pids.add(parseInt(parts[1]));
        }
      });

      // Kill existing proxy processes
      pids.forEach(pid => {
        try {
          process.kill(pid, 'SIGTERM');
        } catch (err) {
          // Ignore errors
        }
      });

      // Wait a bit for processes to die, then start fresh
      setTimeout(() => {
        actuallyStartProxy();
      }, 1000);
    } else {
      actuallyStartProxy();
    }
  });
}

function actuallyStartProxy() {
  // Clean up stale PID file
  if (fs.existsSync(PID_FILE)) {
    try {
      fs.unlinkSync(PID_FILE);
    } catch (err) {
      // Ignore
    }
  }

  // Start the MITM proxy (can decrypt HTTPS like Charles)
  const proxyPath = path.join(__dirname, '..', 'proxy-server-mitm.js');

  proxyProcess = spawn('/opt/homebrew/bin/node', [proxyPath], {
    detached: true,
    stdio: 'ignore'
  });

  // Save PID for later tracking
  fs.writeFileSync(PID_FILE, proxyProcess.pid.toString());

  proxyProcess.unref();

  // Give it a moment to start
  setTimeout(() => {
    exec('/usr/sbin/lsof -i :8888 2>/dev/null | grep LISTEN', (err, stdout) => {
      if (stdout) {
        // Proxy started - install CA cert and launch Chrome
        const certPath = path.join(require('os').homedir(), '.http-mitm-proxy', 'certs', 'ca.pem');

        // Wait for cert generation, then install it
        setTimeout(() => {
          exec(`security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain-db "${certPath}" 2>&1 | grep -v "already present" || true`, () => {
            // Get the extension path (parent directory of native-host)
            const extensionPath = path.join(__dirname, '..');

            // Launch Chrome with extension loaded
            const chromeCommand = `/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --proxy-server="http://127.0.0.1:8888" --user-data-dir="/tmp/chrome-proxy-profile" --load-extension="${extensionPath}" --ignore-certificate-errors > /dev/null 2>&1 &`;

            exec(chromeCommand, (launchErr) => {
              if (launchErr) {
                sendMessage({
                  success: true,
                  message: 'MITM Proxy started, but could not auto-launch Chrome.',
                  pid: proxyProcess.pid
                });
              } else {
                sendMessage({
                  success: true,
                  message: 'MITM Proxy started! Extension loaded. Can now intercept HTTPS.',
                  pid: proxyProcess.pid,
                  autoLaunched: true
                });
              }
            });
          });
        }, 1500); // Wait for cert generation
      } else {
        sendMessage({
          success: false,
          error: 'Proxy failed to start.'
        });
      }
    });
  }, 500);
}

function stopProxy() {
  // Try to read PID from file if we don't have it in memory
  let pid = proxyProcess ? proxyProcess.pid : null;

  if (!pid && fs.existsSync(PID_FILE)) {
    try {
      pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'));
    } catch (err) {
      // Ignore
    }
  }

  if (!pid) {
    sendMessage({ success: false, error: 'No proxy PID found. Proxy may not be running.' });
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    proxyProcess = null;

    // Clean up PID file
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
    }

    // Verify it stopped
    setTimeout(() => {
      exec('/usr/sbin/lsof -i :8888 2>/dev/null | grep LISTEN', (err, stdout) => {
        if (!stdout) {
          sendMessage({ success: true, message: 'Proxy server stopped successfully' });
        } else {
          sendMessage({ success: false, error: 'Proxy may still be running' });
        }
      });
    }, 300);
  } catch (err) {
    // Process doesn't exist - that's fine, it's already stopped
    if (err.code === 'ESRCH') {
      // Clean up PID file
      if (fs.existsSync(PID_FILE)) {
        fs.unlinkSync(PID_FILE);
      }
      sendMessage({ success: true, message: 'Proxy was already stopped' });
    } else {
      sendMessage({ success: false, error: 'Failed to stop proxy: ' + err.message });
    }
  }
}

function sendMessage(message) {
  const buffer = Buffer.from(JSON.stringify(message));
  const header = Buffer.alloc(4);
  header.writeUInt32LE(buffer.length, 0);

  process.stdout.write(header);
  process.stdout.write(buffer);
}

// Handle process termination
process.on('SIGTERM', () => {
  let pid = proxyProcess ? proxyProcess.pid : null;

  if (!pid && fs.existsSync(PID_FILE)) {
    try {
      pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'));
    } catch (err) {
      // Ignore
    }
  }

  if (pid) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch (err) {
      // Ignore
    }
  }

  // Clean up PID file
  if (fs.existsSync(PID_FILE)) {
    fs.unlinkSync(PID_FILE);
  }

  process.exit(0);
});
