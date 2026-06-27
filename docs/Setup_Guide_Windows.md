# Pocket Edge — Setup Guide for Windows

> Step-by-step instructions for enabling **Chrome Remote Debugging** and installing **FFmpeg** on Windows — required for the Browser Tab Manager and Screen Stream features.

---

## Table of Contents

- [1. Chrome Remote Debugging Setup](#1-chrome-remote-debugging-setup)
  - [What it does](#what-it-does)
  - [Method A — Launch from Run dialog (quickest)](#method-a--launch-from-run-dialog-quickest)
  - [Method B — Launch from Command Prompt / PowerShell](#method-b--launch-from-command-prompt--powershell)
  - [Method C — Create a Desktop shortcut (recommended for daily use)](#method-c--create-a-desktop-shortcut-recommended-for-daily-use)
  - [Method D — For Microsoft Edge (instead of Chrome)](#method-d--for-microsoft-edge-instead-of-chrome)
  - [Verify it's working](#verify-its-working)
  - [Troubleshooting](#troubleshooting)
- [2. FFmpeg Installation on Windows](#2-ffmpeg-installation-on-windows)
  - [What it does](#what-it-does-1)
  - [Method A — Download pre-built binary (easiest)](#method-a--download-pre-built-binary-easiest)
  - [Method B — Install via winget (Windows Package Manager)](#method-b--install-via-winget-windows-package-manager)
  - [Method C — Install via Chocolatey](#method-c--install-via-chocolatey)
  - [Method D — Install via Scoop](#method-d--install-via-scoop)
  - [Verify the installation](#verify-the-installation)
  - [Troubleshooting](#troubleshooting-1)

---

## 1. Chrome Remote Debugging Setup

### What it does

The **Browser Tab Manager** feature in Pocket Edge connects to Chrome/Edge's built-in DevTools Protocol to list, close, and freeze/unfreeze your browser tabs from your phone. This requires launching Chrome with a special flag that enables a debugging server on port `9222`.

> **Important**: You must **close ALL existing Chrome windows** before launching with remote debugging, otherwise the flag is ignored because Chrome reuses the existing process.

---

### Method A — Launch from Run dialog (quickest)

1. **Close all Chrome windows** completely (check system tray too — right-click Chrome icon → Exit)

2. Press `Win + R` to open the Run dialog

3. Paste this command and hit Enter:

   ```
   chrome.exe --remote-debugging-port=9222
   ```

4. Chrome will open. You can now use it normally — the debugging port runs in the background.

---

### Method B — Launch from Command Prompt / PowerShell

1. **Close all Chrome windows** completely

2. Open **Command Prompt** or **PowerShell**

3. Run one of these commands:

   **If Chrome is in your PATH:**
   ```cmd
   chrome.exe --remote-debugging-port=9222
   ```

   **If Chrome is NOT in your PATH (use the full path):**
   ```cmd
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
   ```

   **For 32-bit Chrome on 64-bit Windows:**
   ```cmd
   "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
   ```

4. Chrome will open with remote debugging enabled.

---

### Method C — Create a Desktop shortcut (recommended for daily use)

This is the best option if you'll be using Pocket Edge regularly.

1. **Right-click** on your Desktop → **New** → **Shortcut**

2. In the "Type the location of the item" field, paste:

   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
   ```

3. Click **Next**

4. Name the shortcut: **Chrome (Debug Mode)** or **Pocket Edge Chrome**

5. Click **Finish**

6. **(Optional)** Right-click the new shortcut → **Properties** → Change the icon to differentiate it from regular Chrome

Now you can just double-click this shortcut whenever you want to use the Browser Tab Manager feature!

> **Tip**: Pin this shortcut to your Start Menu or Taskbar for even quicker access.

---

### Method D — For Microsoft Edge (instead of Chrome)

Edge uses the same Chromium engine, so it works identically:

1. **Close all Edge windows** completely

2. Open Run (`Win + R`) and paste:

   ```
   msedge.exe --remote-debugging-port=9222
   ```

   Or with the full path:
   ```
   "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --remote-debugging-port=9222
   ```

---

### Verify it's working

After launching Chrome with the flag:

1. Open a browser (any browser — can even be the same Chrome)
2. Go to: **http://localhost:9222/json**
3. You should see a **JSON array** listing all your open tabs, like:

   ```json
   [
     {
       "id": "ABC123...",
       "title": "Google",
       "url": "https://www.google.com/",
       "type": "page"
     }
   ]
   ```

4. If you see this JSON, the Browser Tab Manager in Pocket Edge will work!

---

### Troubleshooting

| Problem | Solution |
|---------|----------|
| **"Chrome remote debugging is not enabled"** in Pocket Edge | Close ALL Chrome windows (check system tray) and relaunch with the flag |
| **`localhost:9222/json` shows "Connection Refused"** | Chrome wasn't launched with the flag, or another Chrome process was already running |
| **Port 9222 already in use** | Another app is using the port. Try `--remote-debugging-port=9223` instead (and note: Pocket Edge currently expects port 9222) |
| **Chrome opens but flag doesn't work** | Make sure you closed ALL existing Chrome instances first. Chrome will ignore the flag if it attaches to an already-running process |
| **Using a custom Chrome profile** | Add `--user-data-dir="C:\ChromeDebug"` after the debugging flag to use a separate profile |

---

## 2. FFmpeg Installation on Windows

### What it does

The **Screen Stream** feature uses **FFmpeg** to capture your laptop's desktop and stream it as a series of JPEG frames to your phone. FFmpeg is a free, open-source tool that handles video/audio processing.

---

### Method A — Download pre-built binary (easiest)

This is the recommended method for most users.

#### Step 1: Download FFmpeg

1. Go to the official FFmpeg builds page: **https://www.gyan.dev/ffmpeg/builds/**

2. Under **"Release builds"**, click the link:
   
   **`ffmpeg-release-essentials.zip`** (≈ 85 MB)
   
   > Choose "essentials" — it includes everything Pocket Edge needs.

3. Alternatively, use this direct-link site: **https://github.com/BtbN/FFmpeg-Builds/releases**
   - Download: `ffmpeg-master-latest-win64-gpl.zip`

#### Step 2: Extract the ZIP

1. Right-click the downloaded `.zip` file → **Extract All...**

2. Extract to a permanent location. We recommend:
   
   ```
   C:\ffmpeg
   ```

3. After extraction, you should see this structure:
   ```
   C:\ffmpeg\
   └── ffmpeg-7.x-essentials_build\
       └── bin\
           ├── ffmpeg.exe      ← This is what we need
           ├── ffplay.exe
           └── ffprobe.exe
   ```

4. **(Optional)** Move the files up for a cleaner path:
   - Copy the contents of `ffmpeg-7.x-essentials_build\bin\` directly into `C:\ffmpeg\bin\`

#### Step 3: Add FFmpeg to the System PATH

This is the most important step — it lets any program (including Pocket Edge's server) find `ffmpeg.exe`.

1. Press `Win + S` and search for **"Environment Variables"**

2. Click **"Edit the system environment variables"**

3. In the System Properties dialog, click **"Environment Variables..."**

4. Under **"System variables"** (bottom section), find the variable named **`Path`** and select it

5. Click **"Edit..."**

6. Click **"New"** and add the path to the FFmpeg bin folder:

   ```
   C:\ffmpeg\ffmpeg-7.x-essentials_build\bin
   ```
   
   Or if you moved the files:
   ```
   C:\ffmpeg\bin
   ```

7. Click **OK** → **OK** → **OK** to close all dialogs

8. **⚠️ IMPORTANT: Close and reopen any Command Prompt / PowerShell / terminal windows** — they won't pick up the new PATH until reopened

9. **⚠️ IMPORTANT: Restart the Pocket Edge server** — the server process also needs to be restarted to see the new PATH

#### Step 4: Verify

Open a **new** Command Prompt or PowerShell and run:

```cmd
ffmpeg -version
```

You should see output like:
```
ffmpeg version 7.0.1-essentials_build ...
built with gcc 13.2.0 (Rev5, Built by MSYS2 project)
...
```

If you see this, FFmpeg is installed correctly!

---

### Method B — Install via winget (Windows Package Manager)

If you have Windows 10 (1809+) or Windows 11 with winget:

```powershell
winget install --id Gyan.FFmpeg -e --source winget
```

That's it! Winget automatically downloads FFmpeg and adds it to your PATH.

**Verify:**
```cmd
ffmpeg -version
```

> You may need to restart your terminal for the PATH change to take effect.

---

### Method C — Install via Chocolatey

If you have [Chocolatey](https://chocolatey.org/) installed:

1. Open PowerShell **as Administrator**

2. Run:
   ```powershell
   choco install ffmpeg -y
   ```

3. Restart your terminal, then verify:
   ```cmd
   ffmpeg -version
   ```

---

### Method D — Install via Scoop

If you have [Scoop](https://scoop.sh/) installed:

```powershell
scoop install ffmpeg
```

Verify:
```cmd
ffmpeg -version
```

---

### Verify the installation

After installing via ANY method, run this in a **new** terminal:

```cmd
ffmpeg -version
```

**Expected output** (version numbers may vary):
```
ffmpeg version 7.0.1 Copyright (c) 2000-2024 the FFmpeg developers
built with gcc 13.2.0 ...
configuration: --enable-gpl --enable-version3 ...
```

**Quick screen capture test** (optional — captures 3 seconds of your screen):
```cmd
ffmpeg -f gdigrab -i desktop -t 3 -y test_capture.mp4
```

If this creates a `test_capture.mp4` file, screen capture works! You can delete the test file.

---

### Troubleshooting

| Problem | Solution |
|---------|----------|
| **`'ffmpeg' is not recognized as an internal or external command`** | FFmpeg is not in your PATH. Follow Step 3 of Method A carefully |
| **Pocket Edge says "FFmpeg is required"** | The Pocket Edge server process can't find ffmpeg. Make sure you restarted the server AFTER adding FFmpeg to PATH |
| **Screen capture shows a black screen** | This can happen with some GPU drivers. Try adding `-hwaccel auto` to the FFmpeg command. The current implementation uses `gdigrab` which works with most setups |
| **FFmpeg command works in terminal but not from Pocket Edge** | The server was started before FFmpeg was added to PATH. Restart the Pocket Edge server: `cd server && node src/index.js` |
| **Permission denied / Access denied** | Run your terminal as Administrator when extracting to `C:\ffmpeg` |
| **Antivirus blocks FFmpeg** | Some antivirus software flags FFmpeg. Add an exception for `C:\ffmpeg\bin\ffmpeg.exe` |

---

## Quick Reference

### Starting Pocket Edge with All Features

```powershell
# 1. Close all Chrome windows first, then launch with debugging:
Start-Process "chrome.exe" "--remote-debugging-port=9222"

# 2. Start the Pocket Edge server (in a separate terminal):
cd C:\path\to\pocket-edge\server
node src/index.js

# 3. Open the Pocket Edge mobile app and connect to the server
```

### Feature Requirements Summary

| Feature | Requires | One-time Setup |
|---------|----------|----------------|
| Dashboard | — | None |
| Terminal | — | None |
| Files | — | None |
| AI Chat | Ollama/Gemini API | Install Ollama or add Gemini API key |
| Transfer | — | None |
| **Power Control** | — | None |
| **Browser Tabs** | Chrome with `--remote-debugging-port=9222` | Create desktop shortcut (Method C) |
| **Screen Stream** | FFmpeg in PATH | Download & add to PATH (one-time) |
