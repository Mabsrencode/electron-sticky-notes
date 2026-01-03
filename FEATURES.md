# Sticky Notes - Advanced Features Guide

This document describes all the advanced features implemented in the Sticky Notes app.

## 1. Note Templates

**Purpose**: Quickly create notes with predefined structure.

**Templates Available**:
- **Blank** (📝): Empty note for free-form content
- **Todo List** (✓): Pre-formatted with checkboxes
- **Meeting Notes** (👥): Structured with Date, Attendees, Topics, Action Items
- **Shopping List** (🛒): Formatted with bullet points for items

**How to Use**:
1. Click the "+ New note" button or press Ctrl/Cmd+N
2. A modal appears showing 4 template options
3. Click a template to create a note with that structure
4. Edit as normal

**Code**: `showTemplateSelector()` creates the modal UI; `createNoteFromTemplate(key)` instantiates the note with template content.

---

## 2. Bulk Operations

**Purpose**: Perform actions on multiple notes simultaneously.

**Bulk Actions Available**:
- Select/unselect individual notes via checkbox
- **Delete All**: Remove all selected notes with confirmation
- **Tag All**: Add a tag to all selected notes at once
- **Move Folder**: Move all selected notes to a folder
- **Clear Selection**: Unselect all notes

**How to Use**:
1. Click the checkbox on any note card to select it
2. A sticky bulk action bar appears at the top showing count
3. Click action buttons to delete, tag, or move selected notes
4. Click "Clear" to deselect all

**Code**: Checkboxes toggle `state.selectedNotes` Set; `updateBulkUI()` manages the action bar display and operations.

---

## 3. Folders/Collections

**Purpose**: Organize notes into logical groups.

**Features**:
- Every note has a `folder` property (default: "default")
- Notes can be moved between folders
- Filter notes by folder using `folder:foldername` in search

**How to Use**:

**On Main Board**:
1. Search for notes in a folder: Type `folder:work` to show work folder notes
2. Bulk move: Select notes → click "Move Folder" → enter folder name

**On Pop-out**:
1. Click "Folder" button
2. Enter folder name (e.g., "work", "personal", "archive")
3. Note will be saved to that folder

**Display**: Each note card shows folder indicator (e.g., "📁 default")

**Code**: `noteMatchesSearch()` handles `folder:` prefix filtering; note schema includes `folder` field.

---

## 4. Tags with Auto-Filtering

**Purpose**: Label and categorize notes flexibly.

**Features**:
- Add multiple tags per note (stored as array)
- Tags display as clickable chips on cards
- Filter by tag using `tag:tagname` in search
- Bulk tag multiple notes at once

**How to Use**:

**On Main Board**:
1. Each note card shows tags as chips (if any)
2. Click a tag chip to auto-filter notes with that tag
3. Search bar updates to show `tag:tagname`

**On Pop-out**:
1. Click "Tag" button
2. Enter tag name (e.g., "urgent", "ideas", "review")
3. Tag appears in metadata

**Bulk Tagging**:
1. Select multiple notes (checkboxes)
2. Click "Tag All" in bulk bar
3. Enter tag name
4. All selected notes get that tag

**Code**: `noteMatchesSearch()` handles `tag:` prefix filtering; tags stored in `note.tags` array.

---

## 5. Recurring Reminders

**Purpose**: Set reminders that repeat on a schedule.

**Recurrence Options**:
- **None** (default): One-time reminder
- **Daily**: Reminder repeats every day at the same time
- **Weekly**: Reminder repeats every week (same day, same time)
- **Monthly**: Reminder repeats monthly (same date, same time)

**How to Use**:
1. Click "Remind" or "Edit reminder" button on a note
2. Modal opens with datetime picker and recurrence dropdown
3. Select a datetime using the date/time input
4. Choose recurrence frequency
5. Click "Save"
6. Windows notification appears when due

**Windows Notifications**:
- Triggered 60 seconds after reminder time
- Shows note title and reminder datetime
- Click notification to focus app

**Code**: 
- `openReminderDialog()` creates UI with recurrence select
- `startReminderChecker()` checks every 60 seconds for due reminders
- Recurring reminders tracked separately (full implementation calculates next occurrence on next app startup)

---

## 6. Note Locking

**Purpose**: Protect note content with password.

**Features**:
- Lock/unlock notes with password
- Locked notes show 🔒 icon
- Password prompt appears when unlocking
- Password stored in note metadata

**How to Use**:

**On Main Board**:
1. Click "Lock" button on a note card
2. If not locked: prompt asks for password
3. Enter password → note becomes locked (shows 🔒)
4. To unlock: click "Lock" → enter password → unlocked

**On Pop-out**:
1. Click "Lock" button
2. Set password (first time) or enter password to unlock
3. Lock status shown in metadata

**Security Note**: 
- Passwords stored as plain text in localStorage
- For enhanced security, implement encryption (future feature)
- Basic protection against casual access

**Code**: `toggleNoteLock(noteId)` handles lock/unlock logic with password validation.

---

## 7. Advanced Search Filters

**Purpose**: Find notes quickly using specialized search syntax.

**Syntax**:
- **`tag:tagname`** → Show notes with specific tag
  - Example: `tag:urgent` shows all urgent notes
  
- **`folder:foldername`** → Show notes in specific folder
  - Example: `folder:work` shows all work notes

- **Regular text** → Search in title, content, and color hex codes
  - Example: `meeting` finds "Team meeting" or notes with "meeting" in content

**How to Use**:
1. Click the search box at top of main board
2. Type your search query
3. Results update in real-time

**Examples**:
- `tag:ideas` → All idea notes
- `folder:archive` → Archived notes
- `meeting notes` → Notes containing "meeting" or "notes"
- `#f5b81b` → Notes in yellow color

**Code**: `noteMatchesSearch()` evaluates query against note properties with special syntax handling.

---

## 8. Combined Features Example

**Workflow**: Organize a project

1. **Create meeting notes**: Click "+ New" → Select "Meeting Notes" template
2. **Assign to folder**: Pop-out → Click "Folder" → Type "project-x"
3. **Add tags**: Pop-out → Click "Tag" → Add "design", "sprint-2"
4. **Set reminder**: Click "Edit reminder" → Set for next week → Recurrence: Weekly
5. **Organize**: Back on board, filter by `folder:project-x` to see all project notes
6. **Bulk action**: Select design notes → "Tag All" → Add "review-needed"
7. **Record voice memo**: Click "🎙️ Record" to capture audio thoughts
8. **Playback**: Click "▶️ Play" to review your voice notes

---

## 8. Voice Notes

**Purpose**: Record audio snippets directly into notes for quick voice memos.

**Features**:
- Record multiple audio clips per note
- Play back recordings anytime
- Delete individual recordings
- Audio stored as base64 in localStorage (works offline)
- Works on main board and pop-out windows

**How to Use**:

**Recording**:
1. Click **"🎙️ Record"** button on a note (main board or pop-out)
2. Approve microphone access when prompted by browser
3. Speak your memo
4. Click **"⏹️ Stop"** to finish

**Playing Back**:
1. Find your note with voice recordings
2. Each recording shows as "Voice #1", "Voice #2", etc.
3. Click **"▶️ Play"** to listen
4. Click **"✕ Delete"** to remove a recording

**Storage**:
- Voice audio encoded as base64 data URLs
- Stored in note's `voiceNotes` array: `[{data: "data:audio/webm;...", duration: 5}, ...]`
- Counts toward localStorage quota (~5-10MB per app)
- Persists across browser sessions

**Limitations**:
- Requires microphone permission (granted in browser)
- Audio quality depends on device microphone
- WebM format used (browser standard)
- Each note can have unlimited recordings (but adds storage weight)

**Code**: 
- `startVoiceRecording()` handles recording UI and MediaRecorder API
- `playVoiceNote()` plays back audio using HTML5 Audio element
- `renderVoiceNotes()` displays recordings in pop-out window

---

## Data Model

Each note now includes:

```javascript
{
  id: string,
  title: string,
  content: string,
  color: string (hex),
  pinned: boolean,
  folder: string,              // "default", "work", etc.
  tags: string[],              // ["urgent", "ideas"]
  locked: boolean,             // password protected?
  password: string | null,     // lock password
  reminderAt: number | null,   // Unix timestamp
  recurrence: string | null,   // "daily", "weekly", "monthly"
  voiceNotes: Array<{          // NEW: voice recordings
    data: string,              // base64 encoded audio
    duration: number           // seconds (estimated)
  }>,
  createdAt: number,
  updatedAt: number
}
```

---

## Keyboard Shortcuts

- **Ctrl/Cmd + N**: Create new note (opens template picker)
---

## Troubleshooting

**Templates not appearing?**
- Check browser console (F12) for JS errors
- Ensure `templates` object is defined in renderer.js state

**Bulk operations not working?**
- Ensure checkboxes are visible and clickable
- Check `state.selectedNotes` in console: `state.selectedNotes.size`

**Reminders not firing?**
- App must be running; reminders checked every 60 seconds
- Check Windows notification settings (Settings > Notifications)
- Verify reminder time is in future

**Notes not saving?**
- Check localStorage quota (usually 5-10MB)
- Open DevTools (F12) → Application → LocalStorage → Check `sticky-notes:v1` key

**Locked notes refusing to open?**
- Verify password is correct (case-sensitive)
- Check console for errors
- (Future: implement password reset)

---


