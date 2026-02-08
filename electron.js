const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { net } = require('electron');
const { exec, execSync } = require('child_process');
const { sudo } = require('exec-root');
const { promisify } = require('util');
const execAsync = promisify(exec);
const isDev = process.env.NODE_ENV === 'development';
const os = require('os');

// Hardcoded download URLs for paqet binary
const PAQET_DOWNLOAD_URLS = {
  'win32': {
    'x64': 'https://github.com/hanselime/paqet/releases/download/v1.0.0-alpha.15/paqet-windows-amd64-v1.0.0-alpha.15.zip',
    'x86': 'https://github.com/hanselime/paqet/releases/download/v1.0.0-alpha.15/paqet-windows-386-v1.0.0-alpha.15.zip'
  },
  'darwin': {
    'x64': 'https://github.com/hanselime/paqet/releases/download/v1.0.0-alpha.15/paqet-darwin-amd64-v1.0.0-alpha.15.tar.gz',
    'arm64': 'https://github.com/hanselime/paqet/releases/download/v1.0.0-alpha.15/paqet-darwin-arm64-v1.0.0-alpha.15.tar.gz'
  },
  'linux': {
    'x64': 'https://github.com/hanselime/paqet/releases/download/v1.0.0-alpha.15/paqet-linux-amd64-v1.0.0-alpha.15.tar.gz',
    'arm64': 'https://github.com/hanselime/paqet/releases/download/v1.0.0-alpha.15/paqet-linux-arm64-v1.0.0-alpha.15.tar.gz',
    'arm32': 'https://github.com/hanselime/paqet/releases/download/v1.0.0-alpha.15/paqet-linux-arm32-v1.0.0-alpha.15.tar.gz'
  }
};

const SING_BX_DOWNLOAD_URLS = {
  'win32': {
    'x64': 'https://github.com/SagerNet/sing-box/releases/download/v1.12.20/sing-box-1.12.20-windows-amd64.zip',
    'x86': 'https://github.com/SagerNet/sing-box/releases/download/v1.12.20/sing-box-1.12.20-windows-386.zip'
  },
  'darwin': {
    'x64': 'https://github.com/SagerNet/sing-box/releases/download/v1.12.20/sing-box-1.12.20-darwin-amd64.tar.gz',
    'arm64': 'https://github.com/SagerNet/sing-box/releases/download/v1.12.20/sing-box-1.12.20-darwin-arm64.tar.gz'
  },
  'linux': {
    'x64': 'https://github.com/SagerNet/sing-box/releases/download/v1.12.20/sing-box-1.12.20-linux-amd64.tar.gz',
    'arm64': 'https://github.com/SagerNet/sing-box/releases/download/v1.12.20/sing-box-1.12.20-linux-arm64.tar.gz'
  }
};

const YAML_PAQET_CLINT_EXAMPLE = `role: "client"
log:
  level: "info"
socks5:
  - listen: "127.0.0.1:{SOCKS_PORT}" # Default port 1404
    username: "{SOCKS_USERNAME}" # Default blank
    password: "{SOCKS_PASSWORD}" # Default blank
network:
  interface: "{IFACE_NAME}"
  guid: '\\Device\\NPF_{GUID_OF_MAIN_NETWORK}'
  ipv4:
    addr: "{LOCAL_IP}:0"
    router_mac: "{PHYSICAL_ADDRESS}"
  tcp:
    local_flag: ["PA"]
    remote_flag: ["PA"]
server:
  addr: "{SERVER_IP}:{SERVER_PORT}"

transport:
  protocol: "kcp"
  conn: 1          # Number of connections (1-256, default: 1)
  kcp:
    mode: "{MODE}"              # KCP mode: normal, fast, fast2, fast3, manual , default fast
    key: "{SECRET_KEY}"`;
const DEFAULT_DNS = 'https://1.1.1.1/dns-query';
const SING_BOX_TUN_JSON = `{
  "log": {
    "level": "info",
    "timestamp": true
  },
  "dns": {
    "servers": [
      {
        "tag": "dns-remote",
        "address": "{DNS_SERVER}",
        "address_resolver": "dns-local",
        "strategy": "prefer_ipv4",
        "detour": "socks-out"
      },
      {
        "tag": "dns-local",
        "address": "223.5.5.5",
        "detour": "direct-out"
      },
      {
        "tag": "dns-block",
        "address": "rcode://success"
      }
    ],
    "final": "dns-remote",
    "strategy": "prefer_ipv4",
    "disable_cache": false,
    "disable_expire": false
  },
  "inbounds": [
    {
      "type": "tun",
      "tag": "tun-in",
      "interface_name": "CandyPaqet",
      "inet4_address": "172.19.0.1/30",
      "inet6_address": "fdfe:dcba:9876::1/126",
      "mtu": 9000,
      "auto_route": true,
      "strict_route": false,
      "sniff": true,
      "sniff_override_destination": false,
      "stack": "gvisor",
      "endpoint_independent_nat": true,
      "platform": {
        "http_proxy": {
          "enabled": true,
          "server": "127.0.0.1",
          "server_port": 2080
        }
      }
    }
  ],
  "outbounds": [
    {
      "type": "socks",
      "tag": "socks-out",
      "server": "127.0.0.1",
      "server_port": {SOCKS_PORT}
    },
    {
      "type": "direct",
      "tag": "direct-out"
    },
    {
      "type": "dns",
      "tag": "dns-out"
    },
    {
      "type": "block",
      "tag": "block-out"
    }
  ],
  "route": {
    "rules": [
      {
        "protocol": "dns",
        "outbound": "dns-out"
      }
    ],
    "final": "socks-out",
    "auto_detect_interface": true
  }
}`;

// Load metadata for other purposes (optional)
let metadata = {};
try {
  metadata = JSON.parse(fs.readFileSync(path.join(__dirname, 'metadata.json'), 'utf8'));
} catch (error) {
  console.warn('Could not load metadata.json (optional):', error.message);
}

let setupWindow = null;
let mainWindow = null;

// Determine binary name based on platform
function getBinaryName(type = 'paqet') {
  const platform = process.platform;
  return platform === 'win32' ? `${type}.exe` : type;
}

// Get the full path to the binary
function getBinaryPath(type = 'paqet') {
  const binaryName = getBinaryName(type);
  // If we're running from source (dev), keep it in the project root
  if (isDev) {
    return path.join(__dirname, binaryName);
  }
  // In production (asar), we must use a writable location like userData
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, binaryName);
}

// Check if required binaries exist
function checkBinaries() {
  const binaries = ['paqet', 'sing-box'];
  const missing = [];

  for (const type of binaries) {
    const binaryPath = getBinaryPath(type);
    try {
      const exists = fs.existsSync(binaryPath);
      console.log(`Checking ${type} at ${binaryPath}: ${exists ? 'EXISTS' : 'MISSING'}`);
      if (!exists) missing.push(type);
    } catch (error) {
      console.error(`Error checking ${type} binary:`, error);
      missing.push(type);
    }
  }
  return missing;
}

// Create setup window for downloading binaries
function createSetupWindow(missingBinaries) {
  setupWindow = new BrowserWindow({
    width: 500,
    height: 400,
    resizable: false,
    minimizable: false,
    maximizable: false,
    closable: false, // Prevent closing until download completes
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    title: 'Candy-Paqet - Setup',
    show: false,
  });

  // Create HTML content for setup window
  const setupHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Candy-Paqet Setup</title>
      <style>
        body {
          font-family: 'Courier New', monospace;
          background: #0a0a0c;
          color: #00ff41;
          margin: 0;
          padding: 20px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          height: 100vh;
          text-align: center;
        }
        .container {
          max-width: 400px;
        }
        h1 {
          color: #00ff41;
          margin-bottom: 20px;
          font-size: 24px;
        }
        p {
          margin-bottom: 20px;
          line-height: 1.6;
        }
        .download-btn {
          background: #00ff41;
          color: black;
          border: none;
          padding: 12px 24px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          border-radius: 4px;
          margin-bottom: 20px;
          transition: all 0.3s;
        }
        .download-btn:hover {
          background: #00cc33;
          transform: translateY(-2px);
        }
        .download-btn:disabled {
          background: #666;
          cursor: not-allowed;
          transform: none;
        }
        .progress-container {
          width: 100%;
          margin-bottom: 20px;
        }
        .progress-bar {
          width: 100%;
          height: 20px;
          background: #333;
          border-radius: 10px;
          overflow: hidden;
          margin-bottom: 10px;
        }
        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #00ff41, #00cc33);
          width: 0%;
          transition: width 0.3s ease;
        }
        .progress-text {
          font-size: 14px;
          color: #00ff41;
        }
        .status {
          font-size: 12px;
          color: #888;
          margin-top: 10px;
        }
        .error {
          color: #ff4444;
          margin-top: 10px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>⚠️ BINARIES REQUIRED</h1>
        <p>Required binaries (${missingBinaries.join(', ')}) are missing from the application directory. They must be downloaded to continue.</p>

        <div class="progress-container" id="progressContainer" style="display: none;">
          <div class="progress-bar">
            <div class="progress-fill" id="progressFill"></div>
          </div>
          <div class="progress-text" id="progressText">Preparing download...</div>
        </div>

        <button class="download-btn" id="downloadBtn">DOWNLOAD REQUIRED BINARIES</button>

        <div class="status" id="statusText">
          Platform: ${process.platform} (${getCurrentArchKey()})
        </div>

        <div class="error" id="errorText" style="display: none;"></div>
      </div>

      <script>
        const { ipcRenderer } = require('electron');

        const downloadBtn = document.getElementById('downloadBtn');
        const progressContainer = document.getElementById('progressContainer');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const errorText = document.getElementById('errorText');

        downloadBtn.addEventListener('click', () => {
          downloadBtn.disabled = true;
          downloadBtn.textContent = 'DOWNLOADING...';
          progressContainer.style.display = 'block';
          errorText.style.display = 'none';

          ipcRenderer.send('download-binaries');
        });

        ipcRenderer.on('download-progress', (event, progress) => {
          progressFill.style.width = progress.percent + '%';
          if (progress.percent < 100) {
            progressText.textContent = \`Downloading \${progress.type}... \${progress.percent.toFixed(1)}% (\${progress.transferred} / \${progress.total})\`;
          } else {
            progressText.textContent = \`Installing \${progress.type}...\`;
          }
        });

        ipcRenderer.on('download-complete', (event, type) => {
          progressText.textContent = \`\${type} installed!\`;
        });

        ipcRenderer.on('all-downloads-complete', () => {
          progressText.textContent = 'All binaries installed! Starting application...';
          downloadBtn.textContent = 'COMPLETED';
          setTimeout(() => {
            ipcRenderer.send('setup-complete');
          }, 1000);
        });

        ipcRenderer.on('download-error', (event, error) => {
          errorText.style.display = 'block';
          errorText.textContent = 'Download failed: ' + error;
          downloadBtn.disabled = false;
          downloadBtn.textContent = 'RETRY DOWNLOAD';
          progressContainer.style.display = 'none';
        });
      </script>
    </body>
    </html>
  `;

  setupWindow.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(setupHTML));

  setupWindow.once('ready-to-show', () => {
    setupWindow.show();
  });
}

function createMainWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 450,
    height: 900,
    minWidth: 450,
    minHeight: 900,
    maxWidth: 450,
    maxHeight: 900,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.resolve(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset',
    icon: path.join(__dirname, 'assets/icon.png'),
    show: false,
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Emitted when the window is closed.
  mainWindow.on('closed', () => {
    // Dereference the window object
    mainWindow = null;
  });
}

// Map process.arch to metadata.json architecture keys
function getArchKey(arch) {
  switch (arch) {
    case 'x64':
      return 'x64';
    case 'ia32':
      return 'x86';
    case 'arm64':
      return 'arm64';
    case 'arm':
      return 'arm32';
    default:
      return arch;
  }
}

// Get current architecture key for display
function getCurrentArchKey() {
  return getArchKey(process.arch);
}

// Download functionality
function downloadBinary(type, urlList) {
  return new Promise(async (resolve, reject) => {
    const binaryPath = getBinaryPath(type);
    const binaryName = getBinaryName(type);

    // Get download URL from provided URL list
    const platform = process.platform;
    const archKey = getArchKey(process.arch);
    const downloadUrl = urlList[platform]?.[archKey];

    console.log(`=== DOWNLOAD DEBUG (${type}) ===`);
    console.log('process.platform:', platform);
    console.log('process.arch:', process.arch);
    console.log('archKey (mapped):', archKey);
    console.log('downloadUrl:', downloadUrl);
    console.log('binaryName:', binaryName);
    console.log('binaryPath:', binaryPath);

    if (!downloadUrl) {
      console.error(`DOWNLOAD URL NOT FOUND FOR ${type}!`);
      reject(new Error(`No download URL found for ${type} on ${platform}/${archKey}.`));
      return;
    }

    try {
      // Create temp directory for extraction
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `${type}-download-`));
      console.log('Created temp directory:', tempDir);

      // Determine archive path (temporary)
      const urlParts = downloadUrl.split('/');
      const archiveName = urlParts[urlParts.length - 1];
      const archivePath = path.join(tempDir, archiveName);
      console.log('Archive will be saved to:', archivePath);

      const request = net.request(downloadUrl);
      request.setHeader('User-Agent', 'Candy-Paqet/1.0.4');

      request.on('response', (response) => {
        console.log('Download response status:', response.statusCode);
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        const fileStream = fs.createWriteStream(archivePath);
        const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
        let receivedBytes = 0;

        response.on('data', (chunk) => {
          receivedBytes += chunk.length;
          fileStream.write(chunk);

          // Send progress update
          if (setupWindow && totalBytes > 0) {
            const progress = {
              type: type,
              percent: (receivedBytes / totalBytes) * 100,
              transferred: formatBytes(receivedBytes),
              total: formatBytes(totalBytes)
            };
            setupWindow.webContents.send('download-progress', progress);
          }
        });

        response.on('end', async () => {
          fileStream.end();

          try {
            await extractArchive(archivePath, tempDir);

            // Find and move the binary to final location
            const extractedBinaryPath = findExtractedBinary(tempDir, binaryName, type);

            // Ensure destination directory exists
            const destDir = path.dirname(binaryPath);
            if (!fs.existsSync(destDir)) {
              fs.mkdirSync(destDir, { recursive: true });
            }

            // Remove existing binary if it exists
            if (fs.existsSync(binaryPath)) {
              fs.unlinkSync(binaryPath);
            }

            fs.copyFileSync(extractedBinaryPath, binaryPath);

            // Set executable permissions on Unix-like systems
            if (process.platform !== 'win32') {
              fs.chmodSync(binaryPath, '755');
            }

            console.log(`${type} successfully installed!`);

            // Clean up temp directory
            try {
              fs.rmSync(tempDir, { recursive: true, force: true });
            } catch (e) { }

            resolve();
          } catch (error) {
            console.error(`Error during ${type} installation:`, error);
            reject(error);
          }
        });

        response.on('error', (error) => {
          fileStream.end();
          reject(error);
        });
      });

      request.on('error', (error) => {
        reject(error);
      });

      request.end();
    } catch (error) {
      reject(error);
    }
  });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Extract downloaded archive
async function extractArchive(archivePath, extractTo) {
  const platform = process.platform;
  const archiveName = path.basename(archivePath);

  console.log(`Extracting ${archiveName} to ${extractTo}`);

  try {
    // Ensure extract directory exists
    if (!fs.existsSync(extractTo)) {
      fs.mkdirSync(extractTo, { recursive: true });
    }

    if (platform === 'win32') {
      console.log('Using tar command for Windows (zip)...');
      // Use tar (available in Windows 10+) to extract zip
      // Note: tar -xf works for both .zip and .tar.gz
      const command = `tar -xf "${archivePath}" -C "${extractTo}"`;
      await execAsync(command);
    } else {
      console.log('Using tar command for Unix (tar.gz)...');
      const command = `tar -xzf "${archivePath}" -C "${extractTo}"`;
      await execAsync(command);
    }

    console.log('Extraction completed successfully');
    return true;
  } catch (error) {
    console.error('Extraction failed:', error);
    throw new Error(`Extraction failed: ${error.message}`);
  }
}

// Find the extracted binary file
function findExtractedBinary(extractDir, expectedName, type = 'paqet') {
  console.log(`Looking for binary ${expectedName} in ${extractDir}`);

  function searchDirectory(dir) {
    try {
      const files = fs.readdirSync(dir);

      for (const file of files) {
        const fullPath = path.join(dir, file);
        try {
          const stat = fs.statSync(fullPath);

          if (stat.isFile()) {
            if (file.endsWith('.zip') || file.endsWith('.tar.gz') || file.endsWith('.tgz')) {
              continue;
            }

            const isWindows = process.platform === 'win32';
            const isExe = file.toLowerCase().endsWith('.exe');
            const startsWithPrefix = file.toLowerCase().startsWith(type);

            if (file === expectedName) {
              return fullPath;
            }

            if (isWindows && startsWithPrefix && isExe) {
              return fullPath;
            }

            if (!isWindows && startsWithPrefix && !file.includes('.')) {
              return fullPath;
            }
          } else if (stat.isDirectory()) {
            const result = searchDirectory(fullPath);
            if (result) return result;
          }
        } catch (e) { }
      }
    } catch (e) { }
    return null;
  }

  const result = searchDirectory(extractDir);
  if (!result) {
    throw new Error(`Could not find ${expectedName} in extracted files.`);
  }

  return result;
}

// IPC handlers
ipcMain.on('download-binaries', async (event) => {
  try {
    const missing = checkBinaries();

    for (const type of missing) {
      const urlList = type === 'paqet' ? PAQET_DOWNLOAD_URLS : SING_BX_DOWNLOAD_URLS;
      await downloadBinary(type, urlList);
      if (setupWindow) {
        setupWindow.webContents.send('download-complete', type);
      }
    }

    if (setupWindow) {
      setupWindow.webContents.send('all-downloads-complete');
    }
  } catch (error) {
    console.error('Download failed:', error);
    if (setupWindow) {
      setupWindow.webContents.send('download-error', error.message || String(error));
    }
  }
});

// File-based Storage paths
function getConfigPaths() {
  const dataPath = isDev ? __dirname : app.getPath('userData');
  return {
    config: path.join(dataPath, 'candy.json'),
    log: path.join(dataPath, 'candy.log')
  };
}

function initStorage() {
  const { config, log } = getConfigPaths();

  if (!fs.existsSync(config)) {
    const initialConfig = {
      servers: [],
      mode: 'TUN',
      dns: DEFAULT_DNS,
      globalSocks: {
        port: '1404',
        username: '',
        password: ''
      }
    };
    fs.writeFileSync(config, JSON.stringify(initialConfig, null, 2));
  }

  if (!fs.existsSync(log)) {
    fs.writeFileSync(log, `[SYSTEM] Log initialized at ${new Date().toISOString()}\n`);
  }
}

// Binary Execution Logic
let activeProcess = null;
let singBoxProcess = null;

function sendToLogs(message) {
  const { log: logPath } = getConfigPaths();
  const timestamp = new Date().toISOString();
  const fullMessage = `[${timestamp}] ${message}`;

  // Write to candy.log
  try {
    fs.appendFileSync(logPath, fullMessage + '\n');
  } catch (err) {
    console.error('Failed to write to candy.log:', err);
  }

  // Send to UI
  if (mainWindow) {
    mainWindow.webContents.send('paqet-log', message);
  }
}

// Settings IPC Handlers
ipcMain.handle('get-settings', () => {
  const { config } = getConfigPaths();
  try {
    return JSON.parse(fs.readFileSync(config, 'utf8'));
  } catch (err) {
    console.error('Failed to read candy.json:', err);
    return { servers: [], mode: 'TUN', globalSocks: { port: '1404', username: '', password: '' } };
  }
});

// Privilege Check
async function isElevated() {
  const platform = process.platform;
  try {
    if (platform === 'win32') {
      const { execSync } = require('child_process');
      execSync('net session', { stdio: 'ignore' });
      return true;
    } else {
      return process.getuid() === 0;
    }
  } catch (e) {
    return false;
  }
}

ipcMain.handle('get-elevation-status', async () => {
  return await isElevated();
});

// --- FIXED SECTION START ---
ipcMain.handle('get-network-info', async () => {
  console.log('[NETWORK] Discovery started (Native Scan)...');

  if (process.platform === 'win32') {
    try {
      const { execSync } = require('child_process');

      // 1. Get all UP adapters via PowerShell (Reliably Returns Name and GUID)
      const psCmd = 'powershell -NoProfile -ExecutionPolicy Bypass "Get-NetAdapter | Where-Object Status -eq Up | Select-Object Name, InterfaceGuid | ConvertTo-Json"';
      const ifacesOut = execSync(psCmd, { encoding: 'utf8', timeout: 5000 }).trim();

      if (!ifacesOut || ifacesOut === '[]') return [];

      const ifacesRaw = JSON.parse(ifacesOut);
      const ifaceList = Array.isArray(ifacesRaw) ? ifacesRaw : [ifacesRaw];

      // 2. Get IP details via ipconfig
      const rawIpconfig = execSync('chcp 65001 > nul && ipconfig', { encoding: 'utf8' });

      const results = ifaceList.map(adapter => {
        // Look for the block that matches this adapter name specifically.
        // We look for the Name followed by ":" and take everything until the next line that starts with a non-space char or end of string.
        const escapedName = adapter.Name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const sectionRegex = new RegExp(`(?:adapter|connection|)\\s*${escapedName}\\s*:[\\s\\S]+?(?=\\r?\\n[A-Z]|$)`, 'i');
        const section = rawIpconfig.match(sectionRegex)?.[0];

        if (!section) {
          console.warn(`[NETWORK] No ipconfig section found for: ${adapter.Name}`);
          return null;
        }

        const ipMatch = section.match(/IPv4 Address[^\:]*:\s*([^\s\r\n]+)/i);
        const gwMatch = section.match(/Default Gateway[^\:]*:\s*([^\s\r\n]+)/i);

        const ip = ipMatch ? ipMatch[1] : null;
        const gw = gwMatch ? gwMatch[1] : null;

        if (!ip) {
          console.warn(`[NETWORK] No IPv4 found in section for: ${adapter.Name}`);
          return null;
        }

        // 3. Get Router MAC via ARP
        let mac = '00:00:00:00:00:00';
        if (gw && gw !== '0.0.0.0') {
          try {
            const arp = execSync(`arp -a ${gw}`, { encoding: 'utf8', timeout: 2000 });
            const macMatch = arp.match(/([0-9a-f]{2}(-[0-9a-f]{2}){5})/i);
            if (macMatch) mac = macMatch[1]
          } catch (e) { }
        }

        return {
          name: adapter.Name,
          address: ip,
          mac: mac,
          guid: adapter.InterfaceGuid.replace(/[{}]/g, '')
        };
      }).filter(item => item !== null);

      console.log(`[NETWORK] Discovery Successful. Found ${results.length} active interfaces.`);
      return results;
    } catch (e) {
      console.error('[NETWORK] Native Discovery Failed:', e.message);
    }
  }

  // Fallback for non-Windows
  const interfaces = os.networkInterfaces();
  const fallback = [];
  for (const [name, info] of Object.entries(interfaces)) {
    for (const addr of info) {
      if (addr.family === 'IPv4' && !addr.internal) {
        fallback.push({ name, address: addr.address, mac: addr.mac || '00:00:00:00:00:00', guid: '' });
      }
    }
  }
  return fallback;
});
// --- FIXED SECTION END ---

ipcMain.on('save-settings', (event, settings) => {
  const { config } = getConfigPaths();
  try {
    fs.writeFileSync(config, JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error('Failed to save candy.json:', err);
  }
});

ipcMain.on('start-paqet', async (event, data) => {
  if (activeProcess) {
    sendToLogs("A process is already active. Stop it first.");
    return;
  }

  const { server: selectedServer, globalSocks, mode, dns } = data;
  const binaryPath = getBinaryPath();
  const dataDir = path.dirname(binaryPath);
  const yamlPath = path.join(dataDir, 'client.yaml');

  if (!fs.existsSync(binaryPath)) {
    sendToLogs("ERROR: Paqet binary not found.");
    if (mainWindow) mainWindow.webContents.send('paqet-status', 'error', 'Binary missing.');
    return;
  }

  // Generate YAML content
  let yamlContent = YAML_PAQET_CLINT_EXAMPLE;
  // Ensure GUID has braces if it doesn't already, as required by Windows device paths
  let rawGuid = selectedServer.advanced.guid || '';
  if (rawGuid && !rawGuid.startsWith('{')) rawGuid = `{${rawGuid}}`;

  const placeholders = {
    'SOCKS_PORT': globalSocks?.port || '1404',
    'SOCKS_USERNAME': globalSocks?.username || '',
    'SOCKS_PASSWORD': globalSocks?.password || '',
    'IFACE_NAME': selectedServer.advanced.iface || 'Ethernet',
    'GUID_OF_MAIN_NETWORK': rawGuid,
    'LOCAL_IP': selectedServer.advanced.localIp || '192.168.1.10',
    'PHYSICAL_ADDRESS': selectedServer.advanced.routerMac || '00:00:00:00:00:00',
    'SERVER_IP': selectedServer.ip,
    'SERVER_PORT': selectedServer.port,
    'MODE': selectedServer.advanced.kcpMode || 'fast',
    'SECRET_KEY': selectedServer.secret
  };

  for (const [key, value] of Object.entries(placeholders)) {
    yamlContent = yamlContent.split(`{${key}}`).join(value);
  }

  try {
    fs.writeFileSync(yamlPath, yamlContent);
    sendToLogs(`Configuration written: ${yamlPath}`);
  } catch (err) {
    sendToLogs(`ERROR: Failed to write client.yaml: ${err.message}`);
    if (mainWindow) mainWindow.webContents.send('paqet-status', 'error', 'Config write failed.');
    return;
  }

  const { spawn } = require('child_process');

  // 1. PING TEST
  sendToLogs("Verifying connection (Ping test)...");
  const pingArgs = ['ping', '-c', yamlPath];

  activeProcess = spawn(binaryPath, pingArgs);

  activeProcess.stdout.on('data', (data) => {
    const output = data.toString().trim();
    if (output) sendToLogs(`[PING] ${output}`);
  });

  activeProcess.stderr.on('data', (data) => {
    const output = data.toString().trim();
    if (output) sendToLogs(`[PING ERR] ${output}`);
  });

  activeProcess.on('close', (code) => {
    // If the process was killed externally (code null or signal SIGTERM), don't proceed to run
    if (code === null) {
      sendToLogs("Process terminated by user.");
      activeProcess = null;
      if (mainWindow) mainWindow.webContents.send('paqet-status', 'disconnected');
      return;
    }

    if (code !== 0) {
      sendToLogs(`PING FAILED (Exit ${code}). Connection check unsuccessful.`);
      activeProcess = null;
      if (mainWindow) {
        mainWindow.webContents.send('paqet-status', 'error', 'Ping test failed. Check server address/secret.');
      }
      return;
    }

    sendToLogs("Ping successful! Launching core runner...");

    // 2. RUN COMMAND
    const args = [
      'run',
      '-c', yamlPath
    ];

    sendToLogs(`Executing: paqet ${args.join(' ')}`);

    try {
      activeProcess = spawn(binaryPath, args);

      activeProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) sendToLogs(output);
      });

      activeProcess.stderr.on('data', (data) => {
        const output = data.toString().trim();
        if (output) sendToLogs(`[stderr] ${output}`);
      });

      activeProcess.on('close', (code) => {
        sendToLogs(`Paqet tunnel terminated (Exit Code ${code})`);
        activeProcess = null;
        if (mainWindow) {
          mainWindow.webContents.send('paqet-status', 'disconnected');
        }
      });

      activeProcess.on('error', (err) => {
        sendToLogs(`Spawn error: ${err.message}`);
        activeProcess = null;
        if (mainWindow) {
          mainWindow.webContents.send('paqet-status', 'error', err.message);
        }
      });

      if (mainWindow) {
        mainWindow.webContents.send('paqet-status', 'connected');
      }

      // 3. START SING-BOX IF IN TUN MODE
      if (mode === 'TUN') {
        const tunJsonPath = path.join(dataDir, 'tun.json');
        let tunContent = SING_BOX_TUN_JSON;

        const sbPlaceholders = {
          'DNS_SERVER': dns || DEFAULT_DNS,
          'SOCKS_PORT': globalSocks?.port || '1404'
        };

        for (const [key, value] of Object.entries(sbPlaceholders)) {
          tunContent = tunContent.split(`{${key}}`).join(value);
        }

        try {
          fs.writeFileSync(tunJsonPath, tunContent);
          sendToLogs(`sing-box configuration written: ${tunJsonPath}`);

          sendToLogs("Launching sing-box tunnel...");
          const sbArgs = ['run', '-c', tunJsonPath];
          const sbBinaryPath = getBinaryPath('sing-box');

          singBoxProcess = spawn(sbBinaryPath, sbArgs, {
            env: {
              ...process.env,
              ENABLE_DEPRECATED_SPECIAL_OUTBOUNDS: 'true',
              ENABLE_DEPRECATED_TUN_ADDRESS_X: 'true'
            }
          });

          singBoxProcess.stdout.on('data', (data) => {
            const output = data.toString().trim();
            if (output) sendToLogs(`[sing-box] ${output}`);
          });

          singBoxProcess.stderr.on('data', (data) => {
            const output = data.toString().trim();
            if (output) sendToLogs(`[sing-box ERR] ${output}`);
          });

          singBoxProcess.on('close', (code) => {
            sendToLogs(`sing-box terminated (Exit Code ${code})`);
            singBoxProcess = null;
            // If sing-box closes unexpectedly or during operation, stop everything
            if (activeProcess) {
              sendToLogs("sing-box closed. Stopping paqet...");
              activeProcess.kill('SIGTERM');
            }
            if (mainWindow) {
              mainWindow.webContents.send('paqet-status', 'disconnected');
            }
          });

          singBoxProcess.on('error', (err) => {
            sendToLogs(`sing-box spawn error: ${err.message}`);
            singBoxProcess = null;
            if (activeProcess) activeProcess.kill('SIGTERM');
            if (mainWindow) {
              mainWindow.webContents.send('paqet-status', 'error', `sing-box error: ${err.message}`);
            }
          });
        } catch (err) {
          sendToLogs(`Failed to initialize sing-box: ${err.message}`);
        }
      }
    } catch (err) {
      sendToLogs(`Failed to initialize tunnel: ${err.message}`);
      activeProcess = null;
      if (mainWindow) {
        mainWindow.webContents.send('paqet-status', 'error', err.message);
      }
    }
  });
});

ipcMain.on('stop-paqet', () => {
  if (activeProcess) {
    sendToLogs("Stopping active process...");
    activeProcess.kill('SIGTERM');
  }
  if (singBoxProcess) {
    sendToLogs("Stopping sing-box...");
    singBoxProcess.kill('SIGTERM');
  }
});

ipcMain.on('setup-complete', () => {
  if (setupWindow) {
    setupWindow.close();
    setupWindow = null;
  }
  createMainWindow();
});

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  initStorage();
  // Check for binaries on startup
  const missing = checkBinaries();
  if (missing.length === 0) {
    createMainWindow();
  } else {
    createSetupWindow(missing);
  }
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0 && !setupWindow) {
    // Only create main window if setup is complete
    const missing = checkBinaries();
    if (missing.length === 0) {
      createMainWindow();
    } else {
      createSetupWindow(missing);
    }
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
  });
});