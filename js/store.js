// The single source of truth: tasks plus view settings, saved to localStorage.
// The UI never changes state directly; it calls these functions, and every
// change notifies subscribers so the page can re-render.

import { uid, todayISO, addDaysISO, parseTags, isISODate } from './utils.js';

export const TASKS_KEY = 'aurum-tasks:tasks';
const PREFS_KEY = 'aurum-tasks:prefs';

export const PRIORITIES = ['low', 'medium', 'high'];
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const FILTERS = ['all', 'active', 'done'];
const SORTS = ['manual', 'due', 'priority', 'newest'];

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

  let tags = [];
  if (Array.isArray(raw.tags)) tags = parseTags(raw.tags.join(','));
  else if (typeof raw.tags === 'string') tags = parseTags(raw.tags);

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    title,
    notes: typeof raw.notes === 'string' ? raw.notes.trim().slice(0, 1000) : '',
    done: raw.done === true,
    priority: PRIORITIES.includes(raw.priority) ? raw.priority : 'medium',
    dueDate: isISODate(raw.dueDate) ? raw.dueDate : null,
    tags,
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    completedAt: Number.isFinite(raw.completedAt) ? raw.completedAt : null,
    sample: raw.sample === true,
  };
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

/* ---------- State ---------- */

const prefs = read(PREFS_KEY) || {};
const storedTasks = read(TASKS_KEY);

const state = {
  tasks: Array.isArray(storedTasks) ? storedTasks.map(normalizeTask).filter(Boolean) : sampleTasks(),
  filter: FILTERS.includes(prefs.filter) ? prefs.filter : 'all',
  sort: SORTS.includes(prefs.sort) ? prefs.sort : 'manual',
  tag: typeof prefs.tag === 'string' ? prefs.tag : null,
  search: '',
  samplesDismissed: prefs.samplesDismissed === true,
  lastAddedId: null,
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
  write(PREFS_KEY, { filter: state.filter, sort: state.sort, tag: state.tag, samplesDismissed: state.samplesDismissed });
  notify();
}

const indexOf = (id) => state.tasks.findIndex((t) => t.id === id);

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

export function consumeLastAdded() {
  state.lastAddedId = null;
}

/* ---------- Import / export ---------- */

export function exportData() {
  const tasks = state.tasks.map(({ sample, ...task }) => task);
  return JSON.stringify({ app: 'aurum-tasks', version: 1, exportedAt: new Date().toISOString(), tasks }, null, 2);
}

/** Adds tasks from an exported file. Returns how many were new. Throws on bad files. */
export function importTasks(data) {
  const list = Array.isArray(data) ? data : data && Array.isArray(data.tasks) ? data.tasks : null;
  if (!list) throw new Error('Not an Aurum Tasks export');
  const known = new Set(state.tasks.map((t) => t.id));
  const incoming = [];
  for (const raw of list) {
    const task = normalizeTask(raw);
    if (!task || known.has(task.id)) continue;
    task.sample = false;
    known.add(task.id);
    incoming.push(task);
  }
  if (incoming.length) {
    state.tasks = [...incoming, ...state.tasks];
    commit();
  }
  return incoming.length;
}

/** Re-read tasks saved by another tab. */
export function reload() {
  const stored = read(TASKS_KEY);
  if (!Array.isArray(stored)) return;
  state.tasks = stored.map(normalizeTask).filter(Boolean);
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

export function getTagCounts() {
  const counts = new Map();
  for (const t of state.tasks) for (const tag of t.tags) counts.set(tag, (counts.get(tag) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
