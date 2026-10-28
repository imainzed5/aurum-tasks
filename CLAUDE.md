# Aurum Tasks: notes for Claude Code

Context for any Claude Code session working on this repo. It carries over the decisions made while the app was first built in a Claude chat.

## What this is

An internship portfolio project: a todo list web app that is "simple but not too basic", published on GitHub Pages. It also has a Notes view (added after the first release).

## Hard constraints

- **Plain HTML, CSS and JavaScript (ES modules). No framework, no bundler, no build step.** GitHub Pages serves the files as they are.
- **Static hosting only.** There is no backend. Data lives in `localStorage`.
- ES modules don't load from `file://` (the page shows `#file-note` there instead). Test with `node serve.mjs` (no dependencies; Python isn't installed on the owner's machine) or VS Code Live Server.

## Design direction (from the owner)

- Palette comes from https://alphapremiergroup.com (black and gold), but the owner asked that it **not be too dark**. The light theme is the default; the dark theme is warm brown, not pitch black.
- Gold: `#D4AF37`, `#C5A059`, light `#E2C285`, cream `#FFF3D1`, deep `#AA7C11`. Gradient: `#FFF3D1 → #D4AF37 → #AA7C11`. Warm blacks: `#1A1408`, `#0A0803`.
- Fonts: **Michroma** for the display face (used sparingly: brand, eyebrow, big numbers, small uppercase labels with wide letter-spacing) and **Plus Jakarta Sans** for everything else.
- The one dark element on the light page is the summary panel at the top (the brand moment). Keep the rest light and quiet.
- Every colour is a CSS custom property in `:root`. Dark values are repeated in both `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` and `:root[data-theme="dark"]`. Don't hard-code colours in component rules.
- Small-text gold on light backgrounds uses `--gold-text` (`#8C6A14`) for contrast; plain gold is for borders, dots and large shapes.

## Architecture

One-way data flow:

1. `js/app.js` handles events (clicks, keys, drag) and calls the store.
2. `js/store.js` is the **only** place state changes. It saves to localStorage and notifies subscribers.
3. `js/ui.js` re-renders from state. The task list is rebuilt on every change, and `rememberFocus` / `restoreFocus` put keyboard focus back on the matching control.
4. `js/utils.js` holds pure helpers: dates, tag parsing, the quick-add parser, and checklist-line helpers.
5. `js/markdown.js` renders the note Markdown subset straight into DOM nodes. It is the only Markdown code; keep it DOM-built, never `innerHTML`.

Conventions:

- All task input (forms, imports, saved data) goes through `normalizeTask()` in `store.js`; all note input goes through `normalizeNote()`.
- Storage keys: `aurum-tasks:tasks`, `aurum-tasks:notes`, `aurum-tasks:prefs` (filter, sort, tag, samplesDismissed, noteSort, noteTag, noteSamplesDismissed), `aurum-tasks:theme`.
- Export files are version 2 (`{ tasks, notes }`). Import still accepts version 1 files and plain task arrays.
- Due dates are local `YYYY-MM-DD` strings, never `Date` objects in storage.
- No `alert()` / `confirm()`. Destructive actions happen immediately and show a toast with **Undo**.
- Build DOM with `textContent` / `createElement`, never by interpolating user text into HTML.

## Behaviour decisions already made

- First visit seeds 8 sample tasks (flag `sample: true`) with a banner offering "Clear samples" or "Keep them". Editing a sample makes it the user's own (`sample: false`).
- New tasks go to the top. If a filter or search would hide a new task, the view resets to All.
- Ticking a task updates the row instantly, then commits after 220 ms so the check animation plays.
- Drag-to-reorder uses pointer events (mouse and touch). The dragged row is never moved in the DOM (that would drop pointer capture); its neighbours move around it. Reordering only works in "Manual order"; arrow keys on a focused handle also reorder.
- Reordering while filtered keeps hidden tasks in place (`reorderVisible`).
- In sorted views, completed tasks sink to the bottom.
- On phones (≤560px or no hover) the edit/delete icons are hidden and tapping a task opens the editor, which has Delete.

## Notes view (decisions made with the owner)

- A Tasks / Notes switch in the top bar: two links, `#tasks` and `#notes`. The URL hash is the source of truth for the view (`state.view` is not saved to localStorage). The summary panel stays the same in both views.
- Notes are a card grid (Keep-style), pinned notes first under "Pinned" / "Others" labels. Clicking a card opens a dialog that saves as you type (debounced text, everything else immediate). Only edits to title, text or tags move `updatedAt`.
- The note composer collapses to a title box and opens a text box on focus. `#tags` in the title become tags. Enter in the title moves to the text; Ctrl+Enter adds.
- A note needs a title or text. Emptying a note in the dialog removes it on close, with Undo.
- Light Markdown only (see README). Checklist items tick on the card; only the box toggles, clicking the words opens the note. The dialog has Write / Preview; in Preview the store is the source of truth and render copies the saved text back into the hidden textarea.
- "Turn into a task" moves an open checklist line out of the note into Tasks (quick-add parsed, inherits the note's tags), with Undo. A note left empty by that is removed.
- A note links to at most one task (`note.taskId`). Task rows show a chip per linked note; note cards show a chip for the task. Deleting a task leaves `taskId` alone so Undo restores the link; dangling links just don't render.
- Five card colours (gold, sage, clay, rose, dusk) as `--note-*` tokens in all three `:root` blocks.
- While a modal dialog is open the toast moves inside it (the rest of the page is inert), and moves back on close.
- Chromium fires a dialog's `close` event on the next animation frame, so in a hidden or headless page it can lag; take a screenshot to force a frame when testing.

## Status

All planned phases are done: core CRUD with saving, filters/search/sort, priority/due/tags, theme toggle, drag-and-drop, export/import, mobile layout, README with screenshot, and the Notes view (README has a second screenshot, `docs/screenshot-notes.png`). It was checked in headless Chromium (43 checks: features, persistence, import/export, shortcuts, no console errors, no horizontal scroll on mobile in both themes).

Published: the repo is https://github.com/imainzed5/aurum-tasks (public), and GitHub Pages serves `main` at https://imainzed5.github.io/aurum-tasks/. Every push to `main` redeploys.

Ideas for later: PWA/offline, subtasks, recurring tasks, cloud sync (Firebase/Supabase), Vitest unit tests for `utils.js` and `store.js`.
