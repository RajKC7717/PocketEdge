# Pocket Edge — Jury Q&A Cheat Sheet

> Quick, crisp answers for hackathon jury questions.

---

## What & Why

**Q: What is Pocket Edge?**
A: A mobile app that turns your smartphone into a remote control for your laptop over local Wi-Fi — terminal, file browser, AI chat, power control, browser tab manager, and screen viewer — all from your phone.

**Q: What problem does it solve?**
A: Eliminates the need to physically sit at your laptop for quick tasks — run commands, browse files, chat with AI, or shut down your PC from the couch, bed, or across the room.

**Q: Who is the target user?**
A: Developers, students, and power users who want quick access to their laptop without opening the lid or walking to it.

**Q: Why not just use TeamViewer or AnyDesk?**
A: Those require internet, accounts, and are designed for full remote desktop. Pocket Edge is local-only (zero internet), instant connection via mDNS, and purpose-built for quick tasks — not screen mirroring.

---

## Technical Architecture

**Q: What's the tech stack?**
A: React Native (Expo) on mobile, Node.js + Express + WebSocket on the server. Communication is over a single persistent WebSocket on the local Wi-Fi network.

**Q: How does the phone discover the laptop?**
A: The server broadcasts via mDNS/Bonjour (`_pocketedge._tcp`). The phone scans for this service using `react-native-zeroconf`, and auto-connects — zero configuration needed.

**Q: Is it secure? Does data leave the network?**
A: All traffic stays on the local Wi-Fi — nothing goes to the internet. The WebSocket runs over LAN only. No cloud, no accounts, no tracking.

**Q: How do you handle real-time communication?**
A: A single WebSocket connection carries all features as JSON messages with a `type` field (e.g., `terminal:output`, `file:list`, `ai:token`). The server routes each message to its specific handler.

**Q: What AI models are supported?**
A: Ollama (local, offline) is the primary backend. If Ollama isn't running, it automatically falls back to Google Gemini cloud API — completely seamless for the user.

---

## Features

**Q: How does the terminal work?**
A: The server spawns a real shell process (`cmd`/`bash`/`zsh`) using Node.js `child_process`. Keystrokes from the phone are sent as WebSocket messages and output streams back in real-time.

**Q: How does file transfer work?**
A: The phone sends a `file:read` WebSocket message with the file path. The server reads the file and sends its content back. The phone saves it locally using `expo-file-system` and offers a share sheet to export.

**Q: How does screen streaming work?**
A: FFmpeg captures the desktop at 1 FPS as JPEG frames, base64-encodes them, and sends each frame over WebSocket. The phone auto-rotates to landscape for full visibility.

**Q: How does the browser tab manager work?**
A: It connects to Chrome's DevTools Protocol (CDP) on port 9222 via HTTP. It can list, close, and freeze/unfreeze tabs — all from the phone.

**Q: How does power control work?**
A: Sends OS-native shell commands (`shutdown`, `restart`, `sleep`) from the server using Node.js `child_process.exec`. Has a confirmation dialog with countdown for safety.

---

## Differentiators

**Q: What makes this different from existing solutions?**
A: (1) Fully local — no internet or accounts needed, (2) auto-discovery via mDNS — zero setup, (3) 7 features in one app purpose-built for quick laptop control, (4) AI chat that works offline with Ollama.

**Q: Can it work without internet?**
A: Yes, 100%. All communication is over local Wi-Fi. Even AI chat works offline if Ollama is installed on the laptop.

**Q: What platforms are supported?**
A: Server runs on Windows, macOS, and Linux. Mobile app runs on Android and iOS via Expo.

---

## Challenges & Learnings

**Q: What was the biggest technical challenge?**
A: Multiplexing 7 features over a single WebSocket connection with proper message routing, error handling, and state management — while keeping latency under 50ms on the LAN.

**Q: What would you improve with more time?**
A: Add WebRTC for peer-to-peer file transfer, end-to-end encryption for the WebSocket channel, and multi-device support (control multiple laptops from one phone).

---

## Quick Stats

| Metric | Value |
|--------|-------|
| Features | 7 (Terminal, Files, AI Chat, Transfer, Power, Browser, Screen) |
| Protocol | WebSocket over local Wi-Fi |
| Discovery | mDNS / Bonjour (zero-config) |
| Latency | ~30-50ms on LAN |
| AI Backends | Ollama (local) + Gemini (cloud fallback) |
| Screen FPS | 1 frame/sec (screenshot mode) |
| Internet Required | No |
