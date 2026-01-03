# Sticky Notes (Electron)

Personal sticky-notes desktop app built with Electron. Notes persist locally and can be popped out into always-on-top windows.

## Requirements
- Node.js 18+ (comes with npm)
- Windows 10/11 (scripts target Windows; Electron is cross-platform with minor adjustments)

## Install
```bash
npm install
```

## Run in dev
```bash
npm start
```
This launches the Electron app with hot reload of renderer assets.

## Build installer (Windows NSIS)
From a PowerShell or cmd in the project root:
```bash
npm run dist
```
Outputs:
- Installer: `dist/Sticky Notes-Setup-0.1.0.exe`
- Portable unpacked app: `dist/win-unpacked/Sticky Notes.exe`

### If you hit code-signing/symlink issues on Windows
Some environments block symlinks during the winCodeSign download. Workaround (PowerShell):
```powershell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign" -ErrorAction Ignore
$env:ELECTRON_BUILDER_DISABLE_CODE_SIGNING=1
npm run dist
```
If PowerShell blocks `npm.ps1`, call the cmd shim:
```powershell
& "C:\\Program Files\\nodejs\\npm.cmd" run dist
```

## Project structure
- `main.js` — Electron main process, window creation, IPC, always-on-top pop-outs.
- `preload.js` — secure bridge exposing minimal APIs to renderer.
- `index.html`, `renderer.js`, `styles.css` — main board UI and logic.
- `note.html`, `note.js` — pop-out note window UI/logic.
- `build/icon.png` — app icon used for packaging.

## Features
- **Local-only storage** (`localStorage`) for all notes.
- **Pop-out note windows** (always on top).
- **Pin, duplicate, delete, color palette** per note.
- **Search, sort** (updated/created/title), pinned-only filter, compact view.
- **Search filters**: `tag:tagname` to find notes by tag, `folder:foldername` to find by folder.
- **Keyboard**: Ctrl/Cmd + N to create a note; double-click a card to pop out.

### Advanced Features
- **Templates**: Choose from Blank, Todo List, Meeting Notes, or Shopping List when creating a note.
- **Bulk Operations**: Select multiple notes with checkboxes; bulk delete, tag, or move to folders.
- **Folders/Collections**: Organize notes into folders; each note has a folder property (default: "default").
- **Tags**: Add multiple tags to notes; filter by tags; tags display as clickable chips.
- **Recurring Reminders**: Set reminders with frequency (once, daily, weekly, monthly).
- **Note Locking**: Protect notes with password; locked notes show a lock icon.
- **Voice Notes**: Record audio snippets directly into notes; play back or delete recordings.
- **Windows Notifications**: Get alerts when reminders are due.

### Voice Notes
- Click **"🎙️ Record"** button on any note to start recording
- Allow microphone access when prompted
- Click **"⏹️ Stop"** to finish recording
- Recorded voice notes appear below with play and delete buttons
- All voice data stored locally in note

### Editing Notes
- **Main board**: Edit title/content inline, manage colors, set reminders, record voice notes.
- **Pop-out windows**: Full editing with color palette, pin, lock, tag, folder, voice notes, duplicate, delete.
- **Tags**: Click a tag chip to filter all notes with that tag; add tags via the Tag button.
- **Folders**: Click Folder button to assign a note to a folder; filter by folder in search.
- **Voice**: Record multiple voice notes per note; play them back anytime.

## Customizing icon
Replace `build/icon.png` with your own 256×256 (or larger) square PNG before running `npm run dist`.

## Packaging config
Configured in `package.json` under the `build` key using `electron-builder` targeting Windows NSIS.
