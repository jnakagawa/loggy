// Setup Assistant JavaScript

// Get extension ID from URL parameter
function getExtensionId() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');

    const idElement = document.getElementById('extensionId');

    if (id) {
        idElement.textContent = id;
        return id;
    } else {
        idElement.innerHTML = 'Not Found<br><small>Click "Open Setup Assistant" button again</small>';
        return null;
    }
}

function copyExtensionId() {
    const idElement = document.getElementById('extensionId');
    const id = idElement.textContent;

    if (id && id !== 'Loading...' && !id.includes('Not Found')) {
        navigator.clipboard.writeText(id).then(() => {
            alert('Extension ID copied to clipboard!');
        }).catch(() => {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = id;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            alert('Extension ID copied to clipboard!');
        });
    } else {
        alert('Extension ID not available. Please click the Setup Assistant button from the extension.');
    }
}

function runInstaller() {
    const status = document.getElementById('installStatus');
    const extensionId = document.getElementById('extensionId').textContent;

    if (!extensionId || extensionId.includes('Not Found') || extensionId.includes('Loading')) {
        status.innerHTML = '❌ Extension ID not found. Click "Open Setup Assistant" from the extension.';
        return;
    }

    // Generate the installation command
    const installCommand = `mkdir -p "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts" && cat > "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.analytics_logger.proxy.json" << 'EOF'
{
  "name": "com.analytics_logger.proxy",
  "description": "Analytics Logger Proxy Control",
  "path": "/Users/jonahnakagawa/vibes/extension-analytics-logger/native-host/proxy-host.js",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://${extensionId}/"]
}
EOF
chmod +x /Users/jonahnakagawa/vibes/extension-analytics-logger/native-host/proxy-host.js && echo "✅ Installation complete! Reload the extension and click 'Start Proxy'"`;

    status.innerHTML =
        '✅ Ready to install!<br><br>' +
        '<strong>📋 Copy this command:</strong><br>' +
        '<textarea id="installCommand" readonly style="width: 100%; height: 120px; font-family: monospace; font-size: 11px; padding: 8px; margin: 10px 0; border: 2px solid #4caf50; border-radius: 4px;">' + installCommand + '</textarea>' +
        '<button id="copyCommandBtn" style="background: #4caf50; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 600;">📋 Copy Command</button>' +
        '<br><br>' +
        '<strong>Then:</strong><br>' +
        '1. Open <strong>Terminal</strong> (search in Spotlight)<br>' +
        '2. Paste the command and press Enter<br>' +
        '3. Reload the Analytics Logger extension<br>' +
        '4. Click "Start Proxy" - Done!';

    // Add copy button functionality
    setTimeout(() => {
        const copyBtn = document.getElementById('copyCommandBtn');
        const commandBox = document.getElementById('installCommand');

        if (copyBtn && commandBox) {
            copyBtn.addEventListener('click', () => {
                commandBox.select();
                document.execCommand('copy');
                copyBtn.textContent = '✅ Copied!';
                setTimeout(() => {
                    copyBtn.textContent = '📋 Copy Command';
                }, 2000);
            });
        }
    }, 100);

    document.getElementById('step3').style.display = 'block';
}

// Initialize when DOM is ready
function initialize() {
    getExtensionId();

    // Add event listeners
    const copyBtn = document.getElementById('copyIdBtn');
    if (copyBtn) {
        copyBtn.addEventListener('click', copyExtensionId);
    }

    const installBtn = document.getElementById('installBtn');
    if (installBtn) {
        installBtn.addEventListener('click', runInstaller);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
