// The single source of truth: tasks, notes and view settings, saved to
// localStorage. The UI never changes state directly; it calls these
// functions, and every change notifies subscribers so the page can re-render.

import {
  uid, todayISO, addDaysISO, parseTags, isISODate, parseQuickAdd, checklistItem, toggleChecklistLine, stripInlineMarkdown,
} from './utils.js';

export const TASKS_KEY = 'aurum-tasks:tasks';
export const NOTES_KEY = 'aurum-tasks:notes';
const PREFS_KEY = 'aurum-tasks:prefs';

export const PRIORITIES = ['low', 'medium', 'high'];
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const FILTERS = ['all', 'active', 'done'];
const SORTS = ['manual', 'due', 'priority', 'newest'];

export const NOTE_COLORS = ['gold', 'sage', 'clay', 'rose', 'dusk'];
const NOTE_SORTS = ['edited', 'newest', 'title'];
const VIEWS = ['tasks', 'notes'];

/* ---------- Storage (never throws: private windows can block it) ---------- */

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage is full or blocked. Keep working in memory. */
  }
}

/* ---------- Task shape ---------- */

/** Turn anything task-like (saved data, an import, a form) into a clean task, or null. */
export function normalizeTask(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = typeof raw.title === 'string' ? raw.title.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  if (!title) return null;

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    title,
    notes: typeof raw.notes === 'string' ? raw.notes.trim().slice(0, 1000) : '',
    done: raw.done === true,
    priority: PRIORITIES.includes(raw.priority) ? raw.priority : 'medium',
    dueDate: isISODate(raw.dueDate) ? raw.dueDate : null,
    tags: cleanTags(raw.tags),
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    completedAt: Number.isFinite(raw.completedAt) ? raw.completedAt : null,
    sample: raw.sample === true,
  };
}

function cleanTags(tags) {
  if (Array.isArray(tags)) return parseTags(tags.join(','));
  if (typeof tags === 'string') return parseTags(tags);
  return [];
}

/** Example tasks shown on the very first visit, with dates relative to today. */
function sampleTasks() {
  const today = todayISO();
  const now = Date.now();
  const rows = [
    { title: 'Submit weekly internship report', priority: 'high', dueDate: today, tags: ['work'], notes: 'List what I shipped this week, what I learned, and any blockers.' },
    { title: 'Fix the login form validation bug', priority: 'high', dueDate: addDaysISO(today, -1), tags: ['work', 'bug'] },
    { title: "Review a teammate's pull request", priority: 'medium', dueDate: today, tags: ['work'] },
    { title: 'Deploy this todo app to GitHub Pages', priority: 'medium', dueDate: addDaysISO(today, 1), tags: ['project'] },
    { title: 'Read the MDN guide on JavaScript modules', priority: 'low', dueDate: addDaysISO(today, 5), tags: ['learning'] },
    { title: 'Add this project to my resume', priority: 'low', tags: ['personal'] },
    { title: 'Set up VS Code and Git on the work laptop', priority: 'medium', tags: ['work'], done: true },
    { title: 'Attend the onboarding orientation', priority: 'medium', tags: ['work'], done: true },
  ];
  return rows.map((row, i) =>
    normalizeTask({ ...row, createdAt: now - i * 3_600_000, completedAt: row.done ? now - i * 600_000 : null, sample: true }),
  );
}

/* ---------- Note shape ---------- */

/** Turn anything note-like into a clean note, or null. A note needs a title or some text. */
export function normalizeNote(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = typeof raw.title === 'string' ? raw.title.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  const body = typeof raw.body === 'string' ? raw.body.replace(/\r\n?/g, '\n').trimEnd().slice(0, 20000) : '';
  if (!title && !body.trim()) return null;

  const createdAt = Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now();
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    title,
    body,
    tags: cleanTags(raw.tags),
    pinned: raw.pinned === true,
    color: NOTE_COLORS.includes(raw.color) ? raw.color : null,
    taskId: typeof raw.taskId === 'string' && raw.taskId ? raw.taskId : null,
    createdAt,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : createdAt,
    sample: raw.sample === true,
  };
}

/** Example notes that show off checklists, Markdown, colours and a link to a task. */
function sampleNotes(tasks) {
  const now = Date.now();
  const report = tasks.find((t) => t.title === 'Submit weekly internship report');
  const rows = [
    {
      title: 'How notes work',
      pinned: true,
      color: 'gold',
      body: [
        'Type `- [ ]` to start a checklist:',
        '',
        '- [ ] Tick me',
        '- [ ] Send the demo invite !high @fri',
        '',
        'The button beside an item turns it into a task. **Bold**, *italic*, `#` headings and [links](https://developer.mozilla.org/) work too.',
      ].join('\n'),
    },
    {
      title: 'Weekly report draft',
      tags: ['work'],
      taskId: report ? report.id : null,
      body: [
        '## Shipped',
        '- Drag-to-reorder on touch screens',
        '- Export and import as JSON',
        '',
        '## Learned',
        'Pointer capture keeps a drag alive even when the finger slides off the handle.',
        '',
        '## Next week',
        '- [ ] Write unit tests for the date helpers',
        '- [ ] Ask for a design review',
      ].join('\n'),
    },
    {
      title: 'Things to learn',
      color: 'sage',
      tags: ['learning'],
      body: '- [x] JavaScript modules\n- [ ] CSS container queries\n- [ ] Unit tests with Vitest\n- [ ] Service workers for offline mode',
    },
    {
      title: 'Standup, Monday',
      color: 'clay',
      tags: ['work'],
      body: '**Yesterday:** fixed the login form validation\n**Today:** review a pull request, then polish the notes page\n**Blockers:** none',
    },
    {
      color: 'dusk',
      tags: ['personal'],
      body: 'Ramen place two streets from the office. Try the *black garlic* broth.',
    },
  ];
  return rows.map((row, i) => normalizeNote({ ...row, createdAt: now - i * 5_400_000, sample: true }));
}

/* ---------- State ---------- */

const prefs = read(PREFS_KEY) || {};
const storedTasks = read(TASKS_KEY);
const storedNotes = read(NOTES_KEY);
const tasks = Array.isArray(storedTasks) ? storedTasks.map(normalizeTask).filter(Boolean) : sampleTasks();

const state = {
  view: 'tasks', // follows the URL hash, so it isn't saved here
  tasks,
  filter: FILTERS.includes(prefs.filter) ? prefs.filter : 'all',
  sort: SORTS.includes(prefs.sort) ? prefs.sort : 'manual',
  tag: typeof prefs.tag === 'string' ? prefs.tag : null,
  search: '',
  samplesDismissed: prefs.samplesDismissed === true,
  lastAddedId: null,

  notes: Array.isArray(storedNotes) ? storedNotes.map(normalizeNote).filter(Boolean) : sampleNotes(tasks),
  noteSort: NOTE_SORTS.includes(prefs.noteSort) ? prefs.noteSort : 'edited',
  noteTag: typeof prefs.noteTag === 'string' ? prefs.noteTag : null,
  noteSearch: '',
  noteSamplesDismissed: prefs.noteSamplesDismissed === true,
  lastAddedNoteId: null,
};

const listeners = new Set();

export const getState = () => state;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => fn(state));
}

function commit() {
  write(TASKS_KEY, state.tasks);
  write(NOTES_KEY, state.notes);
  write(PREFS_KEY, {
    filter: state.filter,
    sort: state.sort,
    tag: state.tag,
    samplesDismissed: state.samplesDismissed,
    noteSort: state.noteSort,
    noteTag: state.noteTag,
    noteSamplesDismissed: state.noteSamplesDismissed,
  });
  notify();
}

const indexOf = (id) => state.tasks.findIndex((t) => t.id === id);
const noteIndexOf = (id) => state.notes.findIndex((n) => n.id === id);

/* ---------- Task actions ---------- */

export function addTask(input) {
  const task = normalizeTask({ ...input, id: uid(), createdAt: Date.now(), done: false, sample: false });
  if (!task) return null;
  state.tasks.unshift(task);
  state.lastAddedId = task.id;
  commit();
  return task;
}

export function updateTask(id, patch) {
  const i = indexOf(id);
  if (i === -1) return;
  const current = state.tasks[i];
  // An edited sample task now belongs to the user, so "Clear samples" leaves it alone.
  const next = normalizeTask({ ...current, ...patch, id: current.id, createdAt: current.createdAt, sample: false });
  if (!next) return;
  state.tasks[i] = next;
  commit();
}

export function setDone(id, done) {
  const i = indexOf(id);
  if (i === -1 || state.tasks[i].done === done) return;
  state.tasks[i] = { ...state.tasks[i], done, completedAt: done ? Date.now() : null };
  commit();
}

/** Removes a task. Returns what was removed so it can be restored (Undo). */
export function deleteTask(id) {
  const index = indexOf(id);
  if (index === -1) return [];
  const [task] = state.tasks.splice(index, 1);
  commit();
  return [{ task, index }];
}

/** Puts removed tasks back where they were. */
export function restore(entries) {
  [...entries]
    .sort((a, b) => a.index - b.index)
    .forEach(({ task, index }) => {
      if (state.tasks.some((t) => t.id === task.id)) return;
      state.tasks.splice(Math.min(index, state.tasks.length), 0, task);
    });
  commit();
}

function removeWhere(predicate) {
  const removed = [];
  state.tasks = state.tasks.filter((task, index) => {
    if (!predicate(task)) return true;
    removed.push({ task, index });
    return false;
  });
  return removed;
}

export function clearCompleted() {
  const removed = removeWhere((t) => t.done);
  if (removed.length) commit();
  return removed;
}

export function clearSamples() {
  const removed = removeWhere((t) => t.sample);
  state.samplesDismissed = true;
  commit();
  return removed;
}

export function undoClearSamples(removed) {
  state.samplesDismissed = false;
  restore(removed);
}

export function keepSamples() {
  state.tasks = state.tasks.map((t) => (t.sample ? { ...t, sample: false } : t));
  state.samplesDismissed = true;
  commit();
}

/* ---------- Note actions ---------- */

export function addNote(input) {
  const now = Date.now();
  const note = normalizeNote({ ...input, id: uid(), createdAt: now, updatedAt: now, sample: false });
  if (!note) return null;
  state.notes.unshift(note);
  state.lastAddedNoteId = note.id;
  commit();
  return note;
}

const NOTE_FIELDS = ['title', 'body', 'tags', 'pinned', 'color', 'taskId'];
const NOTE_CONTENT = ['title', 'body', 'tags'];

/**
 * Applies a patch from the editor or a card. The editor saves as you type,
 * so a patch that changes nothing is ignored, and only edits to the words
 * (not pinning, colour or the linked task) move the "edited" time.
 */
export function updateNote(id, patch) {
  const i = noteIndexOf(id);
  if (i === -1) return;
  const current = state.notes[i];
  const next = normalizeNote({ ...current, ...patch, id: current.id, createdAt: current.createdAt });
  if (!next) return; // that would leave the note empty
  const changed = (key) => JSON.stringify(next[key]) !== JSON.stringify(current[key]);
  if (!NOTE_FIELDS.some(changed)) return;
  // An edited sample note now belongs to the user, so "Clear samples" leaves it alone.
  next.sample = false;
  next.updatedAt = NOTE_CONTENT.some(changed) ? Date.now() : current.updatedAt;
  state.notes[i] = next;
  commit();
}

/** Ticks or unticks the checklist item on one line of a note. */
export function setNoteItem(id, line, done) {
  const note = state.notes[noteIndexOf(id)];
  if (!note) return;
  const lines = note.body.split('\n');
  const item = checklistItem(lines[line] ?? '');
  if (!item || item.done === done) return;
  lines[line] = toggleChecklistLine(lines[line]);
  updateNote(id, { body: lines.join('\n') });
}

/**
 * Moves an open checklist item out of a note and onto the task list. The
 * item's text goes through the quick-add parser, so "#tag !high @fri" work,
 * and the task also gets the note's tags. Returns what Undo needs, or null.
 */
export function noteLineToTask(id, line) {
  const index = noteIndexOf(id);
  if (index === -1) return null;
  const note = state.notes[index];
  const lines = note.body.split('\n');
  const item = checklistItem(lines[line] ?? '');
  if (!item || item.done || !item.text) return null;

  const text = stripInlineMarkdown(item.text); // task titles are plain text
  const parsed = parseQuickAdd(text);
  const task = normalizeTask({
    title: parsed.title || text,
    priority: parsed.priority || 'medium',
    dueDate: parsed.dueDate,
    tags: [...parsed.tags, ...note.tags],
    id: uid(),
    createdAt: Date.now(),
  });
  if (!task) return null;

  lines.splice(line, 1);
  const next = normalizeNote({ ...note, body: lines.join('\n'), updatedAt: Date.now(), sample: false });
  // A note whose only line just moved would be empty, so it goes too.
  if (next) state.notes[index] = next;
  else state.notes.splice(index, 1);
  state.tasks.unshift(task);
  state.lastAddedId = task.id;
  commit();
  return { task, note, index };
}

export function undoNoteLineToTask({ task, note, index }) {
  state.tasks = state.tasks.filter((t) => t.id !== task.id);
  const i = noteIndexOf(note.id);
  if (i === -1) state.notes.splice(Math.min(index, state.notes.length), 0, note);
  else state.notes[i] = note;
  commit();
}

/** Removes a note. Returns what was removed so it can be restored (Undo). */
export function deleteNote(id) {
  const index = noteIndexOf(id);
  if (index === -1) return [];
  const [note] = state.notes.splice(index, 1);
  commit();
  return [{ note, index }];
}

/** Puts removed notes back where they were. */
export function restoreNotes(entries) {
  [...entries]
    .sort((a, b) => a.index - b.index)
    .forEach(({ note, index }) => {
      if (state.notes.some((n) => n.id === note.id)) return;
      state.notes.splice(Math.min(index, state.notes.length), 0, note);
    });
  commit();
}

export function clearSampleNotes() {
  const removed = [];
  state.notes = state.notes.filter((note, index) => {
    if (!note.sample) return true;
    removed.push({ note, index });
    return false;
  });
  state.noteSamplesDismissed = true;
  commit();
  return removed;
}

export function undoClearSampleNotes(removed) {
  state.noteSamplesDismissed = false;
  restoreNotes(removed);
}

export function keepSampleNotes() {
  state.notes = state.notes.map((n) => (n.sample ? { ...n, sample: false } : n));
  state.noteSamplesDismissed = true;
  commit();
}

/* ---------- Ordering ---------- */

/**
 * Apply a new order for the tasks currently on screen. Tasks hidden by a
 * filter keep their places; the visible ones are re-dealt into the slots
 * they already occupied.
 */
export function reorderVisible(orderedIds) {
  const byId = new Map(state.tasks.map((t) => [t.id, t]));
  const queue = orderedIds.filter((id) => byId.has(id));
  const moving = new Set(queue);
  state.tasks = state.tasks.map((t) => (moving.has(t.id) ? byId.get(queue.shift()) : t));
  commit();
}

export function moveTask(id, delta, visibleIds) {
  const from = visibleIds.indexOf(id);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= visibleIds.length) return false;
  const next = [...visibleIds];
  [next[from], next[to]] = [next[to], next[from]];
  reorderVisible(next);
  return true;
}

/* ---------- View settings ---------- */

export function setView(view) {
  if (!VIEWS.includes(view) || state.view === view) return;
  state.view = view;
  notify(); // the URL hash remembers the view
}

export function setFilter(filter) {
  if (!FILTERS.includes(filter)) return;
  state.filter = filter;
  commit();
}

export function setSort(sort) {
  if (!SORTS.includes(sort)) return;
  state.sort = sort;
  commit();
}

export function setTag(tag) {
  state.tag = tag || null;
  commit();
}

export function setSearch(query) {
  state.search = String(query || '');
  notify(); // search is not saved between visits
}

export function resetView() {
  state.filter = 'all';
  state.tag = null;
  state.search = '';
  commit();
}

export function setNoteSort(sort) {
  if (!NOTE_SORTS.includes(sort)) return;
  state.noteSort = sort;
  commit();
}

export function setNoteTag(tag) {
  state.noteTag = tag || null;
  commit();
}

export function setNoteSearch(query) {
  state.noteSearch = String(query || '');
  notify();
}

export function resetNoteView() {
  state.noteTag = null;
  state.noteSearch = '';
  commit();
}

export function consumeLastAdded() {
  state.lastAddedId = null;
  state.lastAddedNoteId = null;
}

/* ---------- Import / export ---------- */

export function exportData() {
  const strip = ({ sample, ...item }) => item;
  return JSON.stringify(
    { app: 'aurum-tasks', version: 2, exportedAt: new Date().toISOString(), tasks: state.tasks.map(strip), notes: state.notes.map(strip) },
    null,
    2,
  );
}

/**
 * Adds tasks and notes from an exported file (older files hold tasks only).
 * Returns how many of each were new. Throws on bad files.
 */
export function importData(data) {
  const taskList = Array.isArray(data) ? data : Array.isArray(data?.tasks) ? data.tasks : null;
  const noteList = Array.isArray(data?.notes) ? data.notes : null;
  if (!taskList && !noteList) throw new Error('Not an Aurum Tasks export');
  const tasks = newItems(taskList || [], normalizeTask, state.tasks);
  const notes = newItems(noteList || [], normalizeNote, state.notes);
  if (tasks.length || notes.length) {
    state.tasks = [...tasks, ...state.tasks];
    state.notes = [...notes, ...state.notes];
    commit();
  }
  return { tasks: tasks.length, notes: notes.length };
}

/** The valid items in list whose ids aren't in existing yet. */
function newItems(list, normalize, existing) {
  const known = new Set(existing.map((x) => x.id));
  const incoming = [];
  for (const raw of list) {
    const item = normalize(raw);
    if (!item || known.has(item.id)) continue;
    item.sample = false;
    known.add(item.id);
    incoming.push(item);
  }
  return incoming;
}

/** Re-read tasks and notes saved by another tab. */
export function reload() {
  const storedTasks = read(TASKS_KEY);
  const storedNotes = read(NOTES_KEY);
  if (Array.isArray(storedTasks)) state.tasks = storedTasks.map(normalizeTask).filter(Boolean);
  if (Array.isArray(storedNotes)) state.notes = storedNotes.map(normalizeNote).filter(Boolean);
  notify();
}

/* ---------- Derived data ---------- */

const NO_DATE = '9999-12-31';
const byDue = (a, b) =>
  (a.dueDate || NO_DATE).localeCompare(b.dueDate || NO_DATE) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
const byPriority = (a, b) =>
  PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.dueDate || NO_DATE).localeCompare(b.dueDate || NO_DATE);
const byNewest = (a, b) => b.createdAt - a.createdAt;
const SORTERS = { due: byDue, priority: byPriority, newest: byNewest };

const NOTE_SORTERS = {
  edited: (a, b) => b.updatedAt - a.updatedAt,
  newest: byNewest,
  title: (a, b) => (a.title || a.body).localeCompare(b.title || b.body, undefined, { sensitivity: 'base' }),
};

/** The selected tag, or null if no task carries it any more. */
export function getActiveTag() {
  return state.tag && state.tasks.some((t) => t.tags.includes(state.tag)) ? state.tag : null;
}

export function getVisibleTasks() {
  const query = state.search.trim().toLowerCase();
  const tag = getActiveTag();
  const list = state.tasks.filter((t) => {
    if (state.filter === 'active' && t.done) return false;
    if (state.filter === 'done' && !t.done) return false;
    if (tag && !t.tags.includes(tag)) return false;
    if (query) {
      const haystack = `${t.title} ${t.notes} ${t.tags.map((x) => `#${x}`).join(' ')}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
  const sorter = SORTERS[state.sort];
  // In any sorted view, finished tasks sink below open ones.
  return sorter ? list.sort((a, b) => Number(a.done) - Number(b.done) || sorter(a, b)) : list;
}

export function getStats() {
  const today = todayISO();
  let done = 0;
  let overdue = 0;
  let dueToday = 0;
  let high = 0;
  for (const t of state.tasks) {
    if (t.done) {
      done += 1;
      continue;
    }
    if (t.dueDate && t.dueDate < today) overdue += 1;
    else if (t.dueDate === today) dueToday += 1;
    if (t.priority === 'high') high += 1;
  }
  const total = state.tasks.length;
  return { total, done, open: total - done, overdue, dueToday, high };
}

function countTags(items) {
  const counts = new Map();
  for (const item of items) for (const tag of item.tags) counts.set(tag, (counts.get(tag) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export const getTagCounts = () => countTags(state.tasks);
export const getNoteTagCounts = () => countTags(state.notes);

/** The selected note tag, or null if no note carries it any more. */
export function getActiveNoteTag() {
  return state.noteTag && state.notes.some((n) => n.tags.includes(state.noteTag)) ? state.noteTag : null;
}

/** Notes matching the search and tag, pinned ones first. */
export function getVisibleNotes() {
  const query = state.noteSearch.trim().toLowerCase();
  const tag = getActiveNoteTag();
  return state.notes
    .filter((n) => {
      if (tag && !n.tags.includes(tag)) return false;
      if (query) {
        const haystack = `${n.title} ${n.body} ${n.tags.map((x) => `#${x}`).join(' ')}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    })
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || NOTE_SORTERS[state.noteSort](a, b));
}

/** Map of task id -> the notes linked to that task. */
export function getNotesByTask() {
  const map = new Map();
  for (const note of state.notes) {
    if (!note.taskId) continue;
    if (!map.has(note.taskId)) map.set(note.taskId, []);
    map.get(note.taskId).push(note);
  }
  return map;
}
