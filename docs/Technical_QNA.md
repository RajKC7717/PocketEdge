# Pocket Edge — Technical Q&A

> Deep dive into technical decisions, stack choices, and architecture for judges.

---

## 1. Technology Stack Choices

**Q: Why React Native (Expo) instead of Flutter or Native (Kotlin/Swift)?**
A: **Speed and Ecosystem.** React Native allows a single JavaScript codebase for both iOS and Android. Expo removes the native build complexity. Crucially, sharing the same language (JavaScript) with our Node.js backend makes defining WebSocket message formats and sharing logic much easier.

**Q: Why Node.js for the backend instead of Python or Go?**
A: **Async I/O & Process Control.** Node.js has a highly efficient event-driven architecture perfect for handling persistent WebSocket connections. Its built-in `child_process` module makes it incredibly easy to spawn terminals, execute OS commands (power control), and run FFmpeg without blocking the main thread.

**Q: Why use WebSockets instead of a REST API?**
A: **Real-time bidirectional data.** REST is stateless and request-response based. Features like the live Terminal and Screen Streaming require a continuous, low-latency stream of data pushed from the server to the client without the client polling constantly.

---

## 2. Architecture & Implementation Decisions

**Q: Why use mDNS (Bonjour/ZeroConf) for discovery instead of cloud matchmaking?**
A: **Local-First & Privacy.** Cloud matchmaking requires internet access, servers, and user accounts. mDNS operates entirely on the local network (LAN) using multicast DNS, allowing the phone to find the laptop instantly offline, much like Apple's AirDrop or Google Cast. 

**Q: How do you handle mobile hotspots where mDNS often fails due to AP isolation?**
A: **Subnet Scanning Fallback.** If mDNS fails, the app detects the phone's IP, calculates the local subnet, and probes common host IPs (e.g., `.1`, `.131`) and common hotspot subnets (`192.168.43.x` for Android, `172.20.10.x` for iOS) in parallel batches to find the server. 

**Q: Why use FFmpeg for Screen Streaming instead of WebRTC?**
A: **Simplicity and Reliability.** WebRTC provides high framerates but is highly complex, requiring ICE/STUN servers and complex native mobile wrappers. Since Pocket Edge only needs a "dashboard view" (1 FPS) of the laptop, extracting JPEG frames via FFmpeg and sending them over WebSocket is significantly lighter, reliable, and easier to deploy.

**Q: Why use local Ollama instead of just integrating OpenAI/Gemini API?**
A: **Privacy and Offline Capability.** A core philosophy of Pocket Edge is local control. Ollama runs entirely on the laptop, meaning chats about local code or sensitive files never leave the device. However, we implemented an automatic fallback to the Gemini API in case the laptop doesn't have the hardware to run local models.

**Q: Why manage state with React Context instead of Redux or Zustand?**
A: **Scope and Simplicity.** The app's global state is almost entirely isolated to the WebSocket connection and server discovery. React Context is built-in and perfectly sufficient for wrapping the app in a `ConnectionProvider`, avoiding the heavy boilerplate of Redux.

---

## 3. Security & Safety

**Q: How do you prevent arbitrary code execution vulnerabilities?**
A: **No arbitrary command injection.** For power controls (Shutdown/Restart), we don't take commands from the client. The client sends a strict `type: 'power:action', action: 'shutdown'` message, and the server maps it to a hardcoded, safe OS-specific command. The Terminal requires explicit user action to open a session.

**Q: Is the WebSocket connection encrypted (WSS)?**
A: **Currently WS (unencrypted) because it's strictly local LAN.** For a production rollout, generating self-signed certificates for WSS on localhost/LAN is the standard next step, though modern Wi-Fi networks (WPA2/3) already encrypt the transport layer.

---

## 4. Performance Optimizations

**Q: How do you prevent the UI from freezing when rendering terminal output or large files?**
A: **Debouncing and Chunking.** The terminal handler buffers output if processes spam `stdout`, sending chunks rather than individual character messages. In React Native, the terminal uses memoized components to prevent unnecessary re-renders.

**Q: How is file transfer handled without crashing the WebSocket?**
A: **Base64 Encoding.** Binary files are read, encoded to Base64, and sent as a payload. On the mobile side, it's decoded and saved using `expo-file-system`. For very large files, chunking would be required, but current limits easily handle scripts and documents.
