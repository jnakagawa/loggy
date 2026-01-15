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


async function runInstaller() {
    const status = document.getElementById('installStatus');
    const extensionId = document.getElementById('extensionId').textContent;

    if (!extensionId || extensionId.includes('Not Found') || extensionId.includes('Loading')) {
        status.innerHTML = '❌ Extension ID not found. Click "Open Setup Assistant" from the extension.';
        return;
    }

    // Detect install type and generate appropriate command
    let installType = 'development';
    let version = '1.0.0';

    try {
        const extensionInfo = await chrome.management.getSelf();
        installType = extensionInfo.installType;
        version = chrome.runtime.getManifest().version;
    } catch (e) {
        console.log('Could not detect install type, assuming development');
    }

    let command;
    let extraInstructions = '';

    if (installType === 'normal') {
        // PACKED EXTENSION - Use shell variable expansion for the path
        command = `EXTENSION_PATH="$HOME/Library/Application Support/Google/Chrome/Default/Extensions/${extensionId}/${version}" && mkdir -p "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts" && cat > "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.analytics_logger.proxy.json" << EOF
{
  "name": "com.analytics_logger.proxy",
  "description": "Analytics Logger Proxy Control",
  "path": "$EXTENSION_PATH/loggy-proxy/loggy-proxy",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://${extensionId}/"]
}
EOF
chmod +x "$EXTENSION_PATH/loggy-proxy/loggy-proxy" && echo "✅ Done! Reload the extension."`;
    } else {
        // UNPACKED/DEVELOPMENT - User needs to cd to project folder first
        // First build the Go binary, then create the manifest
        command = `cd loggy-proxy && go build -o loggy-proxy ./cmd && cd .. && mkdir -p "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts" && cat > "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.analytics_logger.proxy.json" << EOF
{
  "name": "com.analytics_logger.proxy",
  "description": "Analytics Logger Proxy Control",
  "path": "$(pwd)/loggy-proxy/loggy-proxy",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://${extensionId}/"]
}
EOF
echo "✅ Done! Reload the extension."`;

        extraInstructions = `<p style="color: #e65100; font-size: 13px; margin-bottom: 12px;">
            <strong>First:</strong> In Terminal, navigate to your Loggy project folder:<br>
            <code style="background: #fff; padding: 4px 8px; display: inline-block; margin-top: 4px;">cd /path/to/loggy</code>
        </p>`;
    }

    status.innerHTML = `
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; border: 1px solid #ddd;">
            ${extraInstructions}

            <p style="margin: 0 0 8px 0;"><strong>Copy this command:</strong></p>
            <p style="margin: 0 0 12px 0; font-size: 12px; color: #666;">
                This creates a config file that lets Chrome talk to Loggy's proxy. Nothing is installed.
            </p>
            <textarea id="installCommand" readonly style="width: 100%; height: 100px; font-family: monospace; font-size: 11px; padding: 10px; border: 2px solid #4A90D9; border-radius: 4px; resize: none;">${command}</textarea>
            <button id="copyBtn" style="width: 100%; background: #4A90D9; color: white; border: none; padding: 14px; border-radius: 6px; font-size: 15px; cursor: pointer; margin-top: 12px;">Copy Command</button>
            <div style="background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 12px; margin-top: 12px;">
                <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 600;">Then open Terminal:</p>
                <p style="margin: 0; font-size: 12px; color: #666;">
                    Press <kbd style="background: #eee; padding: 2px 6px; border-radius: 3px; border: 1px solid #ccc;">Cmd</kbd> + <kbd style="background: #eee; padding: 2px 6px; border-radius: 3px; border: 1px solid #ccc;">Space</kbd>, type <strong>Terminal</strong>, press Enter
                </p>
            </div>
            <p style="color: #666; font-size: 12px; margin: 12px 0 0 0; text-align: center;">
                Paste with <kbd style="background: #eee; padding: 2px 6px; border-radius: 3px; border: 1px solid #ccc;">Cmd+V</kbd> and press Enter
            </p>
        </div>
    `;

    // Add copy button handler
    setTimeout(() => {
        document.getElementById('copyBtn').addEventListener('click', () => {
            const textarea = document.getElementById('installCommand');
            textarea.select();
            document.execCommand('copy');
            document.getElementById('copyBtn').textContent = '✓ Copied!';
            setTimeout(() => {
                document.getElementById('copyBtn').textContent = 'Copy Command';
            }, 2000);
        });
    }, 100);

    document.getElementById('step3').style.display = 'block';
}

// Initialize when DOM is ready
function initialize() {
    getExtensionId();

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
