(() => {
  const STORAGE_KEY = 'sticky-notes:v1';
  const palette = ['#f5b81b', '#1ad1a5', '#38bdf8', '#f472b6', '#fb7185', '#a3e635', '#f97316'];
  const state = { search: '', sort: 'updated', pinnedOnly: false, compact: false, selectedNotes: new Set(), bulkMode: false };
  let notes = readNotes();
  let reminderPortal = null;
  let templatePortal = null;
  const sentReminders = new Set();
  const templates = {
    blank: { title: 'Untitled', content: '' },
    todo: { title: 'Todo List', content: '- [ ] Item 1\n- [ ] Item 2\n- [ ] Item 3' },
    meeting: { title: 'Meeting Notes', content: 'Date: \nAttendees: \nTopics:\n- \nAction Items:\n- ' },
    shopping: { title: 'Shopping List', content: '- \n- \n- \n- \n- ' }
  };

  const els = {
    notesContainer: document.getElementById('notesContainer'),
    emptyState: document.getElementById('emptyState'),
    newNoteBtn: document.getElementById('newNoteBtn'),
    emptyNew: document.getElementById('emptyNew'),
    searchInput: document.getElementById('searchInput'),
    pinToggle: document.getElementById('pinToggle'),
    compactToggle: document.getElementById('compactToggle'),
    sortChips: document.querySelectorAll('.chip-row .chip'),
    summaryText: document.getElementById('summaryText')
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

  function persistNotes(skipRender = false) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    window.electronAPI?.broadcastRefresh?.();
    if (!skipRender) renderNotes();
  }

  function createNote() {
    showTemplateSelector();
  }

  function createNoteFromTemplate(templateKey) {
    const template = templates[templateKey] || templates.blank;
    const id = self.crypto?.randomUUID ? crypto.randomUUID() : `note-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const color = palette[Math.floor(Math.random() * palette.length)];
    const now = Date.now();
    const newNote = {
      id,
      title: template.title,
      content: template.content,
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
    };
    notes.unshift(newNote);
    persistNotes();
    renderNotes();
  }

  function updateNote(id, fields, options = { refresh: false }) {
    const idx = notes.findIndex((n) => n.id === id);
    if (idx === -1) return;
    notes[idx] = { ...notes[idx], ...fields, updatedAt: Date.now() };
    persistNotes(true);
    if (options.refresh) renderNotes();
  }

  function deleteNote(id) {
    notes = notes.filter((n) => n.id !== id);
    persistNotes();
  }

  function duplicateNote(id) {
    const original = notes.find((n) => n.id === id);
    if (!original) return;
    const copy = {
      ...original,
      id: self.crypto?.randomUUID ? crypto.randomUUID() : `note-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: `${original.title || 'Untitled'} (copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    notes.unshift(copy);
    persistNotes();
  }

  function applyCardColor(card, color) {
    card.style.background = `linear-gradient(155deg, ${hexToRgba(color, 0.22)}, rgba(255, 255, 255, 0.04))`;
    card.style.borderColor = hexToRgba(color, 0.55);
  }

  function hexToRgba(hex, alpha) {
    const stripped = hex.replace('#', '');
    const bigint = parseInt(stripped, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function noteMatchesSearch(note) {
    const query = state.search.trim().toLowerCase();
    if (!query) return true;
    
    if (query.startsWith('tag:')) {
      const tagToFind = query.substring(4).trim();
      return note.tags && note.tags.some(t => t.toLowerCase().includes(tagToFind));
    }
    
    if (query.startsWith('folder:')) {
      const folderToFind = query.substring(7).trim();
      return (note.folder || '').toLowerCase().includes(folderToFind);
    }
    
    return [note.title, note.content, note.color].some((val) => (val || '').toLowerCase().includes(query));
  }

  function sortNotes(list) {
    const sorted = [...list];
    if (state.sort === 'created') {
      sorted.sort((a, b) => b.createdAt - a.createdAt);
    } else if (state.sort === 'title') {
      sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else {
      sorted.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    sorted.sort((a, b) => Number(b.pinned) - Number(a.pinned));
    return sorted;
  }

  function renderNotes() {
    const filtered = notes.filter((n) => noteMatchesSearch(n)).filter((n) => (state.pinnedOnly ? n.pinned : true));
    const ordered = sortNotes(filtered);

    els.notesContainer.innerHTML = '';
    ordered.forEach((note) => {
      const card = buildNoteCard(note);
      els.notesContainer.appendChild(card);
    });

    const total = notes.length;
    const visible = ordered.length;
    els.summaryText.textContent = `${visible} visible • ${total} total`;
    const nextReminder = computeNextReminder(notes);
    if (nextReminder) {
      const dt = new Date(nextReminder.reminderAt);
      els.summaryText.textContent += ` • Next reminder: ${dt.toLocaleString()}`;
    }
    els.emptyState.style.display = visible === 0 ? 'block' : 'none';
  }

  function buildNoteCard(note) {
    const card = document.createElement('article');
    card.className = 'note-card';
    card.dataset.id = note.id;
    applyCardColor(card, note.color);

    const header = document.createElement('div');
    header.className = 'note-header';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.style.width = '18px';
    checkbox.style.height = '18px';
    checkbox.style.cursor = 'pointer';
    checkbox.checked = state.selectedNotes.has(note.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        state.selectedNotes.add(note.id);
      } else {
        state.selectedNotes.delete(note.id);
      }
      updateBulkUI();
    });

    const titleInput = document.createElement('input');
    titleInput.className = 'note-title-input';
    titleInput.value = note.title || '';
    titleInput.placeholder = 'Untitled';
    titleInput.addEventListener('input', () => {
      updateNote(note.id, { title: titleInput.value }, { refresh: false });
    });

    const lockIcon = document.createElement('span');
    lockIcon.style.fontSize = '16px';
    lockIcon.style.marginRight = '4px';
    lockIcon.textContent = note.locked ? '🔒' : '';

    header.append(checkbox, lockIcon, titleInput);

    const actionBar = document.createElement('div');
    actionBar.className = 'tag-row';
    
    const pinBtn = document.createElement('button');
    pinBtn.className = 'small-btn';
    pinBtn.textContent = note.pinned ? '📌 Pinned' : 'Pin';
    pinBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        console.log('Pin button clicked for note:', note.id, 'Currently pinned:', note.pinned);
        updateNote(note.id, { pinned: !note.pinned }, { refresh: true });
      } catch (err) {
        console.error('Error in pin click:', err);
      }
    });

    const popBtn = document.createElement('button');
    popBtn.className = 'small-btn';
    popBtn.textContent = 'Pop out';
    popBtn.addEventListener('click', () => openPopOut(note.id));

    const remindBtn = document.createElement('button');
    remindBtn.className = 'small-btn';
    remindBtn.textContent = note.reminderAt ? 'Edit reminder' : 'Remind';
    remindBtn.addEventListener('click', () => setReminder(note.id));

    const lockBtn = document.createElement('button');
    lockBtn.className = 'small-btn';
    lockBtn.textContent = note.locked ? 'Unlock' : 'Lock';
    lockBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('Lock clicked for note:', note.id);
      toggleNoteLock(note.id);
    });

    actionBar.append(pinBtn, popBtn, remindBtn, lockBtn);

    const body = document.createElement('textarea');
    body.className = 'note-body-input';
    body.value = note.content || '';
    autoResize(body);
    body.addEventListener('input', () => {
      autoResize(body);
      updateNote(note.id, { content: body.value }, { refresh: false });
    });

    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'tag-row';
    tagsContainer.style.flexWrap = 'wrap';
    if (note.tags && note.tags.length > 0) {
      note.tags.forEach(tag => {
        const tagChip = document.createElement('span');
        tagChip.className = 'chip';
        tagChip.textContent = `#${tag}`;
        tagChip.style.fontSize = '12px';
        tagChip.style.padding = '3px 8px';
        tagChip.style.cursor = 'pointer';
        tagChip.addEventListener('click', () => {
          state.search = `tag:${tag}`;
          els.searchInput.value = state.search;
          renderNotes();
        });
        tagsContainer.appendChild(tagChip);
      });
    }

    const folderContainer = document.createElement('div');
    folderContainer.style.fontSize = '12px';
    folderContainer.style.color = 'var(--muted)';
    folderContainer.style.padding = '4px 0';
    folderContainer.textContent = `📁 ${note.folder || 'default'}`;

    const footer = document.createElement('div');
    footer.className = 'note-footer';

    const swatches = document.createElement('div');
    swatches.className = 'tag-row';
    palette.forEach((color) => {
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch';
      swatch.style.background = color;
      if (color === note.color) swatch.style.boxShadow = '0 0 0 2px rgba(255,255,255,0.6)';
      swatch.addEventListener('click', () => {
        updateNote(note.id, { color }, { refresh: false });
        applyCardColor(card, color);
      });
      swatches.appendChild(swatch);
    });

    const actions = document.createElement('div');
    actions.className = 'tag-row';

    const duplicateBtn = document.createElement('button');
    duplicateBtn.className = 'small-btn';
    duplicateBtn.textContent = 'Duplicate';
    duplicateBtn.addEventListener('click', () => duplicateNote(note.id));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'small-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => deleteNote(note.id));

    actions.append(duplicateBtn, deleteBtn);

    footer.append(swatches, actions);

    const meta = document.createElement('p');
    meta.className = 'meta';
    meta.textContent = formatMeta(note);

    card.addEventListener('dblclick', () => openPopOut(note.id));

    if (note.reminderAt) {
      const now = Date.now();
      if (note.reminderAt < now) {
        card.classList.add('overdue');
      } else if (note.reminderAt - now < 60 * 60 * 1000) {
        card.classList.add('due-soon');
      }
    }


    const voiceSection = document.createElement('div');
    voiceSection.style.marginTop = '12px';
    voiceSection.style.paddingTop = '12px';
    voiceSection.style.borderTop = '1px solid rgba(255,255,255,0.1)';
    
    const voiceBtn = document.createElement('button');
    voiceBtn.className = 'small-btn';
    voiceBtn.textContent = '🎙️ Record';
    voiceBtn.addEventListener('click', () => startVoiceRecording(note.id, voiceBtn));
    voiceSection.appendChild(voiceBtn);


    if (note.voiceNotes && note.voiceNotes.length > 0) {
      const voiceList = document.createElement('div');
      voiceList.style.marginTop = '8px';
      voiceList.style.display = 'flex';
      voiceList.style.flexDirection = 'column';
      voiceList.style.gap = '6px';
      
      note.voiceNotes.forEach((voiceNote, idx) => {
        const voiceItem = document.createElement('div');
        voiceItem.style.display = 'flex';
        voiceItem.style.alignItems = 'center';
        voiceItem.style.gap = '6px';
        voiceItem.style.fontSize = '12px';
        
        const playBtn = document.createElement('button');
        playBtn.className = 'small-btn';
        playBtn.textContent = '▶️';
        playBtn.style.padding = '4px 8px';
        playBtn.style.fontSize = '12px';
        playBtn.addEventListener('click', () => playVoiceNote(voiceNote.data));
        
        const deleteVoiceBtn = document.createElement('button');
        deleteVoiceBtn.className = 'small-btn';
        deleteVoiceBtn.textContent = '✕';
        deleteVoiceBtn.style.padding = '4px 8px';
        deleteVoiceBtn.style.fontSize = '12px';
        deleteVoiceBtn.addEventListener('click', () => {
          note.voiceNotes.splice(idx, 1);
          updateNote(note.id, { voiceNotes: note.voiceNotes }, { refresh: true });
        });
        
        const duration = document.createElement('span');
        duration.textContent = `Voice #${idx + 1} (${voiceNote.duration}s)`;
        
        voiceItem.append(playBtn, duration, deleteVoiceBtn);
        voiceList.appendChild(voiceItem);
      });
      voiceSection.appendChild(voiceList);
    }

    card.append(header, actionBar, body, tagsContainer, folderContainer, voiceSection, footer, meta);
    return card;
  }

  function formatMeta(note) {
    const updated = new Date(note.updatedAt);
    const created = new Date(note.createdAt);
    const parts = [
      `Updated ${updated.toLocaleString()}`,
      `Created ${created.toLocaleDateString()}`
    ];
    if (note.pinned) parts.push('Pinned');
    if (note.locked) parts.push('🔒 Locked');
    if (note.folder && note.folder !== 'default') parts.push(`📁 ${note.folder}`);
    if (note.reminderAt) parts.push(formatReminder(note.reminderAt));
    return parts.join(' • ');
  }

  function setReminder(noteId) {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    openReminderDialog(noteId, note.reminderAt);
  }

  function parseReminder(text) {
    const cleaned = text.replace('T', ' ').replace(/\s+/, ' ');
    const ts = Date.parse(cleaned.replace(' ', 'T'));
    if (Number.isNaN(ts)) return null;
    return new Date(ts);
  }

  function formatReminder(timestamp) {
    const dt = new Date(timestamp);
    return `Reminder ${dt.toLocaleString()}`;
  }

  function toDatetimeLocal(ts) {
    const d = new Date(ts);
    const pad = (n) => `${n}`.padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function showTemplateSelector() {
    if (templatePortal) templatePortal.remove();

    const overlay = document.createElement('div');
    overlay.className = 'reminder-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'reminder-dialog';
    dialog.style.maxWidth = '350px';

    const title = document.createElement('h3');
    title.textContent = 'Choose a Template';

    const templateGrid = document.createElement('div');
    templateGrid.style.display = 'grid';
    templateGrid.style.gridTemplateColumns = '1fr 1fr';
    templateGrid.style.gap = '12px';
    templateGrid.style.marginBottom = '16px';

    const templateOptions = [
      { key: 'blank', name: 'Blank', icon: '📝' },
      { key: 'todo', name: 'Todo', icon: '✓' },
      { key: 'meeting', name: 'Meeting', icon: '👥' },
      { key: 'shopping', name: 'Shopping', icon: '🛒' }
    ];

    templateOptions.forEach(tmpl => {
      const btn = document.createElement('button');
      btn.style.padding = '12px';
      btn.style.borderRadius = 'var(--radius-sm)';
      btn.style.border = '1px solid rgba(255,255,255,0.12)';
      btn.style.background = 'rgba(0,0,0,0.25)';
      btn.style.color = 'var(--text)';
      btn.style.cursor = 'pointer';
      btn.style.fontSize = '14px';
      btn.style.fontWeight = '500';
      btn.style.transition = 'all 200ms ease';
      btn.innerHTML = `<div style="font-size: 24px; margin-bottom: 6px;">${tmpl.icon}</div>${tmpl.name}`;
      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(0,0,0,0.4)';
        btn.style.borderColor = 'var(--accent)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'rgba(0,0,0,0.25)';
        btn.style.borderColor = 'rgba(255,255,255,0.12)';
      });
      btn.addEventListener('click', () => {
        createNoteFromTemplate(tmpl.key);
        overlay.remove();
      });
      templateGrid.appendChild(btn);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'ghost';
    cancelBtn.style.width = '100%';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => overlay.remove());

    dialog.append(title, templateGrid, cancelBtn);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    templatePortal = overlay;
  }

  function openReminderDialog(noteId, reminderAt) {
    if (reminderPortal) reminderPortal.remove();

    const overlay = document.createElement('div');
    overlay.className = 'reminder-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'reminder-dialog';

    const title = document.createElement('h3');
    title.textContent = 'Reminder';

    const input = document.createElement('input');
    input.type = 'datetime-local';
    if (reminderAt) input.value = toDatetimeLocal(reminderAt);

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

    const actions = document.createElement('div');
    actions.className = 'reminder-actions';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'primary';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => {
      if (!input.value) {
        updateNote(noteId, { reminderAt: null, recurrence: null }, { refresh: true });
        overlay.remove();
        return;
      }
      const parsed = parseReminder(input.value.replace('T', ' '));
      if (!parsed) {
        alert('Invalid date');
        return;
      }
      updateNote(noteId, { reminderAt: parsed.getTime(), recurrence: recurrenceSelect.value || null }, { refresh: true });
      overlay.remove();
    });

    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', () => {
      updateNote(noteId, { reminderAt: null, recurrence: null }, { refresh: true });
      overlay.remove();
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => overlay.remove());

    actions.append(saveBtn, clearBtn, cancelBtn);
    dialog.append(title, input, recurrenceLabel, recurrenceSelect, actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    reminderPortal = overlay;
  }

  function computeNextReminder(list) {
    const upcoming = list
      .filter((n) => n.reminderAt && n.reminderAt > Date.now())
      .sort((a, b) => a.reminderAt - b.reminderAt);
    return upcoming[0] || null;
  }

  function openPopOut(id) {
    window.electronAPI?.openNoteWindow?.(id);
  }

  function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  function setSort(sortKey) {
    state.sort = sortKey;
    els.sortChips.forEach((chip) => chip.classList.toggle('active', chip.dataset.sort === sortKey));
    renderNotes();
  }

  function setupEvents() {
    els.newNoteBtn.addEventListener('click', createNote);
    els.emptyNew.addEventListener('click', createNote);
    els.searchInput.addEventListener('input', debounce((e) => {
      state.search = e.target.value;
      renderNotes();
    }, 120));

    els.pinToggle.addEventListener('click', () => {
      state.pinnedOnly = !state.pinnedOnly;
      els.pinToggle.classList.toggle('primary', state.pinnedOnly);
      els.pinToggle.textContent = state.pinnedOnly ? 'Pinned only' : 'Pin filter';
      renderNotes();
    });

    els.compactToggle.addEventListener('click', () => {
      state.compact = !state.compact;
      document.body.classList.toggle('compact', state.compact);
    });

    els.sortChips.forEach((chip) => {
      chip.addEventListener('click', () => setSort(chip.dataset.sort));
    });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        createNote();
      }
    });

    window.addEventListener('storage', syncFromStorage);
    window.electronAPI?.onRefreshNotes?.(syncFromStorage);
  }

  function syncFromStorage() {
    notes = readNotes();
    renderNotes();
  }

  function debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
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

  renderNotes();
  setupEvents();
  startReminderChecker();

  function toggleNoteLock(noteId) {
    try {
      console.log('toggleNoteLock called with noteId:', noteId);
      const note = notes.find(n => n.id === noteId);
      console.log('Found note:', note);
      if (!note) {
        console.warn('Note not found:', noteId);
        return;
      }
      
      if (note.locked) {
        showInputDialog('Enter password to unlock:').then(pwd => {
          if (pwd === note.password) {
            updateNote(noteId, { locked: false, password: null }, { refresh: true });
          } else if (pwd !== null) {
            alert('Incorrect password');
          }
        });
      } else {
        showInputDialog('Set a password to lock this note:').then(pwd => {
          if (pwd && pwd.trim()) {
            updateNote(noteId, { locked: true, password: pwd.trim() }, { refresh: true });
          }
        });
      }
    } catch (err) {
      console.error('Error in toggleNoteLock:', err);
    }
  }

  function updateBulkUI() {
    let bulkBar = document.getElementById('bulkActionBar');
    if (state.selectedNotes.size > 0 && !bulkBar) {
      bulkBar = document.createElement('div');
      bulkBar.id = 'bulkActionBar';
      bulkBar.style.position = 'sticky';
      bulkBar.style.top = '0';
      bulkBar.style.zIndex = '100';
      bulkBar.style.background = 'rgba(0,0,0,0.4)';
      bulkBar.style.padding = '12px';
      bulkBar.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
      bulkBar.style.display = 'flex';
      bulkBar.style.gap = '8px';
      bulkBar.style.alignItems = 'center';

      const count = document.createElement('span');
      count.id = 'bulkCount';
      count.style.color = 'var(--muted)';
      count.textContent = `${state.selectedNotes.size} selected`;
      bulkBar.appendChild(count);

      const deleteAllBtn = document.createElement('button');
      deleteAllBtn.className = 'small-btn';
      deleteAllBtn.textContent = 'Delete All';
      deleteAllBtn.addEventListener('click', () => {
        if (confirm(`Delete ${state.selectedNotes.size} notes?`)) {
          state.selectedNotes.forEach(id => deleteNote(id));
          state.selectedNotes.clear();
          bulkBar.remove();
          renderNotes();
        }
      });
      bulkBar.appendChild(deleteAllBtn);

      const tagAllBtn = document.createElement('button');
      tagAllBtn.className = 'small-btn';
      tagAllBtn.textContent = 'Tag All';
      tagAllBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          console.log('Tag All clicked, selected:', state.selectedNotes.size);
          showInputDialog('Add tag to selected notes:').then(newTag => {
            if (newTag && newTag.trim()) {
              state.selectedNotes.forEach(id => {
                const note = notes.find(n => n.id === id);
                if (note) {
                  if (!note.tags) note.tags = [];
                  if (!note.tags.includes(newTag.trim())) {
                    note.tags.push(newTag.trim());
                  }
                  updateNote(id, { tags: note.tags }, { refresh: false });
                }
              });
              persistNotes();
              state.selectedNotes.clear();
              renderNotes();
            }
          });
        } catch (err) {
          console.error('Error in tag all:', err);
        }
      });
      bulkBar.appendChild(tagAllBtn);

      const moveBtn = document.createElement('button');
      moveBtn.className = 'small-btn';
      moveBtn.textContent = 'Move Folder';
      moveBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          console.log('Move Folder clicked, selected:', state.selectedNotes.size);
          showInputDialog('Move to folder:', 'default').then(folder => {
            if (folder !== null) {
              state.selectedNotes.forEach(id => {
                updateNote(id, { folder }, { refresh: false });
              });
              persistNotes();
              state.selectedNotes.clear();
              renderNotes();
            }
          });
        } catch (err) {
          console.error('Error in move folder:', err);
        }
      });
      bulkBar.appendChild(moveBtn);

      const clearBtn = document.createElement('button');
      clearBtn.className = 'ghost';
      clearBtn.textContent = 'Clear';
      clearBtn.addEventListener('click', () => {
        state.selectedNotes.clear();
        bulkBar.remove();
        renderNotes();
      });
      bulkBar.appendChild(clearBtn);

      document.body.insertBefore(bulkBar, els.notesContainer.parentElement);
    } else if (state.selectedNotes.size === 0 && bulkBar) {
      bulkBar.remove();
    } else if (bulkBar) {
      document.getElementById('bulkCount').textContent = `${state.selectedNotes.size} selected`;
    }
  }

  let voiceRecorder = null;
  let voiceChunks = [];
  let recordingNoteId = null;

  function startVoiceRecording(noteId, btn) {
    if (voiceRecorder) {
      voiceRecorder.stop();
      voiceRecorder = null;
      btn.textContent = '🎙️ Record';
      return;
    }

    recordingNoteId = noteId;
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
          
          const note = notes.find(n => n.id === recordingNoteId);
          if (note) {
            if (!note.voiceNotes) note.voiceNotes = [];
            note.voiceNotes.push({ data: audioData, duration });
            updateNote(recordingNoteId, { voiceNotes: note.voiceNotes }, { refresh: true });
          }
          voiceRecorder = null;
          recordingNoteId = null;
        };
      };
      voiceRecorder.start();
      btn.textContent = '⏹️ Stop';
    }).catch(err => {
      alert('Microphone access denied: ' + err.message);
    });
  }

  function playVoiceNote(audioData) {
    const audio = new Audio(audioData);
    audio.play();
  }

  function startReminderChecker() {
    setInterval(() => {
      const now = Date.now();
      notes.forEach((note) => {
        if (!note.reminderAt || sentReminders.has(note.id)) return;
        if (note.reminderAt <= now) {
          sentReminders.add(note.id);
          const dt = new Date(note.reminderAt);
          window.electronAPI?.sendNotification?.('Reminder', {
            body: `${note.title || 'Untitled'} - ${dt.toLocaleString()}`,
            icon: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAQAAADlabXuAAAACXBIWXMAAAsSAAALEgHS3X78AAAAIGNIUk0AAHolAACAgwAA+f8AAIDpAAB1MAAA6mAAADqYAAAXcJy6UTwAAAG5SURBVHja7dwxAQAwEAOh+jedDhQIeYvmq7oBAAAAAAAAAAAAAAAAAMB/7Ln3XgAAAAAAAAAAAAAAAAAAAMA//gEGAD8DVv/bAAAAAElFTkSuQmCC'
          });
        }
      });
    }, 60000);
  }
})();
