# Phase 2: Remote Pseudo-Terminal (PTY) Bridge

**Goal**: Turn the phone into a high-fidelity, zero-latency window into the laptop's shell with full ANSI support.

**Estimated Effort**: ~5 hours

---

## Architecture

```
┌─────────────────────────────────┐        ┌──────────────────────────────────┐
│  📱 Mobile Terminal UI           │        │  💻 Server PTY Manager            │
│                                 │        │                                  │
│  ┌───────────────────────────┐  │  WS    │  ┌────────────────────────────┐  │
│  │ WebView (xterm.js)        │  │ ◄────► │  │ node-pty                   │  │
│  │  - xterm-addon-fit        │  │        │  │  - Auto-detect shell       │  │
│  │  - xterm-addon-webgl      │  │        │  │  - PowerShell / bash / zsh │  │
│  │  - Custom dark theme      │  │        │  │  - Resize support          │  │
│  └───────────────────────────┘  │        │  └────────────────────────────┘  │
│                                 │        │                                  │
│  postMessage bridge:            │        │  WS Message Types:               │
│  RN ←→ WebView ←→ WS Client    │        │  terminal:input (stdin)          │
│                                 │        │  terminal:output (stdout)        │
│  Toolbar:                       │        │  terminal:resize (cols,rows)     │
│  [Keyboard] [Paste] [Clear]     │        │  terminal:session (create/kill)  │
└─────────────────────────────────┘        └──────────────────────────────────┘
```

---

## Server Side

### New Dependencies

| Package | Version | Purpose |
|---|---|---|
| `node-pty` | ^1.0 | Fork native OS shell with PTY support |

### Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `server/src/handlers/terminalHandler.js` | NEW | PTY lifecycle + WS message routing |

### Terminal Handler Design

```javascript
// Session management
sessions = Map<sessionId, { pty, buffer: CircularBuffer(1000 lines) }>

// Message handlers:
"terminal:create" → Fork PTY, assign sessionId, return { sessionId, shell }
"terminal:input"  → Write data to PTY stdin
"terminal:resize" → Call pty.resize(cols, rows)
"terminal:kill"   → Destroy PTY process
"terminal:replay" → Send buffered output for reconnection
```

### Shell Auto-Detection Logic

```
Windows → PowerShell.exe (fallback: cmd.exe)
macOS   → /bin/zsh (fallback: /bin/bash)
Linux   → $SHELL or /bin/bash
```

### Output Encoding

- PTY stdout is binary (may contain raw ANSI escape sequences)
- Encode as **base64** for WebSocket transport
- Decode on mobile side before feeding to xterm.js

---

## Mobile Side

### Terminal Rendering Strategy

**Approach**: WebView + xterm.js (most reliable ANSI rendering)

Why not a pure RN terminal?
- ANSI escape codes are complex (256 colors, cursor movement, alternate screen buffer)
- xterm.js is battle-tested and handles edge cases
- WebView bridge adds < 1ms overhead

### Files to Create

| File | Purpose |
|---|---|
| `mobile/assets/terminal/index.html` | Self-contained xterm.js page |
| `mobile/assets/terminal/xterm.css` | xterm.js styles + custom theme |
| `mobile/src/components/Terminal/TerminalWebView.tsx` | WebView wrapper component |
| `mobile/src/components/Terminal/TerminalToolbar.tsx` | Action toolbar |
| `mobile/app/(tabs)/terminal.tsx` | Terminal tab screen |

### WebView ↔ RN Bridge Protocol

```javascript
// RN → WebView (via injectedJavaScript / postMessage)
{ action: "write", data: "base64-encoded-pty-output" }
{ action: "resize", cols: 80, rows: 24 }
{ action: "clear" }
{ action: "theme", colors: { background: "#0A0A0F", ... } }

// WebView → RN (via window.ReactNativeWebView.postMessage)
{ action: "input", data: "user-keystroke" }
{ action: "ready" }
{ action: "dimensions", cols: 80, rows: 24 }
```

### xterm.js Theme (matches design system)

```javascript
{
  background: '#0A0A0F',
  foreground: '#F0F0F5',
  cursor: '#6C63FF',
  cursorAccent: '#0A0A0F',
  selectionBackground: 'rgba(108,99,255,0.3)',
  black: '#1A1A2E',
  red: '#FF5252',
  green: '#00E676',
  yellow: '#FFD740',
  blue: '#6C63FF',
  magenta: '#E040FB',
  cyan: '#00D9FF',
  white: '#F0F0F5',
}
```

---

## Resize Flow

```
Phone rotates (portrait → landscape)
  → xterm-addon-fit recalculates cols/rows
  → WebView posts { action: "dimensions", cols: 120, rows: 20 }
  → RN receives via onMessage
  → RN sends WS: { type: "terminal:resize", cols: 120, rows: 20 }
  → Server calls pty.resize(120, 20)
  → PTY reflows output
  → Updated stdout streams back
```

---

## Reconnection Strategy

When phone reconnects after disconnect:
1. Server sends `terminal:replay` with buffered output (last 1000 lines)
2. xterm.js renders the buffer → user sees terminal as if never disconnected
3. PTY process was never killed → background processes still running

---

## Verification Checklist

- [ ] Open Terminal tab → shell prompt appears
- [ ] Type `dir` / `ls` → correct output with colors
- [ ] Run `node -e "console.log('\x1b[32mGreen\x1b[0m')"` → green text renders
- [ ] Rotate phone → terminal re-flows without breaking
- [ ] Run a long process (e.g., `ping localhost`) → output streams in real-time
- [ ] Disconnect Wi-Fi → reconnect → terminal state restored
- [ ] Type `cls` / `clear` → screen clears properly
