// Entry point: connects user actions to the store, and the store to the UI.

import * as store from './store.js';
import * as ui from './ui.js';
import { parseQuickAdd, parseTags, extractTags, debounce, todayISO, truncate } from './utils.js';

const THEME_KEY = 'aurum-tasks:theme';
const $ = (id) => document.getElementById(id);
const plural = (n, word) => `${n} ${n === 1 ? word : `${word}s`}`;

function render() {
  ui.render({
    state: store.getState(),
    visible: store.getVisibleTasks(),
    stats: store.getStats(),
    tagCounts: store.getTagCounts(),
    activeTag: store.getActiveTag(),
    notes: {
      visible: store.getVisibleNotes(),
      tagCounts: store.getNoteTagCounts(),
      activeTag: store.getActiveNoteTag(),
      byTask: store.getNotesByTask(),
    },
  });
  store.consumeLastAdded();
}

/* ---------- Theme ---------- */

function applyTheme(theme, persist = false) {
  document.documentElement.dataset.theme = theme;
  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  const button = $('theme-toggle');
  button.setAttribute('aria-label', label);
  button.title = label;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#18140D' : '#FAF8F2');
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* not saved, still applied */
    }
  }
}

function initTheme() {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  $('theme-toggle').addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', true);
  });
}

/* ---------- Views: the Tasks / Notes switch is two links, #tasks and #notes ---------- */

const viewFromHash = () => (location.hash === '#notes' ? 'notes' : 'tasks');

function initViews() {
  store.setView(viewFromHash());
  window.addEventListener('hashchange', () => store.setView(viewFromHash()));
}

/* ---------- Adding tasks ---------- */

function initComposer() {
  const form = $('composer');
  const title = $('new-title');

  title.addEventListener('input', () => ui.renderComposerPreview(parseQuickAdd(title.value)));

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const parsed = parseQuickAdd(title.value);
    if (!parsed.title) {
      title.focus();
      ui.showToast('Give the task a name first.');
      return;
    }

    const task = store.addTask({
      title: parsed.title,
      priority: parsed.priority || form.elements.priority.value,
      dueDate: parsed.dueDate || $('new-due').value || null,
      tags: [...parsed.tags, ...parseTags($('new-tags').value)],
    });
    if (!task) return;

    // If a filter or search would hide the new task, show everything instead.
    if (!store.getVisibleTasks().some((t) => t.id === task.id)) {
      store.resetView();
      ui.showToast('Showing all tasks so you can see the new one.');
    }

    form.reset();
    ui.renderComposerPreview(parseQuickAdd(''));
    title.focus();
  });
}

/* ---------- The list ---------- */

function openEditorFor(id) {
  const task = store.getState().tasks.find((t) => t.id === id);
  if (task) ui.openEditor(task);
}

function deleteWithUndo(id) {
  const task = store.getState().tasks.find((t) => t.id === id);
  const removed = store.deleteTask(id);
  if (!removed.length) return;
  ui.showToast(`Deleted “${truncate(task.title, 36)}”`, { label: 'Undo', run: () => store.restore(removed) });
}

function initList() {
  const list = $('task-list');

  list.addEventListener('change', (ev) => {
    const input = ev.target.closest('[data-role="check"]');
    if (!input) return;
    const row = input.closest('.task');
    const { id } = row.dataset;
    const done = input.checked;
    // Style the row straight away and let the tick animate before re-rendering.
    row.classList.toggle('is-done', done);
    setTimeout(() => store.setDone(id, done), 220);
  });

  list.addEventListener('click', (ev) => {
    const button = ev.target.closest('button');
    if (!button || !list.contains(button)) return;
    const id = button.closest('.task')?.dataset.id;
    if (button.dataset.action === 'edit') openEditorFor(id);
    else if (button.dataset.action === 'delete') deleteWithUndo(id);
    else if (button.classList.contains('tag-pill')) store.setTag(button.dataset.tag);
    else if (button.classList.contains('note-pill')) openNoteFor(button.dataset.note);
  });

  // On phones the edit and delete icons are hidden, so a tap opens the editor.
  const compact = window.matchMedia('(hover: none), (max-width: 560px)');
  list.addEventListener('click', (ev) => {
    if (!compact.matches || ev.target.closest('button')) return;
    const body = ev.target.closest('.task-body');
    if (body) openEditorFor(body.closest('.task').dataset.id);
  });

  list.addEventListener('dblclick', (ev) => {
    if (ev.target.closest('button, input, label')) return;
    const row = ev.target.closest('.task');
    if (row) openEditorFor(row.dataset.id);
  });

  // Keyboard reordering: focus a handle and press the arrow keys.
  list.addEventListener('keydown', (ev) => {
    const handle = ev.target.closest('[data-role="handle"]');
    if (!handle || (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown')) return;
    ev.preventDefault();
    if (store.getState().sort !== 'manual') {
      ui.showToast('Switch sort to Manual order to reorder tasks.');
      return;
    }
    const ids = store.getVisibleTasks().map((t) => t.id);
    store.moveTask(handle.closest('.task').dataset.id, ev.key === 'ArrowUp' ? -1 : 1, ids);
  });

  initDrag(list);
}

/**
 * Drag to reorder with pointer events, so it works with a mouse, a pen and
 * touch. The dragged row never leaves the DOM (that would drop pointer
 * capture); its neighbours are moved around it instead.
 */
function initDrag(list) {
  let drag = null;

  list.addEventListener('pointerdown', (ev) => {
    const handle = ev.target.closest('[data-role="handle"]');
    if (!handle || ev.button !== 0) return;
    if (store.getState().sort !== 'manual') {
      ui.showToast('Switch sort to Manual order to drag tasks.');
      return;
    }
    ev.preventDefault();
    const row = handle.closest('.task');
    handle.setPointerCapture(ev.pointerId);
    drag = { row, pointerId: ev.pointerId, startIndex: [...list.children].indexOf(row), moved: false };
    row.classList.add('is-dragging');
    list.classList.add('is-sorting');
  });

  list.addEventListener('pointermove', (ev) => {
    if (!drag || ev.pointerId !== drag.pointerId) return;
    const { row } = drag;
    const others = [...list.children].filter((li) => li !== row);
    let target = others.length;
    for (let i = 0; i < others.length; i += 1) {
      const box = others[i].getBoundingClientRect();
      if (ev.clientY < box.top + box.height / 2) {
        target = i;
        break;
      }
    }
    const position = () => [...list.children].indexOf(row);
    while (position() < target) list.insertBefore(row.nextElementSibling, row);
    while (position() > target) row.after(row.previousElementSibling);
    if (position() !== drag.startIndex) drag.moved = true;

    // Scroll the page when dragging near the top or bottom edge.
    if (ev.clientY < 70) window.scrollBy(0, -12);
    else if (ev.clientY > window.innerHeight - 70) window.scrollBy(0, 12);
  });

  const end = (ev) => {
    if (!drag || ev.pointerId !== drag.pointerId) return;
    const { row, moved } = drag;
    drag = null;
    row.classList.remove('is-dragging');
    list.classList.remove('is-sorting');
    if (moved) store.reorderVisible([...list.children].map((li) => li.dataset.id));
  };
  list.addEventListener('pointerup', end);
  list.addEventListener('pointercancel', end);
}

/* ---------- Toolbar ---------- */

/** Live search that waits for a pause in typing. Escape clears it. */
function initSearch(input, setSearch) {
  const update = debounce((value) => setSearch(value), 120);
  input.addEventListener('input', () => update(input.value));
  input.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    update.cancel(); // or a search typed just before Escape comes back
    input.value = '';
    setSearch('');
    input.blur();
  });
}

function initToolbar() {
  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => store.setFilter(tab.dataset.filter));
  }

  $('sort').addEventListener('change', (ev) => store.setSort(ev.target.value));
  initSearch($('search'), store.setSearch);

  $('tag-row').addEventListener('click', (ev) => {
    const chip = ev.target.closest('.chip');
    if (!chip) return;
    const tag = chip.dataset.tag || null;
    store.setTag(store.getActiveTag() === tag ? null : tag);
  });
}

/* ---------- Notes ---------- */

function openNoteFor(id) {
  const { notes, tasks } = store.getState();
  const note = notes.find((n) => n.id === id);
  if (note) ui.openNoteEditor(note, tasks);
}

function deleteNoteWithUndo(id) {
  const note = store.getState().notes.find((n) => n.id === id);
  const removed = store.deleteNote(id);
  if (!removed.length) return;
  ui.showToast(`Deleted “${truncate(ui.noteName(note), 36)}”`, { label: 'Undo', run: () => store.restoreNotes(removed) });
}

/** Ticks a checklist item on a card or in Preview, letting the tick animate first. */
function tickNoteItem(id, input) {
  const done = input.checked;
  input.closest('.md-item').classList.toggle('is-done', done);
  setTimeout(() => store.setNoteItem(id, Number(input.dataset.line), done), 220);
}

function lineToTask(id, line) {
  const moved = store.noteLineToTask(id, line);
  if (!moved) return;
  ui.showToast(`Moved “${truncate(moved.task.title, 32)}” to Tasks`, { label: 'Undo', run: () => store.undoNoteLineToTask(moved) });
}

function initNoteComposer() {
  const form = $('note-composer');
  const title = $('note-new-title');
  const body = $('note-new-body');

  // The text box opens while the composer has focus or holds a draft.
  const hasDraft = () => Boolean(title.value.trim() || body.value.trim());
  form.addEventListener('focusin', () => form.classList.add('is-open'));
  form.addEventListener('focusout', (ev) => {
    if (!form.contains(ev.relatedTarget) && !hasDraft()) form.classList.remove('is-open');
  });

  // Enter in the title moves on to the text; Ctrl+Enter adds the note.
  title.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || ev.ctrlKey || ev.metaKey) return;
    ev.preventDefault();
    body.focus();
  });
  form.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      form.requestSubmit();
    } else if (ev.key === 'Escape') {
      ev.target.blur();
    }
  });

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const { text, tags } = extractTags(title.value);
    const note = store.addNote({ title: text, body: body.value, tags });
    if (!note) {
      title.focus();
      ui.showToast('Write a title or some text first.');
      return;
    }

    // If a search or tag would hide the new note, show every note instead.
    if (!store.getVisibleNotes().some((n) => n.id === note.id)) {
      store.resetNoteView();
      ui.showToast('Showing all notes so you can see the new one.');
    }

    form.reset();
    title.focus();
  });
}

function initNotes() {
  const grid = $('note-grid');

  grid.addEventListener('change', (ev) => {
    const input = ev.target.closest('[data-role="item"]');
    if (input) tickNoteItem(input.closest('.note-card').dataset.id, input);
  });

  grid.addEventListener('click', (ev) => {
    const card = ev.target.closest('.note-card');
    if (!card) return;
    const { id } = card.dataset;
    const button = ev.target.closest('button');
    if (button) {
      const { action } = button.dataset;
      if (action === 'edit') openNoteFor(id);
      else if (action === 'delete') deleteNoteWithUndo(id);
      else if (action === 'pin') store.updateNote(id, { pinned: button.getAttribute('aria-pressed') !== 'true' });
      else if (action === 'to-task') lineToTask(id, Number(button.dataset.line));
      else if (action === 'open-task') openEditorFor(button.dataset.task);
      else if (button.classList.contains('tag-pill')) store.setNoteTag(button.dataset.tag);
      return;
    }
    // Anywhere else on the card opens it, except links, checklist items, and
    // the end of a drag that selected some text.
    if (ev.target.closest('a, label, input') || !window.getSelection().isCollapsed) return;
    openNoteFor(id);
  });

  $('note-sort').addEventListener('change', (ev) => store.setNoteSort(ev.target.value));
  initSearch($('note-search'), store.setNoteSearch);

  $('note-tag-row').addEventListener('click', (ev) => {
    const chip = ev.target.closest('.chip');
    if (!chip) return;
    const tag = chip.dataset.tag || null;
    store.setNoteTag(store.getActiveNoteTag() === tag ? null : tag);
  });

  $('note-samples-clear').addEventListener('click', () => {
    const removed = store.clearSampleNotes();
    ui.showToast('Sample notes cleared.', { label: 'Undo', run: () => store.undoClearSampleNotes(removed) });
    $('note-new-title').focus();
  });
  $('note-samples-keep').addEventListener('click', () => store.keepSampleNotes());

  ui.setupNoteEditor({
    onChange: (id, patch) => store.updateNote(id, patch),
    onDelete: deleteNoteWithUndo,
    onDiscard: (id) => {
      const removed = store.deleteNote(id);
      if (removed.length) ui.showToast('Empty note removed.', { label: 'Undo', run: () => store.restoreNotes(removed) });
    },
    onTickItem: tickNoteItem,
    onLineToTask: lineToTask,
  });
}

/* ---------- Footer, samples, import/export ---------- */

function exportAll() {
  const blob = new Blob([store.exportData()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: `aurum-tasks-${todayISO()}.json` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const { tasks, notes } = store.getState();
  ui.showToast(`Exported ${plural(tasks.length, 'task')} and ${plural(notes.length, 'note')} to a JSON file.`);
}

function initFooter() {
  $('clear-done').addEventListener('click', () => {
    const removed = store.clearCompleted();
    if (!removed.length) return;
    const n = removed.length;
    ui.showToast(`Cleared ${n} completed ${n === 1 ? 'task' : 'tasks'}`, { label: 'Undo', run: () => store.restore(removed) });
  });

  // Both views have Export and Import buttons; one file holds tasks and notes.
  const fileInput = $('import-file');
  for (const button of document.querySelectorAll('[data-io="export"]')) button.addEventListener('click', exportAll);
  for (const button of document.querySelectorAll('[data-io="import"]')) button.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const added = store.importData(JSON.parse(await file.text()));
      const parts = [added.tasks && plural(added.tasks, 'task'), added.notes && plural(added.notes, 'note')].filter(Boolean);
      ui.showToast(parts.length ? `Imported ${parts.join(' and ')}.` : 'Nothing new in that file. Everything in it is already here.');
    } catch {
      ui.showToast('That file is not an Aurum Tasks export. Choose a .json file made with Export.');
    }
  });

  $('samples-clear').addEventListener('click', () => {
    const removed = store.clearSamples();
    ui.showToast('Sample tasks cleared. Your list is ready.', { label: 'Undo', run: () => store.undoClearSamples(removed) });
    $('new-title').focus();
  });
  $('samples-keep').addEventListener('click', () => store.keepSamples());
}

/* ---------- Keyboard shortcuts ---------- */

function initShortcuts() {
  document.addEventListener('keydown', (ev) => {
    if (ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    const typing =
      ev.target instanceof Element &&
      ev.target.closest('textarea, select, [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"])');
    if (typing) {
      if (ev.key === 'Escape' && ev.target.id === 'new-title') ev.target.blur();
      return;
    }
    const notes = store.getState().view === 'notes';
    if (ev.key === 'n' || ev.key === 'N') {
      ev.preventDefault();
      $(notes ? 'note-new-title' : 'new-title').focus();
    } else if (ev.key === '/') {
      ev.preventDefault();
      const search = $(notes ? 'note-search' : 'search');
      search.focus();
      search.select();
    }
  });
}

/* ---------- Start ---------- */

initTheme();
initViews();
initComposer();
initToolbar();
initList();
initNoteComposer();
initNotes();
initFooter();
initShortcuts();
ui.setupEditor({ onSave: (id, patch) => store.updateTask(id, patch), onDelete: deleteWithUndo });

store.subscribe(render);
render();

// Keep several open tabs in sync, and refresh "today" labels after the tab sleeps.
window.addEventListener('storage', (ev) => {
  if (ev.key === store.TASKS_KEY || ev.key === store.NOTES_KEY) store.reload();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) render();
});
window.addEventListener('resize', debounce(ui.markClippedNotes, 150));
document.fonts?.ready.then(ui.markClippedNotes);
