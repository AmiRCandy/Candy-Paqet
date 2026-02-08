<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Candy-Paqet VPN

A sleek, cyberpunk-themed VPN client desktop application built with React, TypeScript, and Electron.

View your app in AI Studio: https://ai.studio/apps/drive/15kq5P1HWbe2wMX07UKp5EmI0-6LRyJov

## Features

- 🛡️ **Cyberpunk UI** - Retro terminal aesthetic with scanlines and glow effects
- 🌐 **Multi-Server Support** - Configure and manage multiple VPN servers
- 🔐 **Secure Connections** - AES-256-GCM encryption simulation
- 📊 **Real-time Monitoring** - Connection status and uptime tracking
- 🌓 **Dark/Light Mode** - Toggle between cyber and clean themes
- 📱 **Cross-Platform** - Runs on Windows, macOS, and Linux
- 🔧 **Auto-Setup** - Automatically downloads required paqet binary on first run
- 📥 **Progress Tracking** - Visual download progress with detailed status

## Development

**Prerequisites:** Node.js

### Web Version (Development)
1. Install dependencies:
   ```bash
   npm install
   ```
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the web app:
   ```bash
   npm run dev
   ```

### Desktop Version (Electron)

#### Development Mode
Run both the Vite dev server and Electron simultaneously:
```bash
npm run electron-dev
```

#### Production Build
Build and package for your platform:
```bash
# Build for current platform
npm run electron-pack

# Build for specific platforms
npm run electron-pack-win    # Windows
npm run electron-pack-mac    # macOS
npm run electron-pack-linux  # Linux
```

#### Manual Testing
After building, you can also run the packaged app directly:
```bash
npm run electron
```

### Binary Download Configuration

The app automatically checks for the `paqet` binary on startup. Download URLs are configured in `metadata.json`:

```json
{
  "paqet": {
    "downloads": {
      "win32": {
        "x64": "https://your-domain.com/downloads/paqet-windows-x64.exe",
        "x86": "https://your-domain.com/downloads/paqet-windows-x86.exe"
      },
      "darwin": {
        "x64": "https://your-domain.com/downloads/paqet-macos-x64",
        "arm64": "https://your-domain.com/downloads/paqet-macos-arm64"
      },
      "linux": {
        "x64": "https://your-domain.com/downloads/paqet-linux-x64",
        "arm64": "https://your-domain.com/downloads/paqet-linux-arm64"
      }
    }
  }
}
```

**Important**: Update these URLs to point to your actual paqet binary releases before distributing the app.
