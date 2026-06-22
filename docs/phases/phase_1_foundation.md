# Phase 1: Core Architecture & Network Discovery

**Goal**: Establish the fundamental client-server connection on the local network without relying on cloud services or manual IP address configuration.

**Estimated Effort**: ~4 hours

---

## Architecture

```
┌─────────────────────────────┐          ┌─────────────────────────────┐
│  📱 React Native (Expo)      │          │  💻 Node.js Server           │
│                             │          │                             │
│  react-native-zeroconf      │  mDNS    │  bonjour-service            │
│  ─────────────────────────  │ ◄──────► │  ─────────────────────────  │
│  Scans for _pocketedge._tcp │          │  Broadcasts _pocketedge._tcp│
│                             │          │                             │
│  WebSocket Client           │  WS/LAN  │  ws (WebSocket Server)      │
│  ─────────────────────────  │ ◄──────► │  ─────────────────────────  │
│  Auto-connects to resolved  │          │  Express + ws on port 8765  │
│  IP from mDNS               │          │                             │
│                             │          │  Heartbeat: 30s ping/pong   │
└─────────────────────────────┘          └─────────────────────────────┘
```

---

## Server Side (`server/`)

### Dependencies

| Package | Version | Purpose |
|---|---|---|
| `express` | ^4.21 | HTTP server for health checks and future REST APIs |
| `ws` | ^8.18 | WebSocket server for real-time bidirectional comms |
| `bonjour-service` | ^1.3 | mDNS/DNS-SD advertisement for auto-discovery |
| `cors` | ^2.8 | Cross-origin support |
| `dotenv` | ^16.4 | Environment configuration |
| `nodemon` | ^3.1 (dev) | Auto-restart on file changes |

### Files to Create

| File | Purpose |
|---|---|
| `server/package.json` | Project manifest + scripts |
| `server/.env` | PORT=8765, SERVICE_NAME=pocket-edge |
| `server/src/index.js` | Entry point: Express + WS + Bonjour |
| `server/src/config.js` | Centralized configuration |
| `server/src/utils/logger.js` | Colored console logger with timestamps |
| `server/src/handlers/connectionHandler.js` | Ping/pong, identify, client registry |

### WebSocket Message Protocol

All messages are JSON with a `type` field:

```json
// Client → Server
{ "type": "ping", "timestamp": 1718130000000 }
{ "type": "identify", "deviceName": "Pixel 8", "platform": "android" }

// Server → Client
{ "type": "pong", "timestamp": 1718130000000, "serverTime": 1718130000002 }
{ "type": "welcome", "serverId": "uuid", "hostname": "LAPTOP-XYZ" }
```

---

## Mobile Side (`mobile/`)

### Dependencies

| Package | Purpose |
|---|---|
| `expo` (SDK 53) | Framework |
| `expo-router` | File-based routing with tabs |
| `react-native-zeroconf` | mDNS/DNS-SD scanning |
| `expo-font` | Load Inter font |
| `@expo/vector-icons` | Icons (Ionicons, MaterialIcons) |
| `react-native-reanimated` | Smooth animations |

### Files to Create

| File | Purpose |
|---|---|
| `mobile/src/theme/colors.ts` | Color palette tokens |
| `mobile/src/theme/spacing.ts` | 4-8-12-16-20-24-32-48 scale |
| `mobile/src/theme/typography.ts` | Font sizes, weights, line heights |
| `mobile/src/theme/index.ts` | Barrel export |
| `mobile/src/hooks/useDiscovery.ts` | Zeroconf scanning hook |
| `mobile/src/hooks/useWebSocket.ts` | WebSocket client hook with reconnect |
| `mobile/src/context/ConnectionContext.tsx` | Global connection state provider |
| `mobile/app/(tabs)/_layout.tsx` | Tab navigator with 5 tabs |
| `mobile/app/(tabs)/index.tsx` | Dashboard screen |

### Auto-Reconnect Strategy

```
Disconnect detected
  → Wait 1s → Retry
    → Fail → Wait 2s → Retry
      → Fail → Wait 4s → Retry
        → Fail → Wait 8s → Retry
          → ... cap at 30s
Connected → Reset backoff to 1s
```

---

## Verification Checklist

- [ ] `node server/src/index.js` starts without errors
- [ ] mDNS advertisement visible (`dns-sd -B _pocketedge._tcp` on macOS or equivalent)
- [ ] Expo app launches on phone
- [ ] App auto-discovers server within 2 seconds
- [ ] Dashboard shows "Connected" with green pulse animation
- [ ] Ping button returns latency < 5ms
- [ ] Kill server → dashboard shows "Disconnected" → restart server → auto-reconnects
