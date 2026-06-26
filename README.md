# Pocket Edge

> **Your laptop in your pocket.** A React Native + Node.js app that turns your phone into a wireless development workstation — terminal, file browser, file transfer, and AI chat, all over your local Wi-Fi.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **📡 Auto-Discovery** | Finds your laptop automatically on the LAN using mDNS/Bonjour. Manual IP fallback included. |
| **💻 Remote Terminal** | Full xterm.js terminal running on your phone via WebView. Execute commands on your laptop from anywhere in the house. |
| **📁 File Browser** | Browse, navigate, and read your laptop's project files remotely with syntax-highlighted code preview. |
| **📤 File Transfer** | Fetch files from your laptop with a built-in remote file picker. No manual path typing needed. |
| **🤖 AI Chat** | Chat with a local LLM (Ollama) or Google Gemini. If Ollama isn't running, the app automatically falls back to Gemini — seamlessly. |
| **🎨 Elegant UI** | Crisp light theme with professional Feather vector icons. Black, white, and faint red (10%) palette. |

---

## 🏗️ Architecture

```
┌──────────────────┐         WebSocket (ws://)        ┌──────────────────────┐
│                  │◄────────────────────────────────►│                      │
│   React Native   │     Real-time bidirectional      │    Node.js Server    │
│   (Expo Router)  │     JSON messaging over LAN      │    (Express + WS)    │
│                  │                                   │                      │
├──────────────────┤                                   ├──────────────────────┤
│ • Dashboard      │                                   │ • connectionHandler  │
│ • Terminal       │                                   │ • terminalHandler    │
│ • File Browser   │                                   │ • fileHandler        │
│ • File Transfer  │                                   │ • aiHandler          │
│ • AI Chat        │                                   │   (Ollama ↔ Gemini)  │
└──────────────────┘                                   └──────────────────────┘
       Phone                                                  Laptop
    (same Wi-Fi)                                          (same Wi-Fi)
```

---

## 📂 Project Structure

```
pocket-edge/
├── server/                        # Node.js backend (runs on your laptop)
│   ├── src/
│   │   ├── index.js               # Express + WebSocket server + mDNS
│   │   ├── config.js              # Environment config (port, Gemini key)
│   │   ├── handlers/
│   │   │   ├── connectionHandler.js   # WebSocket lifecycle & heartbeat
│   │   │   ├── terminalHandler.js     # PTY terminal sessions (node-pty)
│   │   │   ├── fileHandler.js         # File tree listing & file reading
│   │   │   └── aiHandler.js           # Ollama + Gemini dual-backend AI
│   │   └── utils/
│   │       └── logger.js              # Colored console logger
│   ├── .env                       # PORT, SERVICE_NAME, GEMINI_API_KEY
│   └── package.json
│
├── mobile/                        # React Native frontend (Expo)
│   ├── app/
│   │   ├── _layout.tsx            # Root layout (ConnectionProvider)
│   │   └── (tabs)/
│   │       ├── _layout.tsx        # Tab bar configuration
│   │       ├── index.tsx          # Dashboard — connection & server scan
│   │       ├── terminal.tsx       # Remote terminal (xterm.js WebView)
│   │       ├── files.tsx          # File browser with tree navigation
│   │       ├── transfer.tsx       # File transfer with remote file picker
│   │       └── ai-chat.tsx        # AI chat (Ollama / Gemini fallback)
│   ├── src/
│   │   ├── context/
│   │   │   └── ConnectionContext.tsx   # WebSocket connection state manager
│   │   ├── components/
│   │   │   └── Terminal/
│   │   │       ├── TerminalWebView.tsx # xterm.js WebView bridge
│   │   │       └── TerminalToolbar.tsx # Terminal action buttons
│   │   └── theme/
│   │       ├── colors.ts          # Design tokens (Black/White/Red)
│   │       ├── typography.ts      # Font scales
│   │       ├── spacing.ts         # Spacing & border radius tokens
│   │       └── index.ts           # Theme barrel export
│   ├── assets/
│   │   └── terminal/
│   │       └── index.html         # xterm.js runtime (loaded in WebView)
│   └── package.json
│
└── docs/
    └── phases/                    # Development phase documentation
        ├── phase_1_foundation.md
        ├── phase_2_terminal.md
        ├── phase_3_state_handoff.md
        ├── phase_4_offline_ai.md
        ├── phase_5_webrtc_transfer.md
        └── phase_6_polish_security.md
```

---

## 🚀 Getting Started

### Prerequisites

| Tool | Version | Required For |
|------|---------|--------------|
| **Node.js** | ≥ 18.0.0 | Server |
| **npm** | ≥ 9 | Both |
| **Expo CLI** | Latest | Mobile |
| **Expo Go** | Latest | Mobile (on your phone) |
| **Ollama** | Any | AI Chat (optional — Gemini is the fallback) |

### 1. Clone the Repository

```bash
git clone https://github.com/RajKC7717/PocketEdge.git
cd PocketEdge
```

### 2. Start the Server (on your laptop)

```bash
cd server
npm install
```

Create a `.env` file (or edit the existing one):

```env
PORT=8765
SERVICE_NAME=pocket-edge
GEMINI_API_KEY=your_gemini_api_key_here   # Optional — get one from https://aistudio.google.com/apikey
```

Start the server:

```bash
npm run dev
```

You should see output like:

```
[SERVER] 🚀 Pocket Edge server is running
[SERVER]    Local:     http://localhost:8765
[SERVER]    Network:   http://192.168.x.x:8765
[MDNS]  📡 Broadcasting _pocketedge._tcp on port 8765
```

> **⚠️ Windows Firewall:** If your phone can't connect, run this in an admin terminal:
> ```
> netsh advfirewall firewall add rule name="Pocket Edge" dir=in action=allow protocol=TCP localport=8765
> ```

### 3. Start the Mobile App (on your phone)

```bash
cd mobile
npm install
npm start
```

Scan the QR code with **Expo Go** on your phone. Make sure both devices are on the **same Wi-Fi network**.

### 4. Connect

- The app will auto-scan for your laptop via mDNS.
- If auto-scan doesn't find it, enter your laptop's IP manually (shown in the server logs).
- Tap **Connect** — you're in!

---

## 📱 App Tabs

### Dashboard
The home screen. Scan for servers on the network, connect manually via IP, and see connection status with a live heartbeat indicator.

### Terminal
A full remote terminal powered by **xterm.js** running inside a React Native WebView. Supports:
- Interactive shell sessions (PowerShell, bash, zsh)
- ANSI colors and cursor movement
- Keyboard input with special key toolbar (Tab, Ctrl+C, arrows)
- Auto-resize on orientation change

### Files
Browse your laptop's file system remotely:
- Recursive directory tree with expand/collapse
- File type icons (Feather icons mapped by language)
- Tap a file to view its contents with line numbers
- Syntax-highlighted code preview

### Transfer
Fetch files from your laptop to your phone:
- **Remote File Picker** — Browse and select files visually (no manual path typing)
- Transfer progress bars with status indicators
- Transfer history log

### AI Chat
Chat with an AI — either local or cloud:
- **Ollama (Local)**: If Ollama is running on your laptop, uses your local GPU. Fully offline and private.
- **Gemini (Cloud)**: If Ollama is down, automatically falls back to Google Gemini. Requires a `GEMINI_API_KEY` in `.env`.
- Live streaming tokens for real-time responses
- Model selector chips (switch between installed Ollama models or Gemini variants)
- Backend badge shows **"Local"** or **"Gemini"** so you always know which AI is responding

---

## 🛠️ Tech Stack

### Mobile (React Native)

| Library | Purpose |
|---------|---------|
| **Expo SDK 56** | React Native framework & build tooling |
| **Expo Router** | File-based tab navigation |
| **react-native-webview** | xterm.js terminal rendering |
| **react-native-reanimated** | Smooth UI animations |
| **@expo/vector-icons** (Feather) | Professional vector icon set |
| **expo-network** | Local IP discovery for server scanning |

### Server (Node.js)

| Library | Purpose |
|---------|---------|
| **Express** | HTTP server & health endpoint |
| **ws** | WebSocket server for real-time messaging |
| **node-pty** | Pseudo-terminal for shell sessions |
| **bonjour-service** | mDNS/Zeroconf service advertisement |
| **chokidar** | File system watching |
| **@google/generative-ai** | Google Gemini SDK (AI fallback) |
| **dotenv** | Environment variable management |

---

## 🔌 WebSocket Protocol

All communication uses JSON messages over a single WebSocket connection. Message types:

| Type | Direction | Description |
|------|-----------|-------------|
| `terminal:create` | Client → Server | Start a new PTY session |
| `terminal:input` | Client → Server | Send keystrokes to the terminal |
| `terminal:output` | Server → Client | Stream terminal output |
| `terminal:resize` | Client → Server | Resize the terminal dimensions |
| `file:list` | Client → Server | Request directory listing |
| `file:list:response` | Server → Client | Directory tree response |
| `file:read` | Client → Server | Request file contents |
| `file:read:response` | Server → Client | File content response |
| `ai:models` | Client → Server | Request available AI models |
| `ai:models:response` | Server → Client | Model list + backend indicator |
| `ai:chat` | Client → Server | Send chat message with history |
| `ai:token` | Server → Client | Streamed AI response token |
| `ai:error` | Server → Client | AI error message |
| `heartbeat` | Both | Keep-alive ping/pong |

---

## 🎨 Design System

The app uses a strict, minimal color palette:

| Token | Value | Usage |
|-------|-------|-------|
| `background` | `#FFFFFF` | Page backgrounds |
| `textPrimary` | `#000000` | Headings, body text |
| `textSecondary` | `#666666` | Subtitles, labels |
| `primary` | `#000000` | Buttons, active elements |
| `accent` | `rgba(255,0,0,0.10)` | Faint red highlights, badges |
| `cardBackground` | `#FFFFFF` | Card surfaces |
| `surfaceBackground` | `#FAFAFA` | Elevated surfaces |

All icons are **Feather** (line style) in black or white — no emojis, no color icons.

---

## 📋 Development Phases

The project was built in 6 planned phases (see `docs/phases/`):

| Phase | Status | Description |
|-------|--------|-------------|
| **1. Foundation** | ✅ Complete | Expo setup, WebSocket connection, mDNS discovery |
| **2. Terminal** | ✅ Complete | xterm.js WebView, PTY bridge, toolbar |
| **3. State & Handoff** | ✅ Complete | File browser, code viewer, connection state |
| **4. Offline AI** | ✅ Complete | Ollama integration with streaming + Gemini fallback |
| **5. File Transfer** | ✅ Complete | Remote file picker, WebSocket-based transfer |
| **6. Polish & Security** | 🔲 Planned | TLS/WSS, PIN pairing, haptics, production build |

---

## 📄 License

MIT — See [LICENSE](mobile/LICENSE) for details.

---

<p align="center">
  Built with ❤️ for the <strong>India Runs</strong> Hackathon
</p>
