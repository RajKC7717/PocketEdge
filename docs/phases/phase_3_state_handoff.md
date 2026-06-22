# Phase 3: State Handoff & File Sync

**Goal**: Achieve perfect continuity between devices. Your reading position, open file, and cursor line are tracked and handed off automatically.

**Estimated Effort**: ~5 hours

---

## Architecture

```
┌────────────────────────────────┐        ┌──────────────────────────────────┐
│  📱 Mobile File Viewer          │        │  💻 Server File System Bridge     │
│                                │        │                                  │
│  FileTree component            │  WS    │  chokidar (file watcher)         │
│  ├── Collapsible tree view     │ ◄────► │  ├── Watch project directories   │
│  ├── File/folder icons         │        │  ├── Detect changes              │
│  └── Pull-to-refresh           │        │  └── Broadcast to clients        │
│                                │        │                                  │
│  CodeViewer component          │        │  File Operations:                │
│  ├── Syntax highlighting       │        │  ├── file:list (dir tree)        │
│  ├── Line numbers              │        │  ├── file:read (stream content)  │
│  ├── Scroll-to-line            │        │  ├── file:write (save edits)     │
│  └── Basic inline editing      │        │  └── file:watch / file:unwatch   │
│                                │        │                                  │
│  State Sync:                   │        │  State Tracker:                  │
│  ├── Auto-show active file     │        │  ├── Track active file           │
│  └── Scroll to cursor line     │        │  ├── Track cursor position       │
│                                │        │  └── Broadcast state changes     │
└────────────────────────────────┘        └──────────────────────────────────┘
```

---

## Server Side

### New Dependencies

| Package | Version | Purpose |
|---|---|---|
| `chokidar` | ^4.0 | Cross-platform file system watching |
| `mime-types` | ^2.1 | Detect file MIME types |

### Files to Create

| File | Purpose |
|---|---|
| `server/src/handlers/fileHandler.js` | File CRUD operations over WS |
| `server/src/handlers/stateHandler.js` | Active context tracking |

### WebSocket File Protocol

```json
// Client → Server
{ "type": "file:list", "path": "/project/src" }
{ "type": "file:read", "path": "/project/src/index.js" }
{ "type": "file:write", "path": "/project/src/index.js", "content": "..." }
{ "type": "file:watch", "path": "/project/src" }

// Server → Client
{ "type": "file:tree", "data": [{ "name": "src", "type": "dir", "children": [...] }] }
{ "type": "file:content", "path": "...", "content": "...", "language": "javascript" }
{ "type": "file:changed", "path": "...", "changeType": "modify" }
{ "type": "state:update", "activeFile": "...", "cursorLine": 42, "scrollOffset": 0 }
```

### File Tree Response Format

```json
{
  "name": "project",
  "type": "directory",
  "children": [
    {
      "name": "src",
      "type": "directory",
      "children": [
        { "name": "index.js", "type": "file", "size": 1234, "modified": "2024-..." }
      ]
    },
    { "name": "package.json", "type": "file", "size": 567, "modified": "2024-..." }
  ]
}
```

### Ignored Paths (not synced)

```
node_modules, .git, .expo, dist, build, __pycache__, .DS_Store, *.pyc
```

---

## Mobile Side

### Files to Create

| File | Purpose |
|---|---|
| `mobile/src/components/FileExplorer/FileTree.tsx` | Collapsible tree view |
| `mobile/src/components/FileExplorer/FileTreeItem.tsx` | Individual tree node |
| `mobile/src/components/FileExplorer/CodeViewer.tsx` | Syntax-highlighted viewer |
| `mobile/src/components/FileExplorer/FileIcon.tsx` | File type → icon mapping |
| `mobile/src/hooks/useFileSystem.ts` | File operations hook |
| `mobile/app/(tabs)/files.tsx` | Files tab screen |

### Language Detection

Map file extensions to syntax highlighter language:
```
.js/.jsx → javascript
.ts/.tsx → typescript
.py → python
.json → json
.md → markdown
.css → css
.html → html
```

### State Handoff Flow

```
User is editing file.js on laptop at line 42
  → stateHandler detects active file change
  → Broadcasts { type: "state:update", activeFile: "file.js", cursorLine: 42 }
  → Phone receives state update
  → If Files tab is open: auto-navigate to file.js, scroll to line 42
  → If not: store state, apply when tab opens
```

---

## Verification Checklist

- [ ] Files tab shows project directory tree
- [ ] Tapping a file shows syntax-highlighted content
- [ ] Line numbers are visible and correct
- [ ] Editing a file on laptop → phone shows "File changed" indicator
- [ ] Editing on phone → file saved to laptop disk
- [ ] State handoff: active file on laptop auto-opens on phone
- [ ] Scroll position syncs between devices
- [ ] Binary files (images) show "Preview not available" placeholder
