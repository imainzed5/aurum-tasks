// Small, dependency-free helpers shared by the store and the UI.

export const pad = (n) => String(n).padStart(2, '0');

/** Unique id for a task. Falls back to a timestamp id on older browsers. */
export function uid() {
  if (globalThis.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function truncate(text, max = 40) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Delays fn until calls stop for `ms`. Call `.cancel()` to drop a pending call. */
export function debounce(fn, ms) {
  let timer;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

/* ---------- Dates ----------
   Due dates are stored as plain "YYYY-MM-DD" strings in local time,
   so a task due "today" stays due today whatever the time zone. */

export function toISODate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** True only for a real calendar date in "YYYY-MM-DD" form, so "2026-02-30" is rejected. */
export function isISODate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && toISODate(fromISODate(value)) === value;
}

export const todayISO = () => toISODate(new Date());

export function addDaysISO(iso, days) {
  const date = fromISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/** Whole days from today to the given date: 0 = today, -1 = yesterday. */
export function daysFromToday(iso) {
  if (!iso) return null;
  return Math.round((fromISODate(iso) - fromISODate(todayISO())) / 86_400_000);
}

export function formatShortDate(iso) {
  const date = fromISODate(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** Human label for a due date: "Today", "Tomorrow", "Friday", "3 days overdue"… */
export function formatDue(iso) {
  const diff = daysFromToday(iso);
  if (diff === null) return '';
  if (diff < -1) return `${-diff} days overdue`;
  if (diff === -1) return 'Yesterday';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 7) return fromISODate(iso).toLocaleDateString(undefined, { weekday: 'long' });
  return formatShortDate(iso);
}

export function formatLongDate(date = new Date()) {
  const weekday = date.toLocaleDateString(undefined, { weekday: 'long' });
  const dayMonth = date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
  return `${weekday} · ${dayMonth}`;
}

export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/* ---------- Tags ---------- */

/** "Work, #school  urgent" -> ["work", "school", "urgent"] */
export function parseTags(text) {
  if (!text) return [];
  const tags = [];
  for (const raw of String(text).split(/[,\s]+/)) {
    const tag = raw.replace(/^#+/, '').toLowerCase().replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 24);
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags.slice(0, 8);
}

/* ---------- Quick-add syntax ----------
   "Send report #work !high @fri" ->
   { title: "Send report", tags: ["work"], priority: "high", dueDate: "<next Friday>" } */

const PRIORITY_WORDS = { h: 'high', high: 'high', m: 'medium', med: 'medium', medium: 'medium', l: 'low', low: 'low' };
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function resolveDateWord(word) {
  const w = word.toLowerCase();
  const today = todayISO();
  if (w === 'today' || w === 'tod') return today;
  if (w === 'tomorrow' || w === 'tmr' || w === 'tom') return addDaysISO(today, 1);
  if (w === 'nextweek') return addDaysISO(today, 7);
  const index = WEEKDAYS.findIndex((day) => day === w || day.slice(0, 3) === w);
  if (index === -1) return null;
  const ahead = (index - fromISODate(today).getDay() + 7) % 7; // the next one, or today
  return addDaysISO(today, ahead);
}

export function parseQuickAdd(text) {
  const tags = [];
  let priority = null;
  let dueDate = null;

  let title = String(text || '')
    .replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, (_, space, tag) => {
      const clean = tag.toLowerCase().slice(0, 24);
      if (!tags.includes(clean)) tags.push(clean);
      return space;
    })
    .replace(/(^|\s)!(high|medium|med|low|h|m|l)(?=\s|$)/gi, (_, space, word) => {
      priority = PRIORITY_WORDS[word.toLowerCase()];
      return space;
    })
    .replace(/(^|\s)@([a-z]+)(?=\s|$)/gi, (match, space, word) => {
      const iso = resolveDateWord(word);
      if (!iso) return match; // leave unknown @words in the title
      dueDate = iso;
      return space;
    });

  title = title.replace(/\s+/g, ' ').trim();
  return { title, tags, priority, dueDate };
}
