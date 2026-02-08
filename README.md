<div align="center">
  <img width="1200" height="475" alt="Candy-Paqet Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
  
  # 🍬 Candy-Paqet VPN
  
  [![Build and Release](https://github.com/AmiRCandy/Candy-Paqet/actions/workflows/build.yml/badge.svg)](https://github.com/AmiRCandy/Candy-Paqet/actions/workflows/build.yml)
  [![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
  [![Platform: Windows](https://img.shields.io/badge/Platform-Windows-blue.svg)](https://www.microsoft.com/windows)

  **A high-performance, cyberpunk-infused VPN client for Windows.**  
  *Bridging the gap between raw power and neon aesthetics.*
</div>

---

## 🚀 Overview

**Candy-Paqet** is a professional-grade VPN client focused on speed, security, and a premium user experience. Built on top of the powerful `paqet` engine and `sing-box` tunneling service, it provides a seamless interface for managing complex network connections with a stylish "Cyber HUD" interface.

## ✨ Core Features

- 🛠️ **Dual Connection Modes**:
    - **TUN Mode**: Global system-level tunneling using `sing-box` for full device protection.
    - **SOCKS5 Proxy**: Lightweight application-level proxying for specific workflows.
- ⚡ **Turbo-Charged Engine**: Leverages `paqet` (KCP/TCP) for low-latency connections even in unstable network environments.
- 💾 **Portable & Lightweight**: Distributed as a single, zero-install executable. Just download and run.
- 🎨 **Rich Cyberpunk UI**:
    - Retro-futuristic HUD with scanline effects and neon glow.
    - Real-time terminal logs and connection analytics.
    - Interactive Dashboard with uptime tracking.
- 🔧 **Zero-Config Setup**: Automatically detects, downloads, and initializes pre-compiled `paqet` and `sing-box` binaries on the first run.
- 📥 **Background Ready**: Seamlessly minimizes to the System Tray to keep your connection alive without cluttering your workspace.
- 🔐 **Privacy First**: Built-in support for encrypted DNS (DoH) via customizable DNS servers.

## 🛠️ Usage

1. **Download**: Grab the latest `Candy-Paqet.exe` from the [Releases](https://github.com/AmiRCandy/Candy-Paqet/releases) page.
2. **Launch**: Run the executable. It will automatically download the necessary core binaries on first start.
3. **Configure**: Add your server details (IP, Port, and Secret).
4. **Connect**: Choose between TUN or SOCKS mode and hit **INITIALIZE**.
    - *Note: TUN mode requires Administrative privileges to modify network routing.*

## 💻 Development

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [Git](https://git-scm.com/)

### Getting Started
```bash
# Clone the repository
git clone https://github.com/AmiRCandy/Candy-Paqet.git
cd Candy-Paqet

# Install dependencies
npm install

# Run in Development mode (Vite + Electron)
npm run electron-dev
```

### Building for Production
```bash
# Generate Portable Windows EXE
npm run electron-pack-win
```

## 🏗️ Tech Stack

- **Core Engine**: [paqet](https://github.com/hanselime/paqet)
- **Tunneling**: [sing-box](https://github.com/SagerNet/sing-box)
- **Frontend**: React 19 + TypeScript + Lucide Icons
- **Desktop Wrapper**: Electron 32
- **Styling**: Vanilla CSS with Cyber-Themes
- **CI/CD**: GitHub Actions

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">
  Developed with ❤️ by <a href="https://github.com/AmiRCandy">AmiRCandy</a>
</div>
