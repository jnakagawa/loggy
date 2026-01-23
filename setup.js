// Setup Assistant JavaScript
// Redirects users to download the .pkg installer

const GITHUB_REPO = 'jnakagawa/loggy';
const PKG_NAME = 'loggy-proxy-macos-universal.pkg';

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

// Fetch latest release version from GitHub
async function getLatestRelease() {
    try {
        const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
        if (response.ok) {
            const release = await response.json();
            return release.tag_name.replace(/^v/, '');
        }
    } catch (e) {
        console.log('Could not fetch latest release:', e);
    }
    return '1.0.0'; // Fallback version
}

// Show the installer UI
async function showInstaller() {
    const status = document.getElementById('installStatus');
    const extensionId = getExtensionId();

    if (!extensionId) {
        status.innerHTML = `
            <div style="background: #fff3cd; padding: 16px; border-radius: 8px; border: 1px solid #ffc107;">
                <strong>Extension ID not found</strong>
                <p style="margin: 8px 0 0 0;">Click "Open Setup Assistant" from the extension panel.</p>
            </div>
        `;
        return;
    }

    const version = await getLatestRelease();
    const downloadUrl = `https://github.com/${GITHUB_REPO}/releases/latest/download/loggy-proxy-${version}-macos-universal.pkg`;

    // Show download instructions
    status.innerHTML = `
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; border: 1px solid #ddd;">
            <div style="text-align: center; margin-bottom: 20px;">
                <a href="${downloadUrl}"
                   id="downloadLink"
                   style="display: inline-block; background: #4A90D9; color: white; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-size: 18px; font-weight: 600;">
                    Download Loggy Proxy Installer
                </a>
                <p style="color: #666; font-size: 13px; margin: 12px 0 0 0;">
                    Version ${version} for macOS (Intel & Apple Silicon)
                </p>
            </div>

            <div style="background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 16px; margin-top: 16px;">
                <p style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600;">After downloading:</p>
                <ol style="margin: 0; padding-left: 20px; font-size: 14px; color: #333;">
                    <li style="margin-bottom: 8px;">Double-click the downloaded <code>.pkg</code> file</li>
                    <li style="margin-bottom: 8px;">Follow the installer prompts (click Continue, Install)</li>
                    <li style="margin-bottom: 8px;">Return here and click <strong>"I've Installed It"</strong></li>
                </ol>
            </div>

            <div style="text-align: center; margin-top: 20px;">
                <button id="verifyInstallBtn"
                        style="background: #4caf50; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-size: 15px; cursor: pointer;">
                    I've Installed It - Verify Setup
                </button>
            </div>

            <details style="margin-top: 20px;">
                <summary style="cursor: pointer; color: #666; font-size: 13px;">Having trouble? Manual installation</summary>
                <div style="margin-top: 12px; padding: 12px; background: #fff; border-radius: 4px; font-size: 12px;">
                    <p style="margin: 0 0 8px 0;">If the installer doesn't work, you can install manually:</p>
                    <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 11px;">curl -fsSL https://raw.githubusercontent.com/${GITHUB_REPO}/main/install.sh | bash -s -- ${extensionId}</pre>
                </div>
            </details>
        </div>
    `;

    // Add verify button handler
    setTimeout(() => {
        const verifyBtn = document.getElementById('verifyInstallBtn');
        if (verifyBtn) {
            verifyBtn.addEventListener('click', verifyInstallation);
        }
    }, 100);
}

// Verify the installation worked
async function verifyInstallation() {
    const status = document.getElementById('installStatus');
    const extensionId = document.getElementById('extensionId').textContent;

    // Try to communicate with the native host
    try {
        const response = await chrome.runtime.sendMessage({ action: 'pingNativeHost' });

        if (response && response.success) {
            // Installation successful!
            status.innerHTML = `
                <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; border: 1px solid #4caf50;">
                    <div style="text-align: center;">
                        <span style="font-size: 48px;">&#10003;</span>
                        <h3 style="margin: 10px 0; color: #2e7d32;">Setup Complete!</h3>
                        <p style="color: #333; margin-bottom: 16px;">Loggy Proxy is installed and ready to use.</p>
                        <p style="color: #666; font-size: 13px;">
                            Close this tab and click <strong>"Start Proxy"</strong> in the extension to begin capturing events.
                        </p>
                    </div>
                </div>
            `;
            document.getElementById('step3').style.display = 'block';
        } else {
            showVerifyError(extensionId, 'Native host responded but setup incomplete.');
        }
    } catch (e) {
        showVerifyError(extensionId, e.message);
    }
}

function showVerifyError(extensionId, errorMsg) {
    const verifyBtn = document.getElementById('verifyInstallBtn');
    if (verifyBtn) {
        verifyBtn.outerHTML = `
            <div style="background: #fff3cd; padding: 12px; border-radius: 6px; margin-top: 12px;">
                <p style="margin: 0 0 8px 0; font-weight: 600;">Setup not detected yet</p>
                <p style="margin: 0; font-size: 13px; color: #666;">
                    Make sure you completed the installer. If the issue persists, try the manual installation above.
                </p>
                <p style="margin: 8px 0 0 0; font-size: 11px; color: #999;">Error: ${errorMsg}</p>
                <button id="retryBtn"
                        style="margin-top: 12px; background: #4A90D9; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                    Try Again
                </button>
            </div>
        `;
        setTimeout(() => {
            const retryBtn = document.getElementById('retryBtn');
            if (retryBtn) retryBtn.addEventListener('click', () => location.reload());
        }, 0);
    }
}

// Initialize when DOM is ready
function initialize() {
    showInstaller();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
