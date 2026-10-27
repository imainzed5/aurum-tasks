# Aurum Tasks

A clean, gold-accented todo list built with plain HTML, CSS and JavaScript. No framework and no build step, so it deploys straight to GitHub Pages.

![Aurum Tasks screenshot](docs/screenshot.png)

**Live demo:** `https://YOUR-USERNAME.github.io/aurum-tasks/` (replace with your link after deploying)

## Features

- **Tasks:** add, edit, complete and delete, with Undo after deleting or clearing
- **Quick-add syntax:** type `Send report #work !high @fri` and the tag, priority and due date fill themselves in
- **Priorities, due dates and tags**, with overdue tasks in red and today's tasks in amber
- **Filters:** All / Active / Done, one-click tag chips, live search, and four sort orders
- **Drag to reorder** with a mouse or on a touch screen, plus arrow keys for keyboard users
- **Daily summary:** greeting, progress ring, and counts for overdue, due today and high priority
- **Light and dark themes**, remembered between visits
- **Export / import** your tasks as a JSON file for backup or moving to another browser
- **Saves automatically** in the browser (localStorage) and stays in sync across open tabs
- **Responsive and accessible:** works on phones, labelled for screen readers, visible focus states, respects reduced motion

## Quick-add syntax

| Type in the title | What it does |
| --- | --- |
| `#work` | Adds the tag "work" (use as many as you like) |
| `!high`, `!med`, `!low` (or `!h`, `!m`, `!l`) | Sets the priority |
| `@today`, `@tomorrow` (`@tmr`) | Sets the due date |
| `@mon` … `@sun`, `@friday` | Due on the next one of that weekday |
| `@nextweek` | Due 7 days from today |

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `N` | Jump to the new-task box |
| `/` | Jump to search |
| `Esc` | Clear search / leave a field |
| `↑` `↓` on a task's handle | Move the task up or down |
| Double-click a task | Edit it |

## Project structure

```
aurum-tasks/
├── index.html        Page layout, the task row template and the edit dialog
├── css/
│   └── style.css     Design tokens (colours, fonts) and all styles, light + dark
├── js/
│   ├── app.js        Entry point: wires clicks, keys and drag-and-drop to the store
│   ├── store.js      State, saving to localStorage, filtering, sorting, import/export
│   ├── ui.js         Renders the page from state; toast and edit dialog
│   └── utils.js      Date helpers, tag parsing, quick-add parser
└── docs/
    └── screenshot.png
```

### How the code fits together

The app follows a simple one-way data flow:

1. A user action (click, key, drag) is handled in `app.js`.
2. `app.js` calls a function in `store.js`, such as `addTask()` or `setFilter()`.
3. The store updates its state, saves it to localStorage and notifies subscribers.
4. `ui.js` re-renders the page from the new state.

The UI never changes data directly, which keeps the logic in one place and easy to test.

### Task data model

```js
{
  id: "c1f8…",              // crypto.randomUUID()
  title: "Submit weekly report",
  notes: "",
  done: false,
  priority: "high",          // "low" | "medium" | "high"
  dueDate: "2026-10-30",     // local date string, or null
  tags: ["work"],
  createdAt: 1761525180000,  // timestamp
  completedAt: null
}
```

## Run it locally

The JavaScript uses ES modules, which browsers will not load from a `file://` path. Serve the folder instead:

- **VS Code:** install the *Live Server* extension, right-click `index.html`, choose **Open with Live Server**.
- **Python:** run `python -m http.server 8000` in this folder, then open <http://localhost:8000>.

## Deploy to GitHub Pages

1. Create a new **public** repository on GitHub named `aurum-tasks`.
2. In this folder, run:

   ```bash
   git init
   git add .
   git commit -m "Initial commit: Aurum Tasks"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/aurum-tasks.git
   git push -u origin main
   ```

3. On GitHub, open the repo's **Settings → Pages**.
4. Under **Build and deployment**, set **Source** to *Deploy from a branch*, choose branch `main` and folder `/ (root)`, then **Save**.
5. After a minute or two the site is live at `https://YOUR-USERNAME.github.io/aurum-tasks/`.

Every later `git push` to `main` redeploys the site automatically.

## Build roadmap

- [x] Phase 1: Repo setup and first deploy
- [x] Phase 2: Add, edit, complete, delete, with saving
- [x] Phase 3: Filters, search and sorting
- [x] Phase 4: Priority, due dates and tags
- [x] Phase 5: Theme toggle, drag-and-drop, export/import, mobile layout
- [x] Phase 6: README and screenshot

### Ideas for next steps

- Install as an app and work offline (PWA: web manifest + service worker)
- Subtasks or checklists inside a task
- Recurring tasks (every Monday, every month)
- Accounts and cloud sync with Firebase or Supabase
- Unit tests for `utils.js` and `store.js` with Vitest

## Credits

- Colour palette inspired by the Alpha Premier Group website.
- Fonts: [Michroma](https://fonts.google.com/specimen/Michroma) and [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) from Google Fonts (SIL Open Font License).
