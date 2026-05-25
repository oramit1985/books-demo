# Books App — Claude Guide

## Project overview

A vanilla JS/HTML/CSS bookshelf app with no build step. All logic lives in `app.js`, styling in `style.css`, markup in `index.html`. Data is persisted to `localStorage` via a `BooksStore` class.

## Architecture

| File | Purpose |
|------|---------|
| `app.js` | All application logic — `BooksStore` class, rendering, modals, form handling, search, toast notifications |
| `index.html` | Static markup; all modal templates are inline |
| `style.css` | All styles; uses CSS custom properties (`--card-accent`) for genre-based theming |
| `tests/` | Jest unit tests (jsdom) |

### Key conventions
- **No framework, no bundler.** Keep it that way unless explicitly asked.
- **`BooksStore`** owns all `localStorage` reads/writes. Never call `localStorage` directly elsewhere in `app.js`.
- **`esc()`** must be used for every user-supplied string injected into `innerHTML`. Never skip it.
- `GENRE_COLORS` and `GRADIENT_MAP` are the single source of truth for color theming. Adding a new genre means adding entries to both.

## GitHub Actions workflows

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `run-tests.yml` | PR open / push | Runs Jest suite |
| `code-review.yml` | PR open / push | Posts a markdown summary comment + inline review comments via Claude |
| `pr-fixer.yml` | After `code-review.yml` completes | Reads all review comments, calls Claude, opens a fix PR targeting the original branch |

### Required secrets
- `ANTHROPIC_API_KEY` — used by `code-review.yml` and `pr-fixer.yml`
- `GITHUB_TOKEN` — standard Actions token; needs `pull-requests: write` and `contents: write`

## Claude Code skills

| Skill | Location | Used by |
|-------|----------|---------|
| `code-review` | `.claude/skills/code-review/SKILL.md` | `code-review.yml` (system prompt for the review job) |
| `pr-fixer` | `.claude/skills/pr-fixer/SKILL.md` | `pr-fixer.yml` (system prompt for the fix job) |

## Testing

```bash
npm test            # run full Jest suite
npx jest --watch    # watch mode
```

Tests use jsdom and mock `localStorage`. All tests live under `tests/`.

## Common tasks

**Add a new genre:**
1. Add an entry to `GENRE_COLORS` in `app.js`
2. Add a matching entry to `GRADIENT_MAP` in `app.js`

**Add a new book field:**
1. Add the input to the form in `index.html`
2. Read it in the `submit` handler in `app.js`
3. Render it in `renderBooks()` and `openDetail()` — remember to escape with `esc()`

**Update the AI review prompt:**
Edit `.claude/skills/code-review/SKILL.md` — changes take effect on the next PR.

**Update the AI fixer prompt:**
Edit `.claude/skills/pr-fixer/SKILL.md` — changes take effect on the next review cycle.
