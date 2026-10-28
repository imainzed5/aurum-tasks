// A small Markdown subset for notes, built straight into DOM nodes (never
// innerHTML), so nothing a note says can turn into markup.
//
// Blocks: # headings (1-3), - bullets, 1. numbered, - [ ] checklists,
//         > quotes, --- rules, and paragraphs that keep their line breaks.
// Inline: **bold**, *italic* or _italic_, ~~strike~~, `code`,
//         [text](https://…) and bare https:// links.
//
// Checklist items carry data-line (their line number in the note) so the
// app can tick them or turn them into tasks.

import { checklistItem } from './utils.js';

const ICON_TO_TASK =
  '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9M4 12h6M4 17h9M15 14l3 3 4-5"/></svg>';
const ICON_TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

const HEADING = /^\s{0,3}(#{1,3})\s+(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*(\d{1,9})[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;

const INLINE = new RegExp(
  [
    '`(?<code>[^`\\n]+)`',
    '\\[(?<label>[^\\]\\n]+)\\]\\((?<href>(?:https?:\\/\\/|mailto:)[^\\s)]+)\\)',
    '(?<url>https?:\\/\\/[^\\s<>()]*[^\\s<>().,;:!?\'"\\]])',
    '\\*\\*(?!\\s)(?<bold>.+?)(?<!\\s)\\*\\*',
    '~~(?!\\s)(?<strike>.+?)(?<!\\s)~~',
    '(?<![\\p{L}\\p{N}*_])(?<mark>[*_])(?![\\s*_])(?<em>.+?)(?<![\\s*_])\\k<mark>(?![\\p{L}\\p{N}*_])',
  ].join('|'),
  'gu',
);

/** Renders note text into a fragment. */
export function renderMarkdown(text) {
  const frag = document.createDocumentFragment();
  const lines = String(text || '').split('\n');
  let block = null; // the open list, paragraph or quote that lines are added to

  const open = (kind, tag, className) => {
    if (block && block.kind === kind) return block.el;
    const el = document.createElement(tag);
    if (className) el.className = className;
    frag.append(el);
    block = { kind, el };
    return el;
  };

  lines.forEach((line, index) => {
    if (!line.trim()) {
      block = null;
      return;
    }

    let match;
    const item = checklistItem(line);
    if (item) {
      open('check', 'ul', 'md-checklist').append(checklistRow(item, index));
    } else if ((match = HEADING.exec(line))) {
      block = null;
      const heading = document.createElement('p');
      heading.className = `md-h md-h${match[1].length}`;
      inline(heading, match[2]);
      frag.append(heading);
    } else if (RULE.test(line)) {
      block = null;
      frag.append(document.createElement('hr'));
    } else if ((match = BULLET.exec(line))) {
      const li = document.createElement('li');
      inline(li, match[1]);
      open('bullet', 'ul').append(li);
    } else if ((match = NUMBERED.exec(line))) {
      const isNew = !block || block.kind !== 'number';
      const list = open('number', 'ol');
      if (isNew && match[1] !== '1') list.start = Number(match[1]);
      const li = document.createElement('li');
      inline(li, match[2]);
      list.append(li);
    } else if ((match = QUOTE.exec(line))) {
      addLine(open('quote', 'blockquote'), match[1]);
    } else {
      addLine(open('para', 'p'), line.trim());
    }
  });

  return frag;
}

/** Adds a line to a paragraph or quote, with a line break after the previous one. */
function addLine(el, text) {
  if (el.childNodes.length) el.append(document.createElement('br'));
  inline(el, text);
}

function checklistRow(item, index) {
  const li = document.createElement('li');
  li.className = 'md-item';
  li.classList.toggle('is-done', item.done);

  // Only the box toggles the item. Clicking the words on a card opens the note.
  const label = document.createElement('label');
  label.className = 'md-check';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = item.done;
  input.dataset.role = 'item';
  input.dataset.line = String(index);
  const box = document.createElement('span');
  box.className = 'md-box';
  box.setAttribute('aria-hidden', 'true');
  box.insertAdjacentHTML('beforeend', ICON_TICK);
  label.append(input, box);
  const text = document.createElement('span');
  text.className = 'md-text';
  inline(text, item.text);
  li.append(label, text);
  const name = text.textContent; // the words without their ** and ` marks
  input.setAttribute('aria-label', name || 'Empty item');

  // Open items can be turned into a task.
  if (!item.done && name) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'md-to-task';
    button.dataset.action = 'to-task';
    button.dataset.role = 'to-task';
    button.dataset.line = String(index);
    button.title = 'Turn into a task';
    button.setAttribute('aria-label', `Turn “${name}” into a task`);
    button.insertAdjacentHTML('beforeend', ICON_TO_TASK);
    li.append(button);
  }
  return li;
}

/** Appends text to parent, turning inline Markdown into elements. */
function inline(parent, text) {
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) parent.append(text.slice(last, match.index));
    last = match.index + match[0].length;
    const g = match.groups;
    if (g.code !== undefined) {
      const code = document.createElement('code');
      code.textContent = g.code;
      parent.append(code);
    } else if (g.label !== undefined) {
      parent.append(link(g.href, g.label));
    } else if (g.url !== undefined) {
      parent.append(link(g.url, g.url));
    } else if (g.bold !== undefined) {
      parent.append(wrap('strong', g.bold));
    } else if (g.strike !== undefined) {
      parent.append(wrap('s', g.strike));
    } else {
      parent.append(wrap('em', g.em));
    }
  }
  if (last < text.length) parent.append(text.slice(last));
}

function wrap(tag, text) {
  const el = document.createElement(tag);
  inline(el, text);
  return el;
}

function link(href, label) {
  const a = document.createElement('a');
  a.href = href; // the pattern only lets http(s) and mailto through
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = label; // plain text, so a URL in the label can't nest a second link
  return a;
}
