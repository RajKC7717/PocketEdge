# Phase 4: Edge-AI Tunnel (Offline AI)

**Goal**: Provide a private, high-speed AI assistant on the phone powered entirely by the laptop's GPU — zero cloud API calls, complete privacy.

**Estimated Effort**: ~4 hours

---

## Architecture

```
┌────────────────────────────────┐        ┌──────────────────────────────────┐
│  📱 Mobile AI Chat UI           │        │  💻 Server AI Proxy              │
│                                │        │                                  │
│  ChatBubble (user/ai)          │  WS    │  Ollama HTTP API Proxy           │
│  ├── Markdown rendering        │ ◄────► │  ├── POST /api/chat (streaming)  │
│  ├── Code block highlighting   │        │  ├── GET /api/tags (model list)  │
│  └── Typewriter streaming      │        │  └── Streamed token relay        │
│                                │        │                                  │
│  ChatInput                     │        │  Context Injection:              │
│  ├── Multi-line input          │        │  ├── Attach active file content  │
│  ├── Model selector            │        │  └── Attach terminal output      │
│  └── "Attach file" toggle      │        │                                  │
└────────────────────────────────┘        └──────────────────────────────────┘
                                                        │
                                                        ▼
                                            ┌───────────────────────┐
                                            │  Ollama (localhost)    │
                                            │  Port 11434           │
                                            │  Models: llama3, phi3 │
                                            └───────────────────────┘
```

---

## Server Side

### No new dependencies (uses built-in `http` module for Ollama requests)

### Files to Create

| File | Purpose |
|---|---|
| `server/src/handlers/aiHandler.js` | Ollama proxy + token streaming |

### WebSocket AI Protocol

```json
// Client → Server
{ "type": "ai:models" }
{ "type": "ai:chat", "model": "llama3", "messages": [...], "context": "file content..." }
{ "type": "ai:stop" }

// Server → Client
{ "type": "ai:models:response", "models": ["llama3", "phi3", "codellama"] }
{ "type": "ai:token", "content": "Hello", "done": false }
{ "type": "ai:token", "content": "", "done": true, "totalDuration": 1234 }
{ "type": "ai:error", "message": "Ollama not running" }
```

### Ollama API Integration

```javascript
// POST http://localhost:11434/api/chat
// Body: { model, messages, stream: true }
// Response: NDJSON stream of tokens
// Each line: { "message": { "content": "token" }, "done": false }

// Relay each token immediately over WebSocket
// Don't buffer — send as they arrive for real-time feel
```

### Context-Aware Prompting

When "Attach file" is enabled:
```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are a coding assistant. The user is working on the following file:\n\n```javascript\n// file content here\n```"
    },
    { "role": "user", "content": "Explain this function" }
  ]
}
```

---

## Mobile Side

### New Dependencies

| Package | Purpose |
|---|---|
| `react-native-markdown-display` | Render markdown in chat bubbles |

### Files to Create

| File | Purpose |
|---|---|
| `mobile/src/components/AIChat/ChatBubble.tsx` | User/AI message bubbles |
| `mobile/src/components/AIChat/ChatInput.tsx` | Input + model selector |
| `mobile/src/components/AIChat/StreamingText.tsx` | Typewriter effect for streaming |
| `mobile/src/hooks/useAIChat.ts` | Chat state management |
| `mobile/app/(tabs)/ai-chat.tsx` | AI Chat tab screen |

### Chat Message Format (Internal State)

```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming: boolean; // true while tokens are arriving
  model?: string;
}
```

### Streaming UX

```
User sends message
  → Input disabled, "Thinking..." indicator
  → First token arrives → start rendering
  → Each token appends to message content → re-render
  → done: true → finalize message, re-enable input
  → Show generation stats (tokens/sec, total time)
```

---

## Verification Checklist

- [ ] AI Chat tab shows clean chat interface
- [ ] Model selector lists available Ollama models
- [ ] Sending a message → response streams in real-time
- [ ] Code blocks in responses are syntax-highlighted
- [ ] "Attach file" sends current file as context
- [ ] Works completely offline (no internet required)
- [ ] `ai:stop` cancels in-progress generation
- [ ] Error handling: shows message if Ollama is not running
