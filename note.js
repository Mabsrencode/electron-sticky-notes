(() => {
  const STORAGE_KEY = 'sticky-notes:v1';
  const palette = ['#f5b81b', '#1ad1a5', '#38bdf8', '#f472b6', '#fb7185', '#a3e635', '#f97316'];

  const params = new URLSearchParams(window.location.search);
  let noteId = params.get('id');
  let notes = readNotes();
  ensureNoteExists();
  let note = getNote();

  const els = {
    title: document.getElementById('noteTitle'),
    body: document.getElementById('noteBody'),
    palette: document.getElementById('colorPalette'),
    pinBtn: document.getElementById('pinBtn'),
    duplicateBtn: document.getElementById('duplicateBtn'),
    deleteBtn: document.getElementById('deleteBtn'),
    closeBtn: document.getElementById('closeBtn'),
    reminderBtn: null,
    meta: document.getElementById('metaText')
  };

  function readNotes() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.error('Failed to read notes', err);
      return [];
    }
  }

  function persistNotes() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    window.electronAPI?.broadcastRefresh?.();
  }

  function ensureNoteExists() {
    if (notes.some((n) => n.id === noteId)) return;
    const now = Date.now();
    noteId = `note-${now}-${Math.random().toString(16).slice(2)}`;
    const color = palette[Math.floor(Math.random() * palette.length)];
    notes.unshift({
      id: noteId,
      title: 'Untitled',
      content: '',
      color,
      pinned: false,
      folder: 'default',
      tags: [],
      locked: false,
      password: null,
      reminderAt: null,
      recurrence: null,
      voiceNotes: [],
      createdAt: now,
      updatedAt: now
    });
    persistNotes();
  }

  function getNote() {
    return notes.find((n) => n.id === noteId) || null;
  }

  function updateNote(fields) {
    const idx = notes.findIndex((n) => n.id === noteId);
    if (idx === -1) return;
    notes[idx] = { ...notes[idx], ...fields, updatedAt: Date.now() };
    note = notes[idx];
    persistNotes();
    updateMeta();
  }

  function deleteNote() {
    notes = notes.filter((n) => n.id !== noteId);
    persistNotes();
    window.close();
  }

  function duplicateNote() {
    const copyId = `note-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const now = Date.now();
    notes.unshift({
      ...note,
      id: copyId,
      title: `${note.title || 'Untitled'} (copy)`,
      createdAt: now,
      updatedAt: now
    });
    persistNotes();
  }

  function renderPalette() {
    els.palette.innerHTML = '';
    palette.forEach((color) => {
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch';
      swatch.style.background = color;
      if (color === note.color) swatch.style.boxShadow = '0 0 0 2px rgba(255,255,255,0.6)';
      swatch.addEventListener('click', () => {
        updateNote({ color });
        renderPalette();
      });
      els.palette.appendChild(swatch);
    });
  }

  function updateMeta() {
    const updated = new Date(note.updatedAt);
    const created = new Date(note.createdAt);
    const parts = [
      `Updated ${updated.toLocaleString()}`,
      `Created ${created.toLocaleDateString()}`
    ];
    if (note.pinned) parts.push('Pinned');
    if (note.locked) parts.push('🔒 Locked');
    if (note.folder && note.folder !== 'default') parts.push(`📁 ${note.folder}`);
    if (note.tags && note.tags.length > 0) parts.push(`Tags: ${note.tags.join(', ')}`);
    if (note.reminderAt) parts.push(`Reminder ${new Date(note.reminderAt).toLocaleString()}`);
    if (note.recurrence) parts.push(`(${note.recurrence})`);
    els.meta.textContent = parts.join(' • ');
    els.pinBtn.textContent = note.pinned ? '📌 Pinned' : 'Pin';
    if (els.reminderBtn) els.reminderBtn.textContent = note.reminderAt ? 'Edit reminder' : 'Remind';
    const lockBtn = document.getElementById('lockBtn');
    if (lockBtn) lockBtn.textContent = note.locked ? 'Unlock' : 'Lock';
  }

  function bindEvents() {
    els.title.value = note.title || '';
    els.body.value = note.content || '';
    autoResize(els.body);
    renderPalette();

    els.title.addEventListener('input', () => updateNote({ title: els.title.value }));
    els.body.addEventListener('input', () => {
      autoResize(els.body);
      updateNote({ content: els.body.value });
    });

    els.pinBtn.addEventListener('click', () => {
      updateNote({ pinned: !note.pinned });
      updateMeta();
    });
    els.duplicateBtn.addEventListener('click', duplicateNote);
    els.deleteBtn.addEventListener('click', deleteNote);
    els.closeBtn.addEventListener('click', () => window.close());
    
    els.reminderBtn = document.getElementById('reminderBtn');
    els.reminderBtn.addEventListener('click', setReminder);

    const lockBtn = document.getElementById('lockBtn');
    if (lockBtn) {
      lockBtn.addEventListener('click', toggleLock);
    }

    const tagBtn = document.getElementById('tagBtn');
    if (tagBtn) {
      tagBtn.addEventListener('click', () => {
        showInputDialog('Add tag:').then(newTag => {
          if (newTag && newTag.trim()) {
            const tags = note.tags || [];
            if (!tags.includes(newTag.trim())) {
              tags.push(newTag.trim());
              updateNote({ tags });
              updateMeta();
            }
          }
        });
      });
    }

    const folderBtn = document.getElementById('folderBtn');
    if (folderBtn) {
      folderBtn.addEventListener('click', () => {
        showInputDialog('Folder:', note.folder || 'default').then(folder => {
          if (folder !== null) {
            updateNote({ folder });
            updateMeta();
          }
        });
      });
    }

    const voiceBtn = document.getElementById('voiceBtn');
    if (voiceBtn) {
      voiceBtn.addEventListener('click', () => startVoiceRecording(voiceBtn));
    }

    renderVoiceNotes();
    updateMeta();

    window.addEventListener('storage', syncFromStorage);
    window.electronAPI?.onRefreshNotes?.(syncFromStorage);
  }

  function toggleLock() {
    if (note.locked) {
      showInputDialog('Enter password to unlock:').then(pwd => {
        if (pwd === note.password) {
          updateNote({ locked: false, password: null });
          updateMeta();
        } else if (pwd !== null) {
          alert('Incorrect password');
        }
      });
    } else {
      showInputDialog('Set a password to lock this note:').then(pwd => {
        if (pwd && pwd.trim()) {
          updateNote({ locked: true, password: pwd.trim() });
          updateMeta();
        }
      });
    }
  }

  function syncFromStorage() {
    notes = readNotes();
    const latest = getNote();
    if (!latest) return;
    note = latest;
    els.title.value = note.title || '';
    els.body.value = note.content || '';
    autoResize(els.body);
    renderPalette();
    updateMeta();
  }

  function showInputDialog(message, defaultValue = '') {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.right = '0';
      overlay.style.bottom = '0';
      overlay.style.background = 'rgba(0, 0, 0, 0.6)';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.style.zIndex = '10000';

      const dialog = document.createElement('div');
      dialog.style.background = 'var(--bg-2)';
      dialog.style.padding = '24px';
      dialog.style.borderRadius = 'var(--radius)';
      dialog.style.border = '1px solid rgba(255,255,255,0.1)';
      dialog.style.minWidth = '320px';
      dialog.style.boxShadow = 'var(--shadow)';

      const label = document.createElement('p');
      label.style.margin = '0 0 16px 0';
      label.style.color = 'var(--text)';
      label.textContent = message;

      const input = document.createElement('input');
      input.type = 'text';
      input.value = defaultValue;
      input.style.width = '100%';
      input.style.padding = '10px';
      input.style.border = '1px solid rgba(255,255,255,0.12)';
      input.style.background = 'rgba(0,0,0,0.25)';
      input.style.color = 'var(--text)';
      input.style.borderRadius = 'var(--radius-sm)';
      input.style.marginBottom = '16px';
      input.style.boxSizing = 'border-box';
      input.focus();

      const buttonContainer = document.createElement('div');
      buttonContainer.style.display = 'flex';
      buttonContainer.style.gap = '8px';
      buttonContainer.style.justifyContent = 'flex-end';

      const okBtn = document.createElement('button');
      okBtn.textContent = 'OK';
      okBtn.className = 'primary';
      okBtn.addEventListener('click', () => {
        overlay.remove();
        resolve(input.value);
      });

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.className = 'ghost';
      cancelBtn.addEventListener('click', () => {
        overlay.remove();
        resolve(null);
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          overlay.remove();
          resolve(input.value);
        } else if (e.key === 'Escape') {
          overlay.remove();
          resolve(null);
        }
      });

      buttonContainer.append(okBtn, cancelBtn);
      dialog.append(label, input, buttonContainer);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
    });
  }

  function setReminder() {
    openReminderDialog();
  }

  function parseReminder(text) {
    const cleaned = text.replace('T', ' ').replace(/\s+/, ' ');
    const ts = Date.parse(cleaned.replace(' ', 'T'));
    if (Number.isNaN(ts)) return null;
    return new Date(ts);
  }

  function openReminderDialog() {
    const overlay = document.createElement('div');
    overlay.className = 'reminder-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'reminder-dialog';

    const title = document.createElement('h3');
    title.textContent = 'Reminder';

    const input = document.createElement('input');
    input.type = 'datetime-local';
    if (note.reminderAt) {
      input.value = toDatetimeLocal(note.reminderAt);
    }

    const recurrenceLabel = document.createElement('label');
    recurrenceLabel.style.display = 'block';
    recurrenceLabel.style.marginBottom = '12px';
    recurrenceLabel.style.fontSize = '13px';
    recurrenceLabel.style.color = 'var(--muted)';
    recurrenceLabel.textContent = 'Recurrence:';

    const recurrenceSelect = document.createElement('select');
    recurrenceSelect.style.width = '100%';
    recurrenceSelect.style.padding = '8px 10px';
    recurrenceSelect.style.marginBottom = '16px';
    recurrenceSelect.style.borderRadius = 'var(--radius-sm)';
    recurrenceSelect.style.border = '1px solid rgba(255,255,255,0.12)';
    recurrenceSelect.style.background = 'rgba(0,0,0,0.25)';
    recurrenceSelect.style.color = 'var(--text)';
    recurrenceSelect.innerHTML = `
      <option value="">None</option>
      <option value="daily">Daily</option>
      <option value="weekly">Weekly</option>
      <option value="monthly">Monthly</option>
    `;
    if (note.recurrence) recurrenceSelect.value = note.recurrence;

    const actions = document.createElement('div');
    actions.className = 'reminder-actions';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'primary';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => {
      if (!input.value) {
        updateNote({ reminderAt: null, recurrence: null });
        overlay.remove();
        return;
      }
      const parsed = parseReminder(input.value.replace('T', ' '));
      if (!parsed) {
        alert('Invalid date');
        return;
      }
      updateNote({ reminderAt: parsed.getTime(), recurrence: recurrenceSelect.value || null });
      updateMeta();
      overlay.remove();
    });

    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', () => {
      updateNote({ reminderAt: null, recurrence: null });
      updateMeta();
      overlay.remove();
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => overlay.remove());

    actions.append(saveBtn, clearBtn, cancelBtn);
    dialog.append(title, input, recurrenceLabel, recurrenceSelect, actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  }

  function toDatetimeLocal(ts) {
    const d = new Date(ts);
    const pad = (n) => `${n}`.padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  let voiceRecorder = null;
  let voiceChunks = [];

  function startVoiceRecording(btn) {
    if (voiceRecorder) {
      voiceRecorder.stop();
      voiceRecorder = null;
      btn.textContent = '🎙️ Record';
      return;
    }

    voiceChunks = [];
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      voiceRecorder = new MediaRecorder(stream);
      voiceRecorder.ondataavailable = (e) => voiceChunks.push(e.data);
      voiceRecorder.onstop = () => {
        const blob = new Blob(voiceChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          const audioData = reader.result;
          const duration = Math.round(blob.size / 16000);
          
          if (!note.voiceNotes) note.voiceNotes = [];
          note.voiceNotes.push({ data: audioData, duration });
          updateNote({ voiceNotes: note.voiceNotes });
          renderVoiceNotes();
          voiceRecorder = null;
        };
      };
      voiceRecorder.start();
      btn.textContent = '⏹️ Stop';
    }).catch(err => {
      alert('Microphone access denied: ' + err.message);
    });
  }

  function renderVoiceNotes() {
    const container = document.getElementById('voiceNotesContainer');
    if (!container) return;
    
    container.innerHTML = '';
    if (!note.voiceNotes || note.voiceNotes.length === 0) return;

    const voiceList = document.createElement('div');
    voiceList.style.marginTop = '12px';
    voiceList.style.paddingTop = '12px';
    voiceList.style.borderTop = '1px solid rgba(255,255,255,0.1)';
    voiceList.style.display = 'flex';
    voiceList.style.flexDirection = 'column';
    voiceList.style.gap = '6px';

    note.voiceNotes.forEach((voiceNote, idx) => {
      const voiceItem = document.createElement('div');
      voiceItem.style.display = 'flex';
      voiceItem.style.alignItems = 'center';
      voiceItem.style.gap = '6px';
      voiceItem.style.fontSize = '13px';

      const playBtn = document.createElement('button');
      playBtn.className = 'chip';
      playBtn.textContent = '▶️ Play';
      playBtn.addEventListener('click', () => {
        const audio = new Audio(voiceNote.data);
        audio.play();
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'chip danger';
      deleteBtn.textContent = '✕ Delete';
      deleteBtn.style.padding = '4px 8px';
      deleteBtn.style.fontSize = '12px';
      deleteBtn.addEventListener('click', () => {
        note.voiceNotes.splice(idx, 1);
        updateNote({ voiceNotes: note.voiceNotes });
        renderVoiceNotes();
      });

      const label = document.createElement('span');
      label.textContent = `Voice #${idx + 1}`;

      voiceItem.append(playBtn, label, deleteBtn);
      voiceList.appendChild(voiceItem);
    });

    container.appendChild(voiceList);
  }

  bindEvents();
})();
