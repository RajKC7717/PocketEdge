# Pocket Edge — Technical Documentation

> **Your Laptop in Your Pocket.**  
> A comprehensive analysis of the technical integrations, UI/UX design, problem statement, and solution architecture of the Pocket Edge application.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Solution Overview](#solution-overview)
3. [Technical Architecture](#technical-architecture)
4. [Technical Integrations](#technical-integrations)
   - [WebSocket Communication Layer](#1-websocket-communication-layer)
   - [mDNS / Bonjour Service Discovery](#2-mdns--bonjour-service-discovery)
   - [Terminal Integration (xterm.js + PTY)](#3-terminal-integration-xtermjs--pty)
   - [AI Dual-Backend Integration (Ollama + Gemini)](#4-ai-dual-backend-integration-ollama--gemini)
   - [File System Integration](#5-file-system-integration)
   - [File Transfer System](#6-file-transfer-system)
   - [Connection State Management](#7-connection-state-management)
5. [UI/UX Design](#uiux-design)
   - [Design Philosophy](#design-philosophy)
   - [Design System & Tokens](#design-system--tokens)
   - [Navigation Architecture](#navigation-architecture)
   - [Screen-by-Screen UX Breakdown](#screen-by-screen-ux-breakdown)
   - [Animation & Interaction Design](#animation--interaction-design)
   - [Accessibility & Responsiveness](#accessibility--responsiveness)
6. [WebSocket Message Protocol](#websocket-message-protocol)
7. [Tech Stack Summary](#tech-stack-summary)
8. [Development Phases](#development-phases)

---

## Problem Statement

### The Gap Between Mobile and Desktop Development

Modern developers spend the majority of their time on laptops or desktops, but frequently find themselves in situations where they need quick access to their development environment from their phone — whether they're on the couch, in another room, commuting, or simply away from their desk.

**Current pain points:**

| Problem | Impact |
|---------|--------|
| **No portable terminal** | Developers cannot execute shell commands, check build logs, or restart services without physically being at their laptop. |
| **Inaccessible project files** | Browsing or previewing code on the phone requires clunky workarounds — emailing files, pushing to GitHub just to read on the phone, or using slow SSH apps. |
| **File transfer friction** | Moving files between phone and laptop involves third-party apps, cloud uploads, USB cables, or Bluetooth — all of which are slow, disconnected, or require internet. |
| **AI assistance is fragmented** | Developers switch between local LLMs (Ollama), cloud APIs (ChatGPT, Gemini), or web UIs. No single mobile interface unifies local and cloud AI. |
| **Existing SSH clients are inadequate** | Mobile SSH apps (Termius, JuiceSSH) are terminal-only, lack file browsing, offer no AI, and require manual server configuration. |

### Who This Affects

- **Students & hobbyist developers** who work from laptops in shared spaces (hostels, libraries, co-working).
- **Solo developers** who want to monitor long-running tasks (builds, training jobs) without sitting at their desk.
- **Hackathon participants** who need quick, integrated access to their dev stack from any device.
- **Remote workers** who need a lightweight, zero-cloud, privacy-first development bridge.

### Core Constraint

All of this must work **over local Wi-Fi only** — no cloud intermediary, no internet dependency (except optional Gemini AI), no account creation, and **zero configuration** for the common case.

---

## Solution Overview

**Pocket Edge** is a mobile-first development workstation that turns your phone into a wireless extension of your laptop. It consists of two parts:

```
┌─────────────────────────────┐              ┌─────────────────────────────┐
│         📱 PHONE             │    Wi-Fi     │         💻 LAPTOP            │
│   React Native (Expo)       │◄────────────►│   Node.js Server            │
│                             │  WebSocket   │                             │
│  • Dashboard (auto-connect) │              │  • Express HTTP Server      │
│  • Terminal (full shell)    │              │  • WebSocket message hub    │
│  • File Browser (tree view) │              │  • PTY terminal sessions    │
│  • File Transfer (fetch)    │              │  • File system access       │
│  • AI Chat (local + cloud)  │              │  • AI backend (Ollama/      │
│                             │              │    Gemini)                  │
└─────────────────────────────┘              └─────────────────────────────┘
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **WebSocket over REST** | Bidirectional, real-time communication is essential for terminal I/O, streaming AI tokens, and live file transfer progress. REST would require polling. |
| **mDNS auto-discovery** | Eliminates the need for users to find and type their laptop's IP address. The phone discovers the server automatically on the LAN. |
| **xterm.js in WebView** | React Native has no native terminal emulator. Embedding xterm.js in a WebView provides a production-grade terminal with ANSI support, cursor movement, and proper escape handling. |
| **Dual AI backend** | Local-first philosophy — use Ollama if it's running (private, free, offline). Fall back to Gemini if it's not (requires API key, internet). The user doesn't have to configure anything. |
| **Single WebSocket connection** | All features (terminal, files, AI, heartbeat) multiplex over a single WS connection using typed JSON messages. This reduces connection overhead and simplifies state management. |
| **Expo + TypeScript** | Rapid cross-platform development with strong typing. Expo Router provides file-based routing that maps naturally to the tab-based UI. |

---

## Technical Architecture

### High-Level Data Flow

```
Phone (React Native)                          Laptop (Node.js)
─────────────────────                         ──────────────────
                                              
1. App starts                                 
2. mDNS scan on _pocketedge._tcp       ───►   Bonjour advertises service
3. Server found at 192.168.x.x:8765    ◄───   
4. WebSocket connect ws://...          ───►   Express upgrades to WS
5. connection:established              ◄───   connectionHandler.js
6. Dashboard shows "Connected ✓"              
                                              
7. User taps Terminal tab                     
8. terminal:create                     ───►   terminalHandler spawns PTY
9. terminal:output (streaming)         ◄───   PTY stdout piped to WS
10. terminal:input (keystrokes)        ───►   WS piped to PTY stdin
                                              
11. User taps Files tab                       
12. file:list { path: "." }            ───►   fileHandler reads directory
13. file:list:response                 ◄───   Returns tree structure
14. file:read { path: "src/index.js" } ───►   fileHandler reads file
15. file:read:response                 ◄───   Returns file content
                                              
16. User taps AI Chat tab                    
17. ai:models                          ───►   aiHandler checks Ollama
18. ai:models:response                 ◄───   Returns models + backend
19. ai:chat { messages: [...] }        ───►   aiHandler streams to LLM
20. ai:token (streaming, many)         ◄───   Token-by-token response
                                              
21. Heartbeat loop (every 10s)         ◄──►   Keep-alive ping/pong
```

### Server Architecture (Node.js)

The server is a single `index.js` entry point that bootstraps three layers:

```
index.js
├── Express HTTP Server
│   └── GET /health → { status: "ok", uptime, connections }
│
├── WebSocket Server (ws library)
│   └── Per-connection message router
│       ├── connectionHandler.js  → heartbeat, lifecycle
│       ├── terminalHandler.js    → PTY spawn, I/O bridge
│       ├── fileHandler.js        → directory listing, file reading
│       └── aiHandler.js          → Ollama ↔ Gemini dual-backend
│
└── Bonjour Service
    └── Publishes _pocketedge._tcp on configured port
```

### Mobile Architecture (React Native / Expo)

```
app/
├── _layout.tsx           → Root: wraps entire app in ConnectionProvider
└── (tabs)/
    ├── _layout.tsx       → Tab navigator: 5 tabs with Feather icons
    ├── index.tsx         → Dashboard: scan, connect, status
    ├── terminal.tsx      → Terminal: xterm.js WebView + toolbar
    ├── files.tsx         → Files: tree navigator + code viewer
    ├── transfer.tsx      → Transfer: remote file picker + download
    └── ai-chat.tsx       → AI Chat: dual-backend chat UI

src/
├── context/
│   └── ConnectionContext.tsx  → Global WebSocket state + message dispatch
├── components/
│   └── Terminal/
│       ├── TerminalWebView.tsx  → xterm.js bridge (RN ↔ WebView)
│       └── TerminalToolbar.tsx  → Special key buttons (Tab, Ctrl+C, ↑↓)
├── hooks/
│   └── useFrameCallback.ts    → Reanimated frame callback hook
└── theme/
    ├── colors.ts              → Color tokens
    ├── typography.ts          → Font scale tokens
    ├── spacing.ts             → Spacing + border radius tokens
    └── index.ts               → Barrel export
```

---

## Technical Integrations

### 1. WebSocket Communication Layer

**Technology:** `ws` (server) + native `WebSocket` API (React Native)

The entire app communicates over a **single persistent WebSocket connection**. All messages are JSON-encoded with a `type` field that acts as a message discriminator.

#### Server-Side Implementation

```javascript
// server/src/index.js
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  connectionHandler.handleConnection(ws, wss);
  
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    switch (msg.type) {
      case 'terminal:create':
      case 'terminal:input':
      case 'terminal:resize':
        terminalHandler.handle(ws, msg);
        break;
      case 'file:list':
      case 'file:read':
        fileHandler.handle(ws, msg);
        break;
      case 'ai:models':
      case 'ai:chat':
        aiHandler.handle(ws, msg);
        break;
    }
  });
});
```

#### Client-Side Implementation

```typescript
// mobile/src/context/ConnectionContext.tsx
const ws = new WebSocket(`ws://${serverIP}:${port}`);

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  // Distribute to registered listeners by message type
  listeners.current.forEach(listener => listener(msg));
};

// Exposed via React Context:
// - sendMessage(msg)     → serializes & sends JSON
// - addListener(fn)      → registers a message callback
// - removeListener(fn)   → unregisters a message callback
```

**Key Design Points:**
- **Multiplexed protocol**: Terminal I/O, file ops, AI streaming, and heartbeats all share one socket.
- **Listener pattern**: Any component can register a listener for incoming messages, enabling decoupled feature modules.
- **Automatic reconnection**: The connection context handles reconnection attempts when the socket drops.
- **JSON-only protocol**: No binary frames — all messages are `JSON.stringify`'d objects with a `type` discriminator.

---

### 2. mDNS / Bonjour Service Discovery

**Technology:** `bonjour-service` (server) + subnet scanning (client)

#### How It Works

1. **Server publishes** a Bonjour service on startup:
   ```javascript
   // server/src/index.js
   const bonjour = new Bonjour();
   bonjour.publish({
     name: config.SERVICE_NAME,   // "pocket-edge"
     type: 'pocketedge',          // _pocketedge._tcp
     port: config.PORT            // 8765
   });
   ```

2. **Client scans** the local subnet by:
   - Fetching the phone's local IP via `expo-network`
   - Deriving the subnet (e.g., `192.168.1.x`)
   - Sending HTTP requests to `http://<ip>:8765/health` for every IP on the subnet
   - The first IP that responds with a valid health check is considered the server

3. **Manual fallback**: If scanning fails, the user can type the IP manually.

**Why mDNS + scanning?**
mDNS (Bonjour) works natively on macOS and Linux but has inconsistent support on Android and Windows. The subnet scanning approach acts as a universal fallback that works regardless of OS mDNS support.

---

### 3. Terminal Integration (xterm.js + PTY)

This is the most complex integration in the app, bridging **three layers**: React Native → WebView → xterm.js → WebSocket → node-pty.

#### Architecture

```
┌────────────────────────────────────────────────────────────┐
│  React Native                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  TerminalWebView.tsx                                  │  │
│  │  ┌──────────────────────────────────────────────────┐│  │
│  │  │  WebView (react-native-webview)                  ││  │
│  │  │  ┌──────────────────────────────────────────────┐││  │
│  │  │  │  xterm.js (assets/terminal/index.html)      │││  │
│  │  │  │  • Terminal rendering (canvas)              │││  │
│  │  │  │  • ANSI escape sequence parsing             │││  │
│  │  │  │  • Cursor, colors, scrollback               │││  │
│  │  │  └──────────────────────────────────────────────┘││  │
│  │  │  Communication: postMessage / onMessage          ││  │
│  │  └──────────────────────────────────────────────────┘│  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  TerminalToolbar.tsx                                  │  │
│  │  [Tab] [Ctrl+C] [↑] [↓] [←] [→] [Clear]             │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
                            │
                    WebSocket JSON messages
                            │
                            ▼
┌────────────────────────────────────────────────────────────┐
│  Node.js Server — terminalHandler.js                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  node-pty                                             │  │
│  │  • Spawns OS shell (PowerShell / bash / zsh)         │  │
│  │  • Full TTY emulation (interactive programs work)    │  │
│  │  • Handles resize (cols × rows)                      │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

#### Data Flow (Keystroke → Output)

1. User types a character on the phone keyboard
2. xterm.js `onData` fires inside the WebView
3. WebView sends `postMessage({ type: 'terminal:input', data: char })` to React Native
4. `TerminalWebView.tsx` receives the message via `onMessage` prop
5. React Native sends `{ type: 'terminal:input', data: char }` over WebSocket
6. Server's `terminalHandler.js` receives it and writes to `pty.write(data)`
7. PTY shell processes the input and produces output
8. `pty.onData` fires with output bytes
9. Server sends `{ type: 'terminal:output', data: output }` over WebSocket
10. React Native receives it and calls `webViewRef.current.injectJavaScript('term.write(...)')`
11. xterm.js renders the output in the terminal canvas

#### Terminal HTML (xterm.js Runtime)

The `mobile/assets/terminal/index.html` file is a self-contained xterm.js runtime loaded into the WebView. It:
- Loads xterm.js and the FitAddon from CDN
- Creates a `Terminal` instance with dark theme configuration
- Listens for `onData` events (user input) and forwards them via `postMessage`
- Exposes a `window.writeToTerminal(data)` function that React Native calls via `injectJavaScript`
- Handles resize events via `window.resizeTerminal(cols, rows)`

#### Terminal Toolbar

The `TerminalToolbar.tsx` component provides touch-friendly buttons for keys that are hard to type on a mobile keyboard:

| Button | Action | Use Case |
|--------|--------|----------|
| Tab | Sends `\t` | Autocomplete in shell |
| Ctrl+C | Sends `\x03` | Interrupt running process |
| ↑ / ↓ | Sends escape sequences | Navigate command history |
| ← / → | Sends escape sequences | Move cursor in line |
| Clear | Sends `clear\r` | Clear terminal screen |

---

### 4. AI Dual-Backend Integration (Ollama + Gemini)

**Technology:** Ollama REST API (local) + `@google/generative-ai` SDK (cloud)

This is a **local-first, cloud-fallback** architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│  aiHandler.js — Decision Flow                                    │
│                                                                  │
│  1. On ai:models request:                                        │
│     ├── Try: GET http://localhost:11434/api/tags (Ollama)        │
│     │   ├── Success → return Ollama models + backend: "ollama"   │
│     │   └── Failure → return Gemini models + backend: "gemini"   │
│     │                                                            │
│  2. On ai:chat request:                                          │
│     ├── If Ollama is available:                                  │
│     │   └── POST http://localhost:11434/api/chat                 │
│     │       • stream: true (NDJSON token streaming)              │
│     │       • Each line → parse JSON → extract token → send      │
│     │         ai:token message over WS                           │
│     │                                                            │
│     └── If Ollama is unavailable:                                │
│         └── Use @google/generative-ai SDK                        │
│             • model.generateContentStream(messages)              │
│             • Each chunk → extract text → send ai:token over WS  │
│                                                                  │
│  3. On ai:done:                                                  │
│     └── Send { type: 'ai:done' } to signal end of stream        │
└─────────────────────────────────────────────────────────────────┘
```

#### Ollama Integration Details

- **Discovery**: The handler pings `http://localhost:11434/api/tags` on each `ai:models` request. If Ollama is running, it returns the list of locally installed models.
- **Streaming**: Uses `POST /api/chat` with `stream: true`. The response is NDJSON (newline-delimited JSON) where each line contains a `message.content` field with the next token.
- **Model selection**: The client sends a `model` field in the `ai:chat` message. The server passes it directly to Ollama.

#### Gemini Integration Details

- **SDK**: Uses `@google/generative-ai` (Google's official Node.js SDK for the Gemini API).
- **Authentication**: Reads `GEMINI_API_KEY` from `.env` via `dotenv`.
- **Streaming**: Uses `generateContentStream()` which returns an async iterable of content chunks.
- **Model**: Defaults to `gemini-2.0-flash` for fast responses.

#### Fallback Behavior

The fallback is **automatic and seamless**:
1. Every time the user opens the AI Chat tab, the app requests `ai:models`
2. The server tries Ollama first — if it responds, all subsequent chats use Ollama
3. If Ollama is unreachable (not installed, not running), the server switches to Gemini
4. The client displays a badge ("Local" or "Gemini") so the user always knows which backend is active
5. No user configuration needed — just install Ollama for local, or set `GEMINI_API_KEY` for cloud

---

### 5. File System Integration

**Technology:** Node.js `fs` module (server) + custom tree UI (client)

#### Server-Side (fileHandler.js)

Handles two message types:

**`file:list`** — Directory Listing
```javascript
// Reads directory contents recursively
// Returns array of { name, type: 'file'|'directory', path, children? }
// Handles permission errors gracefully (skips unreadable directories)
```

**`file:read`** — File Content Reading
```javascript
// Reads file content as UTF-8 string
// Returns { path, content, size }
// Handles binary files by returning a "binary file" indicator
```

#### Client-Side (files.tsx)

The file browser implements:
- **Recursive tree rendering**: Each directory node can be expanded/collapsed
- **File type icons**: Maps file extensions to Feather icons (e.g., `.js` → `file-text`, `.json` → `settings`)
- **Code viewer**: Tapping a file opens a scrollable code preview with line numbers
- **Breadcrumb navigation**: Shows the current path and allows quick navigation up the tree
- **Root directory selection**: Starts at the user's home directory or a configured project root

---

### 6. File Transfer System

**Technology:** WebSocket binary/JSON messages + `expo-file-system`

#### How File Transfer Works

1. **Browse**: User opens the Transfer tab and sees a remote file picker (reuses the file browser component)
2. **Select**: User taps a file to select it for transfer
3. **Request**: Client sends `file:read` message for the selected file
4. **Transfer**: Server reads the file and sends its content over WebSocket
5. **Save**: Client receives the content and saves it using `expo-file-system` to the phone's local storage
6. **History**: Each transfer is logged with timestamp, filename, size, and status

#### Transfer UI Features

- **Remote file picker** — Visual file browser for the laptop's file system (no manual path typing)
- **Progress indicators** — Shows transfer status (pending, transferring, complete, error)
- **Transfer history** — Scrollable log of all transfers with metadata

---

### 7. Connection State Management

**Technology:** React Context API + WebSocket lifecycle events

The `ConnectionContext.tsx` is the **single source of truth** for connection state across the entire app:

```typescript
interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  serverIP: string | null;
  serverPort: number;
  ws: WebSocket | null;
  error: string | null;
}
```

#### Features

| Feature | Implementation |
|---------|---------------|
| **Auto-reconnect** | Watches for `ws.onclose` and attempts reconnection after a delay |
| **Heartbeat** | Sends periodic ping messages; if no pong received, marks connection as lost |
| **Listener registry** | Components register message listeners via `addListener(fn)` — decouples features from the connection layer |
| **Global access** | Wrapped at the root `_layout.tsx` level, so every tab screen can access connection state via `useConnection()` hook |
| **Message dispatch** | `sendMessage(msg)` handles serialization, queuing if disconnected, and error handling |

---

## UI/UX Design

### Design Philosophy

Pocket Edge follows a **minimalist, professional** design language:

| Principle | Implementation |
|-----------|---------------|
| **Monochrome-first** | Black text on white backgrounds. No distracting colors. |
| **Faint red accent** | `rgba(255, 0, 0, 0.10)` used sparingly for badges, highlights, and active states — just enough warmth to feel alive without being aggressive. |
| **Icon-driven** | Feather icon set (line-style) used consistently. No emojis in the UI. No filled icons. |
| **Information density** | Screens are designed to show maximum useful information without scrolling (dashboard metrics, terminal fullscreen, tree view). |
| **Touch-first** | Large tap targets, swipeable elements, and bottom-tab navigation optimized for thumb reach. |

---

### Design System & Tokens

#### Color Tokens

```typescript
// mobile/src/theme/colors.ts
export const colors = {
  background:       '#FFFFFF',        // Page backgrounds
  textPrimary:      '#000000',        // Headings, body text
  textSecondary:    '#666666',        // Subtitles, labels, metadata
  primary:          '#000000',        // Buttons, active elements
  accent:           'rgba(255,0,0,0.10)', // Faint red highlights
  cardBackground:   '#FFFFFF',        // Card surfaces
  surfaceBackground:'#FAFAFA',        // Elevated surfaces
  border:           '#E5E5E5',        // Dividers, borders
  success:          '#22C55E',        // Connected status
  error:            '#EF4444',        // Error states
  warning:          '#F59E0B',        // Warning indicators
};
```

#### Typography Tokens

```typescript
// mobile/src/theme/typography.ts
export const typography = {
  largeTitle:  { fontSize: 28, fontWeight: '700' },
  title:       { fontSize: 22, fontWeight: '600' },
  headline:    { fontSize: 17, fontWeight: '600' },
  body:        { fontSize: 15, fontWeight: '400' },
  caption:     { fontSize: 13, fontWeight: '400' },
  footnote:    { fontSize: 11, fontWeight: '400' },
};
```

#### Spacing Tokens

```typescript
// mobile/src/theme/spacing.ts
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999,
};
```

---

### Navigation Architecture

**Technology:** Expo Router with file-based tab navigation

```
_layout.tsx (Root)
└── ConnectionProvider wraps entire app
    └── (tabs)/_layout.tsx
        ├── index.tsx       → "Dashboard"   🏠  (Feather: home)
        ├── terminal.tsx    → "Terminal"     💻  (Feather: terminal)
        ├── files.tsx       → "Files"       📁  (Feather: folder)
        ├── transfer.tsx    → "Transfer"    📤  (Feather: download)
        └── ai-chat.tsx     → "AI Chat"     🤖  (Feather: message-circle)
```

#### Tab Bar Configuration

```typescript
// mobile/app/(tabs)/_layout.tsx
<Tabs
  screenOptions={{
    tabBarActiveTintColor: colors.primary,       // Black when active
    tabBarInactiveTintColor: colors.textSecondary, // Gray when inactive
    tabBarStyle: {
      backgroundColor: colors.background,        // White background
      borderTopColor: colors.border,              // Subtle top border
    },
    headerStyle: {
      backgroundColor: colors.background,
    },
    headerTintColor: colors.textPrimary,
  }}
>
```

**UX Rationale:**
- Tab navigation is at the **bottom** — optimized for one-handed phone use
- 5 tabs map to the 5 core features with clear Feather icons
- Active tab is distinguished by black tint vs. gray inactive
- Header titles provide context for each screen

---

### Screen-by-Screen UX Breakdown

#### 1. Dashboard (`index.tsx`)

**Purpose:** Connection hub — the first thing the user sees.

```
┌─────────────────────────────────────┐
│  Pocket Edge                  ⚙️    │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐    │
│  │  🟢 Connected               │    │
│  │  192.168.1.42:8765          │    │
│  │  Latency: 12ms             │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  Scan for Servers           │    │
│  │  [🔍 Scanning...]          │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  Manual Connection          │    │
│  │  IP: [192.168.1.__]        │    │
│  │  Port: [8765      ]        │    │
│  │  [ Connect ]               │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  Server Info                │    │
│  │  Uptime: 2h 34m            │    │
│  │  Active Connections: 1     │    │
│  └─────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘
```

**UX Features:**
- **Auto-scan**: On mount, the dashboard automatically scans the local subnet for servers
- **Visual status**: Green/red dot + text indicates connection state
- **Heartbeat indicator**: Live latency display shows the connection is alive
- **Manual fallback**: IP + Port input fields for when auto-scan fails
- **Server info card**: Shows uptime and active connections once connected

---

#### 2. Terminal (`terminal.tsx`)

**Purpose:** Full remote shell access from the phone.

```
┌─────────────────────────────────────┐
│  Terminal                    [x]    │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ user@laptop:~/project$ ls      │ │
│ │ src/  docs/  package.json      │ │
│ │ README.md  node_modules/       │ │
│ │ user@laptop:~/project$ npm test│ │
│ │ PASS  tests/unit.test.js       │ │
│ │   ✓ should connect (12ms)     │ │
│ │   ✓ should send messages (3ms)│ │
│ │ Tests: 2 passed, 2 total      │ │
│ │ user@laptop:~/project$ █      │ │
│ │                                │ │
│ │                                │ │
│ │                                │ │
│ │                                │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ [Tab][Ctrl+C][↑][↓][←][→][Clr]│ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**UX Features:**
- **Full-screen terminal**: Maximizes vertical space for terminal output
- **xterm.js rendering**: Proper monospace font, ANSI colors, cursor blink
- **Dark terminal theme**: Black background with green/white text — distinct from the app's white theme
- **Sticky toolbar**: Bottom toolbar for special keys that are hard to type on mobile
- **Auto-resize**: Terminal dimensions adapt when the phone rotates or the keyboard appears
- **Session persistence**: Terminal session stays alive when switching tabs

---

#### 3. Files (`files.tsx`)

**Purpose:** Browse and read files on the laptop remotely.

```
┌─────────────────────────────────────┐
│  Files                       [⟲]   │
├─────────────────────────────────────┤
│  📁 ~/project                       │
│  ├── 📂 src/                  [▼]  │
│  │   ├── 📄 index.js              │
│  │   ├── 📄 config.js             │
│  │   └── 📂 handlers/        [▶]  │
│  ├── 📂 docs/                 [▶]  │
│  ├── 📄 package.json          ★    │
│  ├── 📄 README.md                  │
│  └── 📄 .gitignore                │
├─────────────────────────────────────┤
│  ┌─────────────────────────────────┐│
│  │ // package.json               ││
│  │  1 │ {                        ││
│  │  2 │   "name": "pocket-edge", ││
│  │  3 │   "version": "1.0.0",   ││
│  │  4 │   "scripts": {          ││
│  │  5 │     "dev": "node src/.." ││
│  │  6 │   },                     ││
│  │  7 │   "dependencies": {     ││
│  │  8 │     "express": "^4.18.." ││
│  │  9 │   }                      ││
│  │ 10 │ }                        ││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

**UX Features:**
- **Tree view**: Expandable/collapsible directory tree with indentation
- **File type icons**: Different Feather icons per file extension for quick scanning
- **Tap to preview**: Tapping a file opens a code viewer with line numbers in the bottom half
- **Split view**: Tree browser on top, code preview on bottom — see context and content simultaneously
- **Refresh button**: Re-fetches the file tree (useful after editing files via terminal)

---

#### 4. Transfer (`transfer.tsx`)

**Purpose:** Fetch files from laptop to phone.

```
┌─────────────────────────────────────┐
│  Transfer                          │
├─────────────────────────────────────┤
│  ┌─────────────────────────────────┐│
│  │  Select File from Server       ││
│  │  📂 src/                       ││
│  │  ├── 📄 index.js       [⬇]   ││
│  │  ├── 📄 config.js      [⬇]   ││
│  │  └── 📂 handlers/      [▶]   ││
│  └─────────────────────────────────┘│
│                                     │
│  Transfer History                  │
│  ┌─────────────────────────────────┐│
│  │ ✅ index.js     2.1 KB  12:34 ││
│  │ ✅ config.js    547 B   12:33 ││
│  │ ❌ image.png    Failed  12:32 ││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

**UX Features:**
- **Visual file picker**: Browse the laptop's file system and tap download buttons
- **No path typing**: Eliminates the error-prone step of manually entering file paths
- **Transfer history**: Shows completed, in-progress, and failed transfers
- **Status indicators**: ✅ success, ⏳ in progress, ❌ failed

---

#### 5. AI Chat (`ai-chat.tsx`)

**Purpose:** Chat with a local or cloud AI assistant.

```
┌─────────────────────────────────────┐
│  AI Chat               [Local 🟢] │
├─────────────────────────────────────┤
│  ┌─────────────────────────────────┐│
│  │ [llama3.2] [codellama] [gemini]││
│  └─────────────────────────────────┘│
│                                     │
│  ┌─────────────────────────────────┐│
│  │ 👤 How do I reverse a linked   ││
│  │    list in Python?              ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │ 🤖 Here's how to reverse a     ││
│  │    singly linked list:          ││
│  │                                 ││
│  │    def reverse(head):           ││
│  │        prev = None              ││
│  │        curr = head              ││
│  │        while curr:              ││
│  │            next = curr.next     ││
│  │            curr.next = prev     ││
│  │            prev = curr          ││
│  │            curr = next          ││
│  │        return prev              ││
│  └─────────────────────────────────┘│
│                                     │
│  ┌───────────────────────────┐ [➤] │
│  │ Type a message...          │     │
│  └───────────────────────────┘      │
└─────────────────────────────────────┘
```

**UX Features:**
- **Model selector chips**: Horizontally scrollable row of model chips (tap to switch)
- **Backend badge**: Shows "Local" (green) or "Gemini" (blue) so the user knows which AI is responding
- **Streaming responses**: Tokens appear in real-time as the AI generates them
- **Chat history**: Messages are displayed in a conversation format with user/AI distinction
- **Code blocks**: AI responses with code are rendered with syntax highlighting
- **Auto-scroll**: Chat view auto-scrolls to the latest message during streaming

---

### Animation & Interaction Design

| Animation | Technology | Description |
|-----------|-----------|-------------|
| **Tab transitions** | Expo Router | Smooth cross-fade between tab screens |
| **Connection pulse** | React Native Animated | Green dot pulses when connected (heartbeat visual) |
| **Scanning spinner** | ActivityIndicator | Animated spinner during mDNS/subnet scan |
| **Tree expand/collapse** | LayoutAnimation | Smooth height animation when expanding directories |
| **Message appear** | LayoutAnimation | Chat messages slide in from the bottom |
| **Token streaming** | State batching | AI response text grows character-by-character |

---

### Accessibility & Responsiveness

| Feature | Implementation |
|---------|---------------|
| **Dynamic font sizes** | Typography tokens scale with system font size settings |
| **Touch targets** | All interactive elements are ≥ 44×44pt (Apple HIG minimum) |
| **Color contrast** | Black text on white background exceeds WCAG AAA contrast ratio |
| **Keyboard avoidance** | `KeyboardAvoidingView` used on input screens to prevent content hiding |
| **Screen rotation** | Terminal and file browser adapt to landscape mode |
| **Safe area** | All screens respect device notches and home indicators via `SafeAreaView` |

---

## WebSocket Message Protocol

All messages follow the format `{ type: string, ...payload }`. Here is the complete protocol:

### Terminal Messages

| Type | Direction | Payload | Description |
|------|-----------|---------|-------------|
| `terminal:create` | Client → Server | `{ cols, rows }` | Create a new PTY shell session |
| `terminal:created` | Server → Client | `{ id }` | Confirms PTY session created |
| `terminal:input` | Client → Server | `{ data }` | Send keystrokes to PTY stdin |
| `terminal:output` | Server → Client | `{ data }` | Stream PTY stdout to client |
| `terminal:resize` | Client → Server | `{ cols, rows }` | Resize PTY dimensions |
| `terminal:exit` | Server → Client | `{ code }` | PTY process exited |

### File Messages

| Type | Direction | Payload | Description |
|------|-----------|---------|-------------|
| `file:list` | Client → Server | `{ path }` | Request directory listing |
| `file:list:response` | Server → Client | `{ path, entries[] }` | Array of file/directory entries |
| `file:read` | Client → Server | `{ path }` | Request file contents |
| `file:read:response` | Server → Client | `{ path, content, size }` | File content as UTF-8 string |

### AI Messages

| Type | Direction | Payload | Description |
|------|-----------|---------|-------------|
| `ai:models` | Client → Server | `{}` | Request available AI models |
| `ai:models:response` | Server → Client | `{ models[], backend }` | Model list + "ollama" or "gemini" |
| `ai:chat` | Client → Server | `{ model, messages[] }` | Send chat with message history |
| `ai:token` | Server → Client | `{ token }` | Single streamed response token |
| `ai:done` | Server → Client | `{}` | Stream complete |
| `ai:error` | Server → Client | `{ error }` | AI error message |

### Connection Messages

| Type | Direction | Payload | Description |
|------|-----------|---------|-------------|
| `heartbeat` | Client ↔ Server | `{ timestamp }` | Keep-alive ping/pong |
| `connection:established` | Server → Client | `{ serverInfo }` | Initial connection confirmation |

---

## Tech Stack Summary

### Mobile App

| Technology | Version | Purpose |
|------------|---------|---------|
| **React Native** | via Expo SDK 56 | Cross-platform mobile framework |
| **Expo Router** | ^4.x | File-based tab navigation |
| **TypeScript** | ^5.x | Type safety |
| **react-native-webview** | ^13.x | xterm.js terminal rendering |
| **react-native-reanimated** | ^3.x | Smooth UI animations |
| **expo-network** | ^7.x | Local IP discovery |
| **@expo/vector-icons** | ^14.x | Feather icon set |

### Server

| Technology | Version | Purpose |
|------------|---------|---------|
| **Node.js** | ≥ 18.0.0 | Server runtime |
| **Express** | ^4.21.x | HTTP server + health endpoint |
| **ws** | ^8.18.x | WebSocket server |
| **node-pty** | ^1.0.x | Pseudo-terminal for shell sessions |
| **bonjour-service** | ^1.3.x | mDNS/Zeroconf service discovery |
| **chokidar** | ^4.0.x | File system watching |
| **@google/generative-ai** | ^0.24.x | Google Gemini SDK |
| **dotenv** | ^16.4.x | Environment variable management |

---

## Development Phases

The project was built incrementally across 6 phases:

| Phase | Name | Status | Key Deliverables |
|-------|------|--------|-----------------|
| **1** | Foundation | ✅ Complete | Expo project setup, Express + WebSocket server, mDNS service advertisement, ConnectionContext, Dashboard UI with auto-scan |
| **2** | Terminal | ✅ Complete | xterm.js WebView bridge, node-pty handler, terminal toolbar, bidirectional I/O, resize support |
| **3** | State & Handoff | ✅ Complete | File browser with tree navigation, code viewer, connection state persistence, improved message routing |
| **4** | Offline AI | ✅ Complete | Ollama integration with streaming, Gemini fallback, model selector, backend indicator badge |
| **5** | File Transfer | ✅ Complete | Remote file picker, WebSocket-based file download, transfer history, progress indicators |
| **6** | Polish & Security | 🔲 Planned | TLS/WSS encryption, PIN-based pairing, haptic feedback, production build optimization |

---

> **Document generated for the India Runs Hackathon submission.**  
> **Project:** Pocket Edge — *Your laptop in your pocket.*
