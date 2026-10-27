// Everything that touches the DOM. Builds the page from state; holds no state
// of its own beyond which task the edit dialog is open for.

import { formatDue, formatShortDate, fromISODate, daysFromToday, greeting, formatLongDate } from './utils.js';

const ICON_CALENDAR =
  '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>';
const PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' };

const byId = (id) => document.getElementById(id);

let cached = null;
function els() {
  if (cached) return cached;
  cached = {
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
    toast: byId('toast'),
    toastMsg: byId('toast-msg'),
    toastAction: byId('toast-action'),
  };
  return cached;
}

/* ---------- Main render ---------- */

export function render({ state, visible, stats, tagCounts, activeTag }) {
  const e = els();
  const focus = rememberFocus();

  renderSummary(e, stats);
  renderControls(e, state, stats);
  renderTags(e, tagCounts, activeTag);
  e.sampleNote.hidden = state.samplesDismissed || !state.tasks.some((t) => t.sample);
  renderList(e, state, visible);
  e.leftCount.textContent = `${stats.open} ${stats.open === 1 ? 'task' : 'tasks'} left`;
  e.clearDone.disabled = stats.done === 0;

  restoreFocus(e, focus);
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
  if (document.activeElement !== e.search && e.search.value !== state.search) e.search.value = state.search;
}

function renderTags(e, tagCounts, activeTag) {
  e.tagRow.hidden = tagCounts.length === 0;
  const chips = [chip('All tags', '', null, activeTag === null)];
  for (const [tag, count] of tagCounts) chips.push(chip(`#${tag}`, tag, count, activeTag === tag));
  e.tagRow.replaceChildren(...chips);
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

function renderList(e, state, visible) {
  const manual = state.sort === 'manual';
  const rows = visible.map((task) => taskRow(e.tpl, task, manual, state.lastAddedId));
  e.list.replaceChildren(...rows);
  e.list.hidden = visible.length === 0;
  e.empty.hidden = visible.length > 0;
  if (!visible.length) {
    const [title, text] = emptyCopy(state);
    e.emptyTitle.textContent = title;
    e.emptyText.textContent = text;
  }
}

function taskRow(tpl, t, manual, newId) {
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

  for (const tag of t.tags) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pill tag-pill';
    button.dataset.tag = tag;
    button.textContent = `#${tag}`;
    button.title = `Show only #${tag}`;
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

function emptyCopy(state) {
  const query = state.search.trim();
  if (!state.tasks.length) return ['No tasks yet', 'Add your first task above. Press N to jump to the box.'];
  if (query) return [`Nothing matches “${query}”`, 'Try another word, or clear the search.'];
  if (state.filter === 'active') return ['All caught up', 'Every task in this view is done.'];
  if (state.filter === 'done') return ['Nothing completed yet', 'Tick the circle next to a task to mark it done.'];
  return ['No tasks in this view', 'Pick another tag to see more.'];
}

/* ---------- Focus survives re-renders ----------
   The list is rebuilt on every change, so remember which control had focus
   and put it back on the matching control in the new list. */

function rememberFocus() {
  const active = document.activeElement;
  if (!active || active === document.body) return null;
  const row = active.closest('.task');
  if (row && active.dataset.role) return { el: active, type: 'task', id: row.dataset.id, role: active.dataset.role };
  if (active.classList.contains('chip') || active.classList.contains('tag-pill')) {
    return { el: active, type: 'chip', tag: active.dataset.tag };
  }
  return null;
}

function restoreFocus(e, focus) {
  if (!focus || focus.el.isConnected) return;
  let target = null;
  if (focus.type === 'task') {
    target = e.list.querySelector(`.task[data-id="${CSS.escape(focus.id)}"] [data-role="${focus.role}"]`);
  } else {
    target = e.tagRow.querySelector(`.chip[data-tag="${CSS.escape(focus.tag)}"]`);
  }
  if (!target) return;
  target.focus({ preventScroll: true });
  if (focus.role === 'handle') target.scrollIntoView({ block: 'nearest' });
}

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
  // Clicking the dimmed backdrop closes the dialog.
  dialog.addEventListener('click', (ev) => {
    if (ev.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    editingId = null;
  });
}

export function openEditor(task) {
  editingId = task.id;
  byId('edit-title').value = task.title;
  byId('edit-notes').value = task.notes;
  byId('edit-priority').value = task.priority;
  byId('edit-due').value = task.dueDate || '';
  byId('edit-tags').value = task.tags.join(', ');
  const dialog = byId('editor');
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  byId('edit-title').focus();
}
