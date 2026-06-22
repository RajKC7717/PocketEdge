# Phase 6: Security, Polish & Packaging

**Goal**: Finalize the application with encrypted communications, premium UI polish, and silent daemon execution.

**Estimated Effort**: ~4 hours

---

## 6.1 Security

### Connection PIN Pairing

```
First connection:
  1. Server generates 6-digit PIN, displays in console
  2. Phone shows "Enter PIN" screen
  3. User enters PIN on phone
  4. Server validates PIN → establishes trust
  5. Server generates session token → stored on phone
  6. Future connections use token (no PIN needed)
```

### TLS Encryption

| Connection | Encryption |
|---|---|
| WebSocket | `wss://` with self-signed TLS certificate |
| WebRTC | DTLS (built-in to WebRTC spec) |
| HTTP | HTTPS with same self-signed cert |

### Self-Signed Certificate Generation

```javascript
// On first server start:
// 1. Generate RSA key pair
// 2. Create self-signed X.509 certificate
// 3. Store in ~/.pocket-edge/certs/
// 4. Serve via HTTPS/WSS
// 5. Phone accepts self-signed cert (pinned)
```

### Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `server/src/security/certManager.js` | NEW | Generate and manage TLS certs |
| `server/src/security/authHandler.js` | NEW | PIN pairing + session tokens |
| `server/src/index.js` | MODIFY | Switch to HTTPS + WSS |

---

## 6.2 UI Polish

### Micro-Animations (react-native-reanimated)

| Element | Animation |
|---|---|
| Connection indicator | Pulsing green/red glow |
| Tab transitions | Shared element transitions |
| Cards | Scale + fade on press |
| Chat bubbles | Slide up + fade in |
| Progress bars | Smooth width interpolation |
| File tree | Animated expand/collapse |
| Toast notifications | Slide in from top + auto-dismiss |

### Glassmorphism Cards

```css
background: rgba(255, 255, 255, 0.04);
border: 1px solid rgba(255, 255, 255, 0.08);
border-radius: 16px;
backdrop-filter: blur(20px);  /* WebView only, simulated in RN */
shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
```

### Haptic Feedback

| Action | Haptic Type |
|---|---|
| Button press | Light impact |
| Connection established | Success notification |
| Connection lost | Error notification |
| File transfer complete | Success notification |
| Tab switch | Selection tick |

### App Polish

- Custom splash screen with app logo
- App icon (dark with accent gradient)
- Status bar: translucent, light content
- Safe area handling for all screens
- Loading skeletons instead of spinners

---

## 6.3 Daemon Packaging

### Windows (Target Platform)

```powershell
# Using pm2:
npm install -g pm2
pm2 start server/src/index.js --name pocket-edge
pm2 save
pm2 startup  # Creates Windows service
```

### Cross-Platform Support

| OS | Method |
|---|---|
| Windows | PM2 + Windows Service (pm2-windows-service) |
| macOS | PM2 + LaunchDaemon plist |
| Linux | PM2 + systemd unit file |

### Files to Create

| File | Purpose |
|---|---|
| `server/ecosystem.config.js` | PM2 configuration |
| `server/scripts/install-service.js` | Auto-setup daemon script |

---

## 6.4 Session Management

### Multiple Project Sessions

```typescript
interface Session {
  id: string;
  name: string;          // "my-app", "website"
  projectPath: string;   // Absolute path on laptop
  terminal: SessionId;   // Active PTY session
  activeFile: string;    // Currently viewed file
  createdAt: number;
}
```

- Tab-like session switcher in mobile app header
- Each session has its own terminal + file context
- Quick-switch between projects

---

## Final Polish Checklist

- [ ] All traffic encrypted (WSS + DTLS)
- [ ] PIN pairing works on first connection
- [ ] Session token persists across app restarts
- [ ] Micro-animations on all interactive elements
- [ ] Haptic feedback on key actions
- [ ] Splash screen displays on app launch
- [ ] Server runs as background daemon (no visible terminal)
- [ ] Multiple project sessions can be created and switched
- [ ] App handles edge cases gracefully (no crashes)
- [ ] Performance: 60fps animations, <5ms message latency
