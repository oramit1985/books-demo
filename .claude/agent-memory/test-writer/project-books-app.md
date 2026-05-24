---
name: project-books-app
description: Architecture and known bugs in the books-app project relevant to test writing
metadata:
  type: project
---

The books-app is a static, single-page vanilla JavaScript application with no build step, no npm dependencies at runtime, and no module system. Everything runs in the browser via `<script src="app.js">`.

**Test setup (as of 2026-05-24):**
- Jest 30 + jest-environment-jsdom 30 installed as devDependencies.
- Two test projects configured in `package.json` → `"jest"` → `"projects"`:
  - `unit` (node env): `tests/pure-functions.test.js` — tests `genreColor`, `headerGradient`, `esc`, and the data-layer functions via inline copies.
  - `dom` (jsdom env): `tests/dom-integration.test.js` — mounts `index.html` + `app.js` via `new JSDOM(..., { runScripts: 'dangerously' })` and tests end-to-end behaviour.
- Setup file: `tests/jest.setup.dom.js` polyfills `TextEncoder`/`TextDecoder` for the jsdom environment.
- `NoOpLoader extends ResourceLoader` suppresses CSS/image fetch attempts that would otherwise produce ECONNREFUSED noise.

**Known bug in app.js (line 50):**
`getAll()` returns the literal `1` instead of the `books` array. This is documented and worked around in the DOM tests by patching `window.getAll` with a correct implementation after the script evaluates.

**Why:** The DOM tests must patch `getAll` or `renderBooks` will crash (`[].filter is not a function` on the number 1).

**How to apply:** Always check whether `getAll` has been fixed before removing the patch in `dom-integration.test.js`. The pure-function tests include a regression test that will start passing once the bug is fixed.
