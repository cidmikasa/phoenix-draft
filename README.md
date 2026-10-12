# 🔥 Phoenix Draft

A broadcast-ready draft tool for **Mobile Legends: Bang Bang** esports tournaments and scrims.

![Phoenix Draft](assets/broadcast-logo.png)

---

## ✨ Features

- 🎬 **Cinematic pre-draft → draft → complete flow** with animated transitions
- 🎯 **MLBB M& World Series tournament draft order** (20 phases)
- ⏱️ **Auto-timer** with per-phase reset and double-pick awareness
- 🎮 **133 heroes** loaded from JSON — searchable, clickable, auto-locking
- 🎨 **Broadcast-grade visuals** (angular shapes, cyan/red sides, gold highlights)
- 🖼️ **Hero portraits** (rectangle for picks, round + red tint for bans)
- 🏆 **Match format selector** (BO1 / BO3 / BO5 / BO7) with auto score dots
- 🤝 **Flexible sponsor strip** (up to 6 logos)
- 📺 **Captain cam placeholders** — layer Discord feeds through OBS
- 🔄 **Cross-window sync** via Electron IPC (control ↔ display)
- 📦 **Packaged as a desktop app** — no browser, no Live Server needed
- 🌐 **Hero database auto-updater** — new heroes without app rebuilds

---

## 📸 Screenshots

_Coming soon_ — pre-draft, live draft, draft complete

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** v18+ — [download](https://nodejs.org)
- **Git** — [download](https://git-scm.com)

### Install & Run

```bash
# Clone the repo
git clone https://github.com/cidmikasa/phoenix-draft.git
cd phoenix-draft

# Install dependencies
npm install

# Run in development
npm start

Two windows will open:

Control Panel — for the operator

Display — for the broadcast feed (borderless, fullscreen-able)

Keyboard Shortcuts
Key	Action
Ctrl + F	Toggle display window fullscreen
Ctrl + Shift + F	Toggle control window fullscreen
Win + Shift + ←/→	Move display window between monitors (Windows)
Space (in control)	Start / Pause the draft timer
R (in control)	Reset entire draft
📦 Building the Installer
bash
# Windows installer (.exe)
npm run build:win

# macOS (.dmg)
npm run build:mac

# Linux (.AppImage)
npm run build:linux
The installer will be in dist/.

🎨 Design DNA
Blue side = electric cyan #2de2ff

Red side = phoenix red #e82a2a

Accents = gold #f5c842, purple #7a3fff

Background = near-black navy #050202

Fonts = Orbitron (headers), Chakra Petch (body)

Angular shapes, no rounded corners. Broadcast hardware feel.

📁 Project Structure
text
phoenix-draft/
├── main.js                 # Electron main process (2 windows + IPC)
├── preload.js              # Safe IPC bridge
├── display.html            # Broadcast overlay (4 views)
├── control.html            # Control panel
├── heroes.json             # 133 heroes (bundled fallback)
├── heroes-version.json     # Version check for auto-updater
├── scripts/
│   └── update-heroes.js    # Hero database updater
├── js/
│   ├── state.js            # State engine + localStorage
│   ├── render.js           # Display rendering
│   ├── controls.js         # Control panel logic
│   ├── ipc-sync.js         # Electron IPC sync layer
│   └── updater.js          # Hero database version check
├── styles/
│   └── phoenix.css         # Full theme
└── assets/
    ├── heroes.json         # (mirror)
    ├── bg-hall-of-glory.png
    ├── broadcast-logo.png
    └── images/             # Hero portraits
🎮 Draft Rules (MLBB M& World Series)
20 phases total:

Ban Phase 1 (6 bans) — Blue starts, alternating

Pick Phase 1 (6 picks) — 1-2-2-1 pattern

Ban Phase 2 (4 bans) — Red starts, alternating

Pick Phase 2 (4 picks) — 1-2-1 pattern, Red starts

Timer defaults to 50 seconds per phase. Auto-resets on new pick group. Auto-advances when time expires.

🌐 Hero Database Updates
Hero data lives in a separate repo: phoenix-draft-data

When Moonton releases a new hero:

bash
npm run update-heroes
The script fetches, diffs, and (after confirmation) pushes the updated JSON to the data repo. All installed apps auto-detect and download the update on next launch (~50 KB).

🤝 Contributing
This is a personal tournament tool, but PRs are welcome. Please:

Fork the repo

Create a feature branch

Test locally (npm start)

Submit a PR with a clear description