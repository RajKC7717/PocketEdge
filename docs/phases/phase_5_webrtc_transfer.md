# Phase 5: WebRTC High-Speed File Transfer

**Goal**: Establish a true P2P data channel for large file transfers at maximum network throughput.

**Estimated Effort**: ~5 hours

---

## Architecture

```
┌────────────────────────────────┐        ┌──────────────────────────────────┐
│  📱 Mobile WebRTC Client        │        │  💻 Server WebRTC Peer            │
│                                │        │                                  │
│  react-native-webrtc           │  P2P   │  wrtc (Node WebRTC)              │
│  ├── RTCPeerConnection         │ ◄════► │  ├── RTCPeerConnection           │
│  ├── RTCDataChannel            │        │  ├── RTCDataChannel              │
│  └── File sender/receiver      │        │  └── File sender/receiver        │
│                                │        │                                  │
│  Signaling (via WebSocket):    │  WS    │  Signaling Handler:              │
│  ├── SDP Offer/Answer          │ ◄────► │  ├── SDP Offer/Answer           │
│  └── ICE Candidates            │        │  └── ICE Candidates             │
│                                │        │                                  │
│  Transfer UI:                  │        │  Transfer Manager:               │
│  ├── Progress bar              │        │  ├── Chunk files (64KB)          │
│  ├── Speed indicator           │        │  ├── Sequence numbering          │
│  └── Transfer history          │        │  └── Hash verification           │
└────────────────────────────────┘        └──────────────────────────────────┘
```

---

## Signaling Flow (WebSocket-mediated)

```
Phone                          WebSocket                        Laptop
  │                               │                               │
  │── transfer:offer ────────────►│──────────────────────────────►│
  │                               │                               │
  │◄─────────────────────────────│◄──────── transfer:answer ─────│
  │                               │                               │
  │── transfer:ice ──────────────►│──────────────────────────────►│
  │◄─────────────────────────────│◄──────── transfer:ice ────────│
  │                               │                               │
  │═══════════════ P2P Data Channel Established ═════════════════│
  │                               │                               │
  │◄════════════════════ File chunks (64KB) ════════════════════►│
```

---

## Server Side

### New Dependencies

| Package | Version | Purpose |
|---|---|---|
| `wrtc` | ^0.4 | WebRTC for Node.js |

### Files to Create

| File | Purpose |
|---|---|
| `server/src/handlers/transferHandler.js` | WebRTC signaling + data channel + chunking |

### File Chunking Protocol

```json
// Metadata message (first message on data channel)
{
  "type": "file:meta",
  "fileName": "video.mp4",
  "fileSize": 104857600,
  "totalChunks": 1600,
  "hash": "sha256:abc123..."
}

// Data chunks (ArrayBuffer, not JSON)
// Header: 4 bytes sequence number + payload
[seq:uint32][data:ArrayBuffer(65536)]

// Completion message
{ "type": "file:complete", "totalChunks": 1600, "hash": "sha256:abc123..." }

// Ack message
{ "type": "file:ack", "verified": true }
```

### Chunk Size Selection

- **64KB** per chunk (65,536 bytes)
- Balances throughput vs. memory pressure
- At 100 MB/s: ~1,600 chunks per 100MB file
- Sequence numbers for ordering and retry

---

## Mobile Side

### New Dependencies

| Package | Purpose |
|---|---|
| `react-native-webrtc` | WebRTC for React Native |
| `react-native-fs` | File system access for saving received files |
| `react-native-document-picker` | Pick files to send |

### Files to Create

| File | Purpose |
|---|---|
| `mobile/src/hooks/useWebRTC.ts` | WebRTC connection + data channel management |
| `mobile/src/hooks/useFileTransfer.ts` | Chunking, reassembly, progress tracking |
| `mobile/src/components/Transfer/TransferProgress.tsx` | Progress bar + speed display |
| `mobile/src/components/Transfer/TransferHistory.tsx` | Recent transfers list |
| `mobile/app/(tabs)/transfer.tsx` | Transfer tab screen |

### Progress Calculation

```typescript
interface TransferProgress {
  fileName: string;
  direction: 'upload' | 'download';
  totalBytes: number;
  transferredBytes: number;
  percentage: number;        // 0-100
  speed: number;             // bytes/sec (rolling average over last 2s)
  eta: number;               // estimated seconds remaining
  status: 'connecting' | 'transferring' | 'verifying' | 'complete' | 'error';
}
```

---

## Fallback Strategy

If WebRTC fails to establish (NAT issues, etc.):
- Fall back to WebSocket-based chunked transfer
- Slower but still functional
- User sees "Using fallback transfer" indicator

---

## Verification Checklist

- [ ] Transfer tab shows send/receive interface
- [ ] WebRTC data channel establishes via WS signaling
- [ ] Small file (1MB) transfers correctly with hash verification
- [ ] Large file (100MB+) transfers with progress bar and speed indicator
- [ ] Transfer works on Wi-Fi and phone hotspot
- [ ] Fallback to WebSocket transfer if WebRTC fails
- [ ] Transfer history shows recent transfers with status
