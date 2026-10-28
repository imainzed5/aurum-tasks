// Everything that touches the DOM. Builds the page from state; holds no state
// of its own beyond which task or note an edit dialog is open for.

import {
  formatDue, formatShortDate, fromISODate, daysFromToday, greeting, formatLongDate, formatRelative, truncate, stripInlineMarkdown,
} from './utils.js';
import { renderMarkdown } from './markdown.js';

const ICON_CALENDAR =
  '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>';
const ICON_NOTE =
  '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>';
const ICON_TASK =
  '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4.5"/><path d="m8.5 12.2 2.4 2.4 4.6-5"/></svg>';
const PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };

const byId = (id) => document.getElementById(id);

let cached = null;
function els() {
  if (cached) return cached;
  cached = {
    viewLinks: [...document.querySelectorAll('.view-link')],
    tasksView: byId('tasks-view'),
    notesView: byId('notes-view'),
    todayLabel: byId('today-label'),
    greeting: byId('greeting'),
    summaryLine: byId('summary-line'),
    statOverdue: byId('stat-overdue'),
    statOverdueWrap: byId('stat-overdue-wrap'),
    statToday: byId('stat-today'),
    statHigh: byId('stat-high'),
    ring: byId('ring'),
    ringFill: byId('ring-fill'),
    ringPct: byId('ring-pct'),
    ringSub: byId('ring-sub'),
    tabs: [...document.querySelectorAll('.tab')],
    sort: byId('sort'),
    search: byId('search'),
    tagRow: byId('tag-row'),
    sampleNote: byId('sample-note'),
    list: byId('task-list'),
    tpl: byId('task-tpl'),
    empty: byId('empty'),
    emptyTitle: byId('empty-title'),
    emptyText: byId('empty-text'),
    leftCount: byId('left-count'),
    clearDone: byId('clear-done'),
    noteSort: byId('note-sort'),
    noteSearch: byId('note-search'),
    noteTagRow: byId('note-tag-row'),
    noteSampleNote: byId('note-sample-note'),
    noteGrid: byId('note-grid'),
    noteTpl: byId('note-tpl'),
    noteEmpty: byId('note-empty'),
    noteEmptyTitle: byId('note-empty-title'),
    noteEmptyText: byId('note-empty-text'),
    noteCount: byId('note-count'),
    toast: byId('toast'),
    toastMsg: byId('toast-msg'),
    toastAction: byId('toast-action'),
  };
  return cached;
}

/* ---------- Main render ---------- */

export function render({ state, visible, stats, tagCounts, activeTag, notes }) {
  const e = els();
  const focus = rememberFocus(e);

  renderView(e, state.view);
  renderSummary(e, stats);
  renderControls(e, state, stats);
  renderTagChips(e.tagRow, tagCounts, activeTag);
  e.sampleNote.hidden = state.samplesDismissed || !state.tasks.some((t) => t.sample);
  renderList(e, state, visible, notes.byTask);
  e.leftCount.textContent = `${stats.open} ${stats.open === 1 ? 'task' : 'tasks'} left`;
  e.clearDone.disabled = stats.done === 0;
  renderNotes(e, state, notes);
  refreshNoteEditor(state);

  restoreFocus(e, focus);
}

function renderView(e, view) {
  e.tasksView.hidden = view !== 'tasks';
  e.notesView.hidden = view !== 'notes';
  for (const link of e.viewLinks) {
    if (link.dataset.view === view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  document.title = view === 'notes' ? 'Notes · Aurum Tasks' : 'Aurum Tasks';
}

function renderSummary(e, s) {
  e.todayLabel.textContent = formatLongDate();
  e.greeting.textContent = greeting();
  e.summaryLine.textContent = summarySentence(s);

  e.statOverdue.textContent = s.overdue;
  e.statOverdueWrap.classList.toggle('is-alert', s.overdue > 0);
  e.statToday.textContent = s.dueToday;
  e.statHigh.textContent = s.high;

  const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
  e.ringFill.style.strokeDashoffset = String(100 - pct);
  e.ringFill.style.opacity = pct === 0 ? '0' : '1';
  e.ringPct.textContent = String(pct);
  e.ringSub.textContent = `${s.done} of ${s.total} done`;
  e.ring.setAttribute('aria-label', `${pct}% complete, ${s.done} of ${s.total} tasks done`);
}

function summarySentence(s) {
  if (s.total === 0) return 'Your list is empty. Add the first thing you want to get done.';
  if (s.open === 0) return 'Everything on your list is done. Nice work.';
  const open = `You have ${s.open} open ${s.open === 1 ? 'task' : 'tasks'}.`;
  if (s.overdue) return `${open} ${s.overdue} ${s.overdue === 1 ? 'is' : 'are'} overdue, so start there.`;
  if (s.dueToday) return `${open} ${s.dueToday} ${s.dueToday === 1 ? 'is' : 'are'} due today.`;
  return `${open} Nothing is due today.`;
}

function renderControls(e, state, s) {
  const counts = { all: s.total, active: s.open, done: s.done };
  for (const tab of e.tabs) {
    const filter = tab.dataset.filter;
    tab.setAttribute('aria-pressed', String(state.filter === filter));
    tab.querySelector('.tab-count').textContent = counts[filter];
  }
  e.sort.value = state.sort;
  syncSearch(e.search, state.search);
  e.noteSort.value = state.noteSort;
  syncSearch(e.noteSearch, state.noteSearch);
}

function syncSearch(input, value) {
  if (document.activeElement !== input && input.value !== value) input.value = value;
}

function renderTagChips(row, tagCounts, activeTag) {
  row.hidden = tagCounts.length === 0;
  const chips = [chip('All tags', '', null, activeTag === null)];
  for (const [tag, count] of tagCounts) chips.push(chip(`#${tag}`, tag, count, activeTag === tag));
  row.replaceChildren(...chips);
}

function chip(label, tag, count, pressed) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'chip';
  button.dataset.tag = tag;
  button.setAttribute('aria-pressed', String(pressed));
  button.append(label);
  if (count !== null) {
    const span = document.createElement('span');
    span.className = 'chip-count';
    span.textContent = count;
    button.append(span);
  }
  return button;
}

/* ---------- Tasks ---------- */

function renderList(e, state, visible, notesByTask) {
  const manual = state.sort === 'manual';
  const rows = visible.map((task) => taskRow(e.tpl, task, manual, state.lastAddedId, notesByTask.get(task.id) || []));
  e.list.replaceChildren(...rows);
  e.list.hidden = visible.length === 0;
  e.empty.hidden = visible.length > 0;
  if (!visible.length) {
    const [title, text] = emptyCopy(state);
    e.emptyTitle.textContent = title;
    e.emptyText.textContent = text;
  }
}

function taskRow(tpl, t, manual, newId, linkedNotes) {
  const li = tpl.content.firstElementChild.cloneNode(true);
  li.dataset.id = t.id;
  li.classList.toggle('is-done', t.done);
  if (t.id === newId) li.classList.add('is-new');

  const handle = li.querySelector('[data-role="handle"]');
  if (manual) {
    handle.setAttribute('aria-label', `Reorder “${t.title}”. Drag it, or press the up and down arrow keys.`);
    handle.title = 'Drag to reorder';
  } else {
    handle.setAttribute('aria-disabled', 'true');
    handle.setAttribute('aria-label', 'Reordering works in Manual order');
    handle.title = 'Switch sort to Manual order to reorder';
  }

  const check = li.querySelector('[data-role="check"]');
  check.checked = t.done;
  check.setAttribute('aria-label', t.title);

  li.querySelector('.task-title').textContent = t.title;
  const notes = li.querySelector('.task-notes');
  if (t.notes) notes.textContent = t.notes;
  else notes.remove();

  const meta = li.querySelector('.task-meta');
  const priority = pill(`pri pri-${t.priority}`, PRIORITY_LABEL[t.priority]);
  priority.insertAdjacentHTML('beforeend', '<span class="sr-only"> priority</span>');
  meta.append(priority);

  if (t.dueDate) {
    const diff = daysFromToday(t.dueDate);
    let tone = '';
    if (!t.done && diff < 0) tone = ' is-overdue';
    else if (!t.done && diff === 0) tone = ' is-today';
    const due = pill(`due${tone}`, t.done ? formatShortDate(t.dueDate) : formatDue(t.dueDate), ICON_CALENDAR);
    due.title = `Due ${fromISODate(t.dueDate).toLocaleDateString(undefined, { dateStyle: 'full' })}`;
    meta.append(due);
  }

  for (const tag of t.tags) meta.append(tagPill(tag));

  for (const note of linkedNotes) {
    const name = noteName(note);
    const button = pillButton('note-pill', truncate(name, 26), ICON_NOTE);
    button.dataset.note = note.id;
    button.dataset.role = 'note';
    button.title = `Open the note “${name}”`;
    button.setAttribute('aria-label', `Open the linked note “${name}”`);
    meta.append(button);
  }

  li.querySelector('[data-action="edit"]').setAttribute('aria-label', `Edit “${t.title}”`);
  li.querySelector('[data-action="delete"]').setAttribute('aria-label', `Delete “${t.title}”`);
  return li;
}

function pill(className, text, iconHTML) {
  const span = document.createElement('span');
  span.className = `pill ${className}`;
  if (iconHTML) span.insertAdjacentHTML('beforeend', iconHTML);
  span.append(text);
  return span;
}

function pillButton(className, text, iconHTML) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `pill ${className}`;
  if (iconHTML) button.insertAdjacentHTML('beforeend', iconHTML);
  button.append(text);
  return button;
}

function tagPill(tag) {
  const button = pillButton('tag-pill', `#${tag}`);
  button.dataset.tag = tag;
  button.title = `Show only #${tag}`;
  return button;
}

function emptyCopy(state) {
  const query = state.search.trim();
  if (!state.tasks.length) return ['No tasks yet', 'Add your first task above. Press N to jump to the box.'];
  if (query) return [`Nothing matches “${query}”`, 'Try another word, or clear the search.'];
  if (state.filter === 'active') return ['All caught up', 'Every task in this view is done.'];
  if (state.filter === 'done') return ['Nothing completed yet', 'Tick the circle next to a task to mark it done.'];
  return ['No tasks in this view', 'Pick another tag to see more.'];
}

/* ---------- Notes ---------- */

/** A short name for a note: its title, or the start of its first line of text. */
export function noteName(note) {
  if (note.title) return note.title;
  const line = note.body.split('\n').find((l) => l.trim()) || '';
  const plain = stripInlineMarkdown(line.replace(/^\s*(#{1,3}\s+|[-*+]\s+(\[[ xX]\]\s*)?|\d+[.)]\s+|>\s?)/, '')).trim();
  return plain ? truncate(plain, 48) : 'Untitled note';
}

function renderNotes(e, state, notes) {
  const { visible } = notes;
  e.noteSampleNote.hidden = state.noteSamplesDismissed || !state.notes.some((n) => n.sample);
  renderTagChips(e.noteTagRow, notes.tagCounts, notes.activeTag);

  const tasksById = new Map(state.tasks.map((t) => [t.id, t]));
  const card = (n) => noteCard(e.noteTpl, n, tasksById, state.lastAddedNoteId);
  const pinned = visible.filter((n) => n.pinned);
  const others = visible.filter((n) => !n.pinned);
  // Label the two groups only when both have notes in them.
  const grouped = pinned.length > 0 && others.length > 0;
  e.noteGrid.replaceChildren(
    ...(grouped ? [groupLabel('Pinned')] : []),
    ...pinned.map(card),
    ...(grouped ? [groupLabel('Others')] : []),
    ...others.map(card),
  );
  e.noteGrid.hidden = visible.length === 0;
  e.noteEmpty.hidden = visible.length > 0;
  if (!visible.length) {
    const [title, text] = noteEmptyCopy(state);
    e.noteEmptyTitle.textContent = title;
    e.noteEmptyText.textContent = text;
  }

  const total = state.notes.length;
  const pinnedTotal = state.notes.filter((n) => n.pinned).length;
  e.noteCount.textContent = `${total} ${total === 1 ? 'note' : 'notes'}${pinnedTotal ? ` · ${pinnedTotal} pinned` : ''}`;

  if (!e.notesView.hidden) markClippedNotes();
}

/**
 * Long notes are cut off at a fixed height. Fade the bottom of only those,
 * so a short note never looks like it has more to show. Layout decides
 * this, so it runs again when the window resizes or the fonts arrive.
 */
export function markClippedNotes() {
  for (const body of els().noteGrid.querySelectorAll('.note-body')) {
    body.classList.toggle('is-clipped', body.scrollHeight > body.clientHeight + 1);
  }
}

function groupLabel(text) {
  const h = document.createElement('h2');
  h.className = 'note-group';
  h.textContent = text;
  return h;
}

function noteCard(tpl, n, tasksById, newId) {
  const card = tpl.content.firstElementChild.cloneNode(true);
  const name = noteName(n);
  card.dataset.id = n.id;
  if (n.color) card.dataset.color = n.color;
  card.classList.toggle('is-pinned', n.pinned);
  if (n.id === newId) card.classList.add('is-new');

  const title = card.querySelector('.note-title');
  if (n.title) title.textContent = n.title;
  else {
    title.remove();
    card.classList.add('is-untitled');
  }

  const body = card.querySelector('.note-body');
  if (n.body) body.append(renderMarkdown(n.body));
  else body.remove();

  const pin = card.querySelector('[data-action="pin"]');
  pin.setAttribute('aria-pressed', String(n.pinned));
  pin.setAttribute('aria-label', `Pin “${name}”`);
  pin.title = n.pinned ? 'Unpin' : 'Pin to the top';

  const meta = card.querySelector('.note-meta');
  const task = n.taskId ? tasksById.get(n.taskId) : null;
  if (task) {
    const link = pillButton('link-pill', truncate(task.title, 28), ICON_TASK);
    link.classList.toggle('is-done', task.done);
    link.dataset.action = 'open-task';
    link.dataset.role = 'open-task';
    link.dataset.task = task.id;
    link.title = `Linked task: ${task.title}`;
    link.setAttribute('aria-label', `Open the linked task “${task.title}”${task.done ? ' (done)' : ''}`);
    meta.append(link);
  }
  for (const tag of n.tags) meta.append(tagPill(tag));
  const time = document.createElement('span');
  time.className = 'note-time';
  time.textContent = formatRelative(n.updatedAt);
  time.title = `Edited ${new Date(n.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`;
  meta.append(time);

  card.querySelector('[data-action="edit"]').setAttribute('aria-label', `Edit “${name}”`);
  card.querySelector('[data-action="delete"]').setAttribute('aria-label', `Delete “${name}”`);
  return card;
}

function noteEmptyCopy(state) {
  const query = state.noteSearch.trim();
  if (!state.notes.length) return ['No notes yet', 'Write your first note above. Press N to jump to the box.'];
  if (query) return [`No notes match “${query}”`, 'Try another word, or clear the search.'];
  return ['No notes with this tag', 'Pick another tag to see more.'];
}

/* ---------- Focus survives re-renders ----------
   Lists are rebuilt on every change, so remember which control had focus
   and put it back on the matching control in the new list. */

function rememberFocus(e) {
  const active = document.activeElement;
  if (!active || active === document.body) return null;
  const row = active.closest('.task');
  if (row && active.dataset.role) {
    const index = [...row.parentElement.children].indexOf(row);
    return { el: active, type: 'task', id: row.dataset.id, role: active.dataset.role, index };
  }
  const card = active.closest('.note-card');
  if (card && active.dataset.role) {
    const index = [...e.noteGrid.querySelectorAll('.note-card')].indexOf(card);
    return { el: active, type: 'note', id: card.dataset.id, role: active.dataset.role, line: active.dataset.line, index };
  }
  if (active.classList.contains('chip') || active.classList.contains('tag-pill')) {
    const row = active.closest('#note-tag-row, #note-grid') ? e.noteTagRow : e.tagRow;
    return { el: active, type: 'chip', row, tag: active.dataset.tag };
  }
  return null;
}

function restoreFocus(e, focus) {
  if (!focus || focus.el.isConnected) return;
  let target = null;
  if (focus.type === 'task') {
    target = e.list.querySelector(`.task[data-id="${CSS.escape(focus.id)}"] [data-role="${focus.role}"]`);
    // The task left this view (deleted, or ticked off under Active), so move
    // to the row that took its place instead of dropping focus to the page.
    if (!target) target = nearbyRowControl(e.list, focus);
  } else if (focus.type === 'note') {
    target = noteControl(e.noteGrid, focus);
  } else {
    target = focus.row.querySelector(`.chip[data-tag="${CSS.escape(focus.tag)}"]`);
  }
  if (!target) return;
  target.focus({ preventScroll: true });
  if (focus.role === 'handle') target.scrollIntoView({ block: 'nearest' });
}

function nearbyRowControl(list, focus) {
  const rows = list.children;
  if (!rows.length) return null;
  const row = rows[Math.min(focus.index, rows.length - 1)];
  const same = row.querySelector(`[data-role="${focus.role}"]`);
  // Edit and delete are display:none on phones, so fall back to the checkbox.
  return same && same.offsetParent !== null ? same : row.querySelector('[data-role="check"]');
}

/** The same control on the same note card, or the closest thing to it. */
function noteControl(container, focus) {
  const cards = [...container.querySelectorAll('.note-card')];
  const card = cards.find((c) => c.dataset.id === focus.id) || cards[Math.min(focus.index, cards.length - 1)];
  if (!card) return null;
  const edit = card.querySelector('[data-role="edit"]');
  // Edit is display:none on phones, so fall back to the first checklist item.
  return lineControl(card, focus) || (isShown(edit) ? edit : card.querySelector('[data-role="item"]'));
}

/**
 * The control with the same role (and checklist line) inside a container.
 * After an item is turned into a task its line is gone and the next item
 * moves up into it, so the same line number finds that next item.
 */
function lineControl(container, focus) {
  const line = focus.line !== undefined ? `[data-line="${focus.line}"]` : '';
  const same = container.querySelector(`[data-role="${focus.role}"]${line}`);
  if (same && isShown(same)) return same;
  return focus.line !== undefined ? container.querySelector(`[data-role="item"]${line}`) : null;
}

const isShown = (el) => el.offsetParent !== null;

/* ---------- Composer preview ---------- */

export function renderComposerPreview(parsed) {
  const preview = byId('composer-preview');
  const hint = byId('composer-hint');
  const parts = [];
  if (parsed.priority) parts.push(pill(`pri pri-${parsed.priority}`, `${PRIORITY_LABEL[parsed.priority]} priority`));
  if (parsed.dueDate) parts.push(pill('due', formatDue(parsed.dueDate), ICON_CALENDAR));
  for (const tag of parsed.tags) parts.push(pill('', `#${tag}`));

  const show = parts.length > 0;
  preview.hidden = !show;
  hint.hidden = show;
  if (show) {
    const label = document.createElement('span');
    label.textContent = 'Adds with';
    preview.replaceChildren(label, ...parts);
  }
}

/* ---------- Toast ---------- */

let toastTimer = 0;

export function showToast(message, action) {
  const e = els();
  e.toastMsg.textContent = message;
  if (action) {
    e.toastAction.textContent = action.label;
    e.toastAction.hidden = false;
    e.toastAction.onclick = () => {
      hideToast();
      action.run();
    };
  } else {
    e.toastAction.hidden = true;
    e.toastAction.onclick = null;
  }
  // An open modal dialog makes the rest of the page inert, so the toast
  // moves inside it to stay clickable. parkToast() brings it back.
  const host = document.querySelector('dialog[open]') || document.body;
  if (e.toast.parentElement !== host) host.append(e.toast);
  e.toast.hidden = false;
  e.toast.classList.remove('is-in');
  void e.toast.offsetWidth; // restart the entrance animation
  e.toast.classList.add('is-in');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 6000 : 3500);
}

export function hideToast() {
  clearTimeout(toastTimer);
  els().toast.hidden = true;
}

/** Moves the toast back out of a dialog that is closing, so it stays on screen. */
function parkToast() {
  const { toast } = els();
  if (toast.parentElement !== document.body) document.body.append(toast);
}

/* ---------- Edit dialog ---------- */

let editingId = null;

export function setupEditor({ onSave, onDelete }) {
  const dialog = byId('editor');
  const form = byId('editor-form');
  const title = byId('edit-title');

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!title.value.trim()) {
      title.focus();
      return;
    }
    const id = editingId;
    const patch = {
      title: title.value,
      notes: byId('edit-notes').value,
      priority: byId('edit-priority').value,
      dueDate: byId('edit-due').value || null,
      tags: byId('edit-tags').value,
    };
    dialog.close();
    onSave(id, patch);
  });

  byId('editor-cancel').addEventListener('click', () => dialog.close());
  byId('editor-close').addEventListener('click', () => dialog.close());
  byId('editor-delete').addEventListener('click', () => {
    const id = editingId;
    dialog.close();
    onDelete(id);
  });
  closeOnBackdrop(dialog);
  dialog.addEventListener('close', () => {
    editingId = null;
    parkToast();
  });
}

export function openEditor(task) {
  editingId = task.id;
  byId('edit-title').value = task.title;
  byId('edit-notes').value = task.notes;
  byId('edit-priority').value = task.priority;
  byId('edit-due').value = task.dueDate || '';
  byId('edit-tags').value = task.tags.join(', ');
  showDialog(byId('editor'));
  byId('edit-title').focus();
}

function showDialog(dialog) {
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

/**
 * Clicking the dimmed backdrop closes a dialog. A press that starts inside
 * the form (selecting text, say) and is released over the backdrop doesn't.
 */
function closeOnBackdrop(dialog) {
  let pressedBackdrop = false;
  dialog.addEventListener('pointerdown', (ev) => {
    pressedBackdrop = ev.target === dialog;
  });
  dialog.addEventListener('click', (ev) => {
    if (ev.target === dialog && pressedBackdrop) dialog.close();
  });
}

/* ---------- Note dialog ----------
   Saves as you type: text fields are debounced, everything else saves at
   once. In Preview the store is the source of truth, so every render
   copies the saved text back into the hidden textarea. */

const SAVE_DELAY = 350;
let editingNoteId = null;
let noteMode = 'write';
let noteReturnFocus = null;
let pendingPatch = {};
let saveTimer = 0;
let noteHandlers = null;

let noteCached = null;
function noteEls() {
  if (noteCached) return noteCached;
  noteCached = {
    dialog: byId('note-editor'),
    title: byId('note-edit-title'),
    body: byId('note-edit-body'),
    tags: byId('note-edit-tags'),
    preview: byId('note-edit-preview'),
    pin: byId('note-edit-pin'),
    task: byId('note-edit-task'),
    saveState: byId('note-save-state'),
  };
  return noteCached;
}

function flushNote() {
  clearTimeout(saveTimer);
  if (!editingNoteId || !Object.keys(pendingPatch).length) return;
  const patch = pendingPatch;
  pendingPatch = {};
  noteHandlers.onChange(editingNoteId, patch);
  noteEls().saveState.textContent = isNoteFormEmpty() ? 'Empty notes are removed on close' : 'Saved';
}

function queueNoteSave(key, value) {
  pendingPatch[key] = value;
  noteEls().saveState.textContent = 'Saving…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushNote, SAVE_DELAY);
}

function saveNoteNow(patch) {
  flushNote();
  if (editingNoteId) noteHandlers.onChange(editingNoteId, patch);
}

function isNoteFormEmpty() {
  const { title, body } = noteEls();
  return !title.value.trim() && !body.value.trim();
}

/**
 * handlers: onChange(id, patch), onDelete(id), onDiscard(id) for a note
 * emptied in the editor, onTickItem(id, checkbox), onLineToTask(id, line).
 */
export function setupNoteEditor(handlers) {
  noteHandlers = handlers;
  const { dialog, title, body, tags, preview, pin, task } = noteEls();

  title.addEventListener('input', () => queueNoteSave('title', title.value));
  body.addEventListener('input', () => queueNoteSave('body', body.value));
  tags.addEventListener('input', () => queueNoteSave('tags', tags.value));

  // Enter in the title moves on to the text instead of closing the dialog.
  title.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || ev.ctrlKey || ev.metaKey) return;
    ev.preventDefault();
    setNoteMode('write');
    body.focus();
  });

  pin.addEventListener('click', () => {
    const pinned = pin.getAttribute('aria-pressed') !== 'true';
    setPinButton(pinned);
    saveNoteNow({ pinned });
  });
  for (const radio of dialog.querySelectorAll('input[name="note-color"]')) {
    radio.addEventListener('change', () => saveNoteNow({ color: radio.value || null }));
  }
  task.addEventListener('change', () => saveNoteNow({ taskId: task.value || null }));
  for (const radio of dialog.querySelectorAll('input[name="note-mode"]')) {
    radio.addEventListener('change', () => setNoteMode(radio.value));
  }

  // Checklists in Preview work the same as on the cards.
  preview.addEventListener('change', (ev) => {
    const input = ev.target.closest('[data-role="item"]');
    if (input && editingNoteId) handlers.onTickItem(editingNoteId, input);
  });
  preview.addEventListener('click', (ev) => {
    const button = ev.target.closest('[data-action="to-task"]');
    if (button && editingNoteId) handlers.onLineToTask(editingNoteId, Number(button.dataset.line));
  });

  dialog.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      dialog.close();
    }
  });
  byId('note-editor-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    dialog.close();
  });
  byId('note-editor-close').addEventListener('click', () => dialog.close());
  byId('note-editor-delete').addEventListener('click', () => {
    flushNote();
    const id = editingNoteId;
    editingNoteId = null; // so the close handler leaves it alone
    dialog.close();
    handlers.onDelete(id);
  });
  closeOnBackdrop(dialog);

  dialog.addEventListener('close', () => {
    parkToast();
    const id = editingNoteId;
    if (id) {
      flushNote();
      editingNoteId = null;
      if (isNoteFormEmpty()) handlers.onDiscard(id);
    }
    // The control that opened the dialog was probably re-rendered while it
    // was open, so the browser couldn't return focus to it (focus is left on
    // the page, or still inside the closed dialog). Find its twin instead.
    const back = noteReturnFocus;
    noteReturnFocus = null;
    const active = document.activeElement;
    if (back && (!active || active === document.body || dialog.contains(active))) restoreFocus(els(), back);
  });
}

export function openNoteEditor(note, tasks) {
  noteReturnFocus = rememberFocus(els());
  editingNoteId = note.id;
  pendingPatch = {};
  const { dialog, title, body, tags, task } = noteEls();
  title.value = note.title;
  body.value = note.body;
  tags.value = note.tags.join(', ');
  setPinButton(note.pinned);
  const color = dialog.querySelector(`input[name="note-color"][value="${note.color || ''}"]`);
  if (color) color.checked = true;
  fillTaskSelect(task, tasks, note.taskId);
  noteEls().saveState.textContent = 'Saved';
  setNoteMode('write');
  showDialog(dialog);
  // On touch screens, leave the keyboard closed so the note can be read first.
  if (window.matchMedia('(hover: hover)').matches) {
    body.focus();
    body.setSelectionRange(body.value.length, body.value.length);
    body.scrollTop = body.scrollHeight;
  }
}

function setPinButton(pinned) {
  const { pin } = noteEls();
  pin.setAttribute('aria-pressed', String(pinned));
  pin.setAttribute('aria-label', 'Pin note');
  pin.title = pinned ? 'Unpin' : 'Pin to the top';
}

function fillTaskSelect(select, tasks, selectedId) {
  const group = (label, list) => {
    const optgroup = document.createElement('optgroup');
    optgroup.label = label;
    optgroup.append(...list.map((t) => new Option(truncate(t.title, 60), t.id)));
    return optgroup;
  };
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  select.replaceChildren(
    new Option('Not linked', ''),
    ...(open.length ? [group('Open tasks', open)] : []),
    ...(done.length ? [group('Done', done)] : []),
  );
  select.value = tasks.some((t) => t.id === selectedId) ? selectedId : '';
}

function setNoteMode(mode) {
  const { body, preview } = noteEls();
  const showPreview = mode === 'preview';
  if (showPreview && !body.hidden) preview.style.minHeight = `${body.offsetHeight}px`;
  // Save first, while still in Write, so that render can't copy older saved
  // text over what's in the box (an emptied note isn't saved at all).
  flushNote();
  noteMode = mode;
  byId(`note-mode-${mode}`).checked = true;
  body.hidden = showPreview;
  preview.hidden = !showPreview;
  if (showPreview) renderNotePreview(body.value);
}

function renderNotePreview(text) {
  const { preview } = noteEls();
  const active = preview.contains(document.activeElement) ? document.activeElement : null;
  const focus = active && active.dataset.role ? { role: active.dataset.role, line: active.dataset.line } : null;

  if (text.trim()) {
    preview.replaceChildren(renderMarkdown(text));
  } else {
    const empty = document.createElement('p');
    empty.className = 'md-empty';
    empty.textContent = 'Nothing to preview yet.';
    preview.replaceChildren(empty);
  }

  if (focus) lineControl(preview, focus)?.focus({ preventScroll: true });
}

/** Keeps an open note dialog in step with the store (Preview only). */
function refreshNoteEditor(state) {
  if (!editingNoteId || noteMode !== 'preview') return;
  const note = state.notes.find((n) => n.id === editingNoteId);
  if (!note) {
    // Its last line was turned into a task, so the note is gone.
    editingNoteId = null;
    noteEls().dialog.close();
    return;
  }
  noteEls().body.value = note.body;
  renderNotePreview(note.body);
}
