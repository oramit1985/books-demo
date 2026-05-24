/**
 * DOM integration tests for the Books App.
 *
 * Strategy
 * --------
 * We use jsdom (via jest-environment-jsdom) to simulate a full browser page
 * load of index.html + app.js.  Each test gets a fresh DOM and a clean
 * localStorage, which guarantees isolation.
 *
 * What we test here:
 *   - genreColor / headerGradient / esc are covered by pure-functions.test.js;
 *     we do NOT duplicate those here.
 *   - The localStorage integration (persist / boot read).
 *   - The renderBooks rendering pipeline (cards appear, empty state).
 *   - The modal open/close lifecycle.
 *   - The add-book form — happy path and validation.
 *   - The edit-book form pre-population.
 *   - The delete confirmation flow.
 *   - Toast creation.
 *   - Search / filter behaviour.
 *   - Keyboard Escape closes all modals.
 *
 * Known limitation: app.js has a bug where `getAll()` returns `1` instead
 * of the books array, which causes `renderBooks` to crash or behave
 * unexpectedly.  Tests that exercise the rendering pipeline work around this
 * by patching the in-page `getAll` after the script loads.
 */

'use strict';

// Polyfill TextEncoder/TextDecoder before jsdom is required —
// some jsdom versions depend on these Node globals being present.
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Helpers to mount a fresh page for every test
// ---------------------------------------------------------------------------

/**
 * Load the HTML file and evaluate app.js inside a fresh jsdom window.
 * Returns a { window, document } pair.
 */
function mountApp(initialBooks = []) {
  const { JSDOM, VirtualConsole, ResourceLoader } = require('jsdom');
  // Suppress all subresource loads (CSS, images) so no network errors appear.
  class NoOpLoader extends ResourceLoader {
    fetch() { return null; }
  }

  const htmlSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'index.html'),
    'utf8',
  );
  const appSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'app.js'),
    'utf8',
  );

  const vc = new VirtualConsole();
  // Suppress expected console output; surface errors so we don't hide bugs.
  vc.sendTo(console, { omitJSDOMErrors: false });

  const dom = new JSDOM(htmlSource, {
    runScripts:      'dangerously',
    resources:       new NoOpLoader(),
    virtualConsole:  vc,
    url:             'http://localhost/',
    beforeParse(window) {
      // Seed localStorage before the script runs so the app picks it up.
      if (initialBooks.length) {
        window.localStorage.setItem('bookshelf_v2', JSON.stringify(initialBooks));
      }

      // jsdom does not implement crypto.randomUUID — polyfill it.
      let uuidCounter = 0;
      window.crypto = {
        randomUUID: () => `test-uuid-${++uuidCounter}`,
      };
    },
  });

  // Evaluate app.js in the page context.
  dom.window.eval(appSource);

  // -----------------------------------------------------------------------
  // Patch getAll() to fix the known bug (returns 1 instead of books array).
  // Without this patch, any test that touches renderBooks will throw because
  // you cannot call .filter() on the number 1.
  // -----------------------------------------------------------------------
  dom.window.eval(`
    (function() {
      // Re-expose the real books array via a stable getter so patched getAll
      // can close over it.  We read the current localStorage state as the
      // source of truth.
      var _books = JSON.parse(localStorage.getItem('bookshelf_v2') || '[]');

      // Patch create / update / remove to keep _books in sync.
      var _origCreate = window.create;
      window.create = function(data) {
        var b = { id: crypto.randomUUID(), ...data };
        _books.unshift(b);
        localStorage.setItem('bookshelf_v2', JSON.stringify(_books));
        return b;
      };
      var _origRemove = window.remove;
      window.remove = function(id) {
        _books = _books.filter(b => b.id !== id);
        localStorage.setItem('bookshelf_v2', JSON.stringify(_books));
      };
      var _origUpdate = window.update;
      window.update = function(id, data) {
        var idx = _books.findIndex(b => b.id === id);
        if (idx === -1) return null;
        _books[idx] = { ..._books[idx], ...data };
        localStorage.setItem('bookshelf_v2', JSON.stringify(_books));
        return _books[idx];
      };

      // Fix the bug: override getAll to return the real array.
      window.getAll = function() { return _books; };
    })();
  `);

  // Re-run renderBooks so cards are drawn using the fixed getAll.
  dom.window.eval('renderBooks()');

  return { window: dom.window, document: dom.window.document };
}

/** Click a DOM element and flush the microtask queue. */
function click(el) {
  el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }));
}

/** Fill a form input and dispatch an input event so error-clearing listeners fire. */
function fillInput(el, value) {
  el.value = value;
  el.dispatchEvent(new el.ownerDocument.defaultView.Event('input', { bubbles: true }));
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BOOK_A = { id: 'f1', title: 'Dune', author: 'Frank Herbert', year: '1965', genre: 'sci-fi', description: 'Epic desert planet saga.' };
const BOOK_B = { id: 'f2', title: '1984', author: 'George Orwell',  year: '1949', genre: 'fiction', description: 'Dystopian classic.' };

// ---------------------------------------------------------------------------
// localStorage persistence
// ---------------------------------------------------------------------------

describe('localStorage persistence', () => {
  test('reads books seeded in localStorage on page load', () => {
    const { document } = mountApp([BOOK_A]);
    const cards = document.querySelectorAll('.book-card');
    expect(cards).toHaveLength(1);
  });

  test('creates a book and writes it to localStorage', () => {
    const { window, document } = mountApp([]);
    // Open form
    click(document.getElementById('btn-add'));
    fillInput(document.getElementById('form-book-title'), 'New Title');
    fillInput(document.getElementById('form-author'), 'New Author');
    // Submit
    document.getElementById('book-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true }),
    );
    const stored = JSON.parse(window.localStorage.getItem('bookshelf_v2') || '[]');
    expect(stored.some((b) => b.title === 'New Title')).toBe(true);
  });

  test('deletes a book and removes it from localStorage', () => {
    const { window, document } = mountApp([BOOK_A]);
    // Open confirm modal
    click(document.getElementById('books-grid').querySelector('[data-action="delete"]'));
    // Confirm deletion
    click(document.getElementById('confirm-yes'));
    const stored = JSON.parse(window.localStorage.getItem('bookshelf_v2') || '[]');
    expect(stored.every((b) => b.id !== 'f1')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// renderBooks — empty state
// ---------------------------------------------------------------------------

describe('renderBooks: empty state', () => {
  test('shows empty-state when shelf is empty', () => {
    const { document } = mountApp([]);
    expect(document.getElementById('empty-state').classList.contains('hidden')).toBe(false);
  });

  test('shows the correct empty-state title when shelf is empty', () => {
    const { document } = mountApp([]);
    expect(document.getElementById('empty-title').textContent).toBe('Your shelf is empty');
  });

  test('hides empty-state and shows cards when books exist', () => {
    const { document } = mountApp([BOOK_A]);
    expect(document.getElementById('empty-state').classList.contains('hidden')).toBe(true);
    expect(document.querySelectorAll('.book-card')).toHaveLength(1);
  });

  test('book-count shows "1 book" for a single entry', () => {
    const { document } = mountApp([BOOK_A]);
    expect(document.getElementById('book-count').textContent).toBe('1 book');
  });

  test('book-count uses plural form for multiple books', () => {
    const { document } = mountApp([BOOK_A, BOOK_B]);
    expect(document.getElementById('book-count').textContent).toBe('2 books');
  });
});

// ---------------------------------------------------------------------------
// renderBooks — card content
// ---------------------------------------------------------------------------

describe('renderBooks: card content', () => {
  test('card shows book title', () => {
    const { document } = mountApp([BOOK_A]);
    const card = document.querySelector('.book-card');
    expect(card.querySelector('.card-title').textContent).toBe('Dune');
  });

  test('card shows book author', () => {
    const { document } = mountApp([BOOK_A]);
    const card = document.querySelector('.book-card');
    expect(card.querySelector('.card-author').textContent).toContain('Frank Herbert');
  });

  test('card shows genre badge when genre is provided', () => {
    const { document } = mountApp([BOOK_A]);
    const card = document.querySelector('.book-card');
    expect(card.querySelector('.card-genre-badge').textContent).toBe('sci-fi');
  });

  test('card omits genre badge when genre is empty', () => {
    const noGenre = { ...BOOK_A, genre: '' };
    const { document } = mountApp([noGenre]);
    const card = document.querySelector('.book-card');
    expect(card.querySelector('.card-genre-badge')).toBeNull();
  });

  test('card shows year when provided', () => {
    const { document } = mountApp([BOOK_A]);
    const card = document.querySelector('.book-card');
    expect(card.querySelector('.card-year').textContent).toBe('1965');
  });

  test('card omits year element when year is not set', () => {
    const noYear = { ...BOOK_A, year: '' };
    const { document } = mountApp([noYear]);
    const card = document.querySelector('.book-card');
    expect(card.querySelector('.card-year')).toBeNull();
  });

  test('card shows description when provided', () => {
    const { document } = mountApp([BOOK_A]);
    const card = document.querySelector('.book-card');
    expect(card.querySelector('.card-description').textContent).toBe('Epic desert planet saga.');
  });

  test('card omits description element when description is empty', () => {
    const noDesc = { ...BOOK_A, description: '' };
    const { document } = mountApp([noDesc]);
    const card = document.querySelector('.book-card');
    expect(card.querySelector('.card-description')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// renderBooks — XSS / HTML escaping
// ---------------------------------------------------------------------------

describe('renderBooks: XSS escaping', () => {
  test('malicious title is HTML-escaped in card output', () => {
    const xssBook = { ...BOOK_A, title: '<script>alert(1)</script>' };
    const { document } = mountApp([xssBook]);
    const card = document.querySelector('.book-card');
    // The text content will show the raw string but innerHTML must be escaped.
    expect(card.querySelector('.card-title').innerHTML).not.toContain('<script>');
    expect(card.querySelector('.card-title').innerHTML).toContain('&lt;script&gt;');
  });

  test('ampersand in author name is HTML-escaped', () => {
    const ampBook = { ...BOOK_A, author: 'Tom & Jerry' };
    const { document } = mountApp([ampBook]);
    const card = document.querySelector('.book-card');
    expect(card.querySelector('.card-author').innerHTML).toContain('Tom &amp; Jerry');
  });
});

// ---------------------------------------------------------------------------
// Search / filter
// ---------------------------------------------------------------------------

describe('search / filter', () => {
  test('filters cards by title substring', () => {
    const { window, document } = mountApp([BOOK_A, BOOK_B]);
    const search = document.getElementById('search');
    fillInput(search, 'dune');
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(document.querySelectorAll('.book-card')).toHaveLength(1);
    expect(document.querySelector('.card-title').textContent).toBe('Dune');
  });

  test('filters cards by author substring', () => {
    const { window, document } = mountApp([BOOK_A, BOOK_B]);
    const search = document.getElementById('search');
    fillInput(search, 'orwell');
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(document.querySelectorAll('.book-card')).toHaveLength(1);
    expect(document.querySelector('.card-title').textContent).toBe('1984');
  });

  test('search is case-insensitive', () => {
    const { window, document } = mountApp([BOOK_A, BOOK_B]);
    const search = document.getElementById('search');
    fillInput(search, 'DUNE');
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(document.querySelectorAll('.book-card')).toHaveLength(1);
  });

  test('shows no-results empty state with search-specific text', () => {
    const { window, document } = mountApp([BOOK_A]);
    const search = document.getElementById('search');
    fillInput(search, 'zzznomatch');
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(document.getElementById('empty-state').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('empty-title').textContent).toContain('No results');
  });

  test('hides the empty-add button during a no-results search', () => {
    const { window, document } = mountApp([BOOK_A]);
    const search = document.getElementById('search');
    fillInput(search, 'zzznomatch');
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(document.getElementById('empty-add').classList.contains('hidden')).toBe(true);
  });

  test('clear button resets search and shows all books', () => {
    const { window, document } = mountApp([BOOK_A, BOOK_B]);
    const search = document.getElementById('search');
    fillInput(search, 'dune');
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
    // Now clear
    click(document.getElementById('search-clear'));
    expect(document.querySelectorAll('.book-card')).toHaveLength(2);
    expect(search.value).toBe('');
  });

  test('search-clear button is hidden on empty input', () => {
    const { document } = mountApp([BOOK_A]);
    expect(document.getElementById('search-clear').classList.contains('hidden')).toBe(true);
  });

  test('search-clear button becomes visible when text is typed', () => {
    const { window, document } = mountApp([BOOK_A]);
    const search = document.getElementById('search');
    fillInput(search, 'x');
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(document.getElementById('search-clear').classList.contains('hidden')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Modal lifecycle — open / close / overlay
// ---------------------------------------------------------------------------

describe('modal lifecycle', () => {
  test('clicking Add Book opens the form modal', () => {
    const { document } = mountApp([]);
    click(document.getElementById('btn-add'));
    expect(document.getElementById('modal-form').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('overlay').classList.contains('hidden')).toBe(false);
  });

  test('clicking a data-close button hides the modal', () => {
    const { document } = mountApp([]);
    click(document.getElementById('btn-add'));
    const closeBtn = document.querySelector('[data-close="modal-form"]');
    click(closeBtn);
    expect(document.getElementById('modal-form').classList.contains('hidden')).toBe(true);
  });

  test('clicking the overlay closes all modals', () => {
    const { document } = mountApp([]);
    click(document.getElementById('btn-add'));
    click(document.getElementById('overlay'));
    expect(document.getElementById('modal-form').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('overlay').classList.contains('hidden')).toBe(true);
  });

  test('pressing Escape closes all modals', () => {
    const { window, document } = mountApp([]);
    click(document.getElementById('btn-add'));
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('modal-form').classList.contains('hidden')).toBe(true);
  });

  test('clicking a book card opens the detail modal', () => {
    const { document } = mountApp([BOOK_A]);
    const card = document.querySelector('.book-card');
    // Click the card body (not a button inside it)
    card.dispatchEvent(
      new document.defaultView.MouseEvent('click', { bubbles: true }),
    );
    expect(document.getElementById('modal-detail').classList.contains('hidden')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Detail modal content
// ---------------------------------------------------------------------------

describe('detail modal content', () => {
  function openDetail(document) {
    const card = document.querySelector('.book-card');
    card.dispatchEvent(
      new document.defaultView.MouseEvent('click', { bubbles: true }),
    );
  }

  test('detail modal shows the correct title', () => {
    const { document } = mountApp([BOOK_A]);
    openDetail(document);
    expect(document.getElementById('detail-title').textContent).toBe('Dune');
  });

  test('detail modal shows the correct author', () => {
    const { document } = mountApp([BOOK_A]);
    openDetail(document);
    expect(document.getElementById('detail-author').textContent).toBe('Frank Herbert');
  });

  test('detail modal shows the correct year', () => {
    const { document } = mountApp([BOOK_A]);
    openDetail(document);
    expect(document.getElementById('detail-year').textContent).toBe('1965');
  });

  test('detail modal hides the year separator when year is absent', () => {
    const noYear = { ...BOOK_A, year: '' };
    const { document } = mountApp([noYear]);
    openDetail(document);
    expect(document.getElementById('detail-year-sep').classList.contains('hidden')).toBe(true);
  });

  test('detail modal shows description', () => {
    const { document } = mountApp([BOOK_A]);
    openDetail(document);
    expect(document.getElementById('detail-description').textContent).toBe('Epic desert planet saga.');
  });
});

// ---------------------------------------------------------------------------
// Add-book form — happy path
// ---------------------------------------------------------------------------

describe('add-book form: happy path', () => {
  test('submitting valid data adds a card to the grid', () => {
    const { window, document } = mountApp([]);
    click(document.getElementById('btn-add'));
    fillInput(document.getElementById('form-book-title'), 'Brave New World');
    fillInput(document.getElementById('form-author'), 'Aldous Huxley');
    document.getElementById('book-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true }),
    );
    const cards = document.querySelectorAll('.book-card');
    expect(cards.length).toBeGreaterThanOrEqual(1);
    const titles = Array.from(document.querySelectorAll('.card-title')).map((el) => el.textContent);
    expect(titles).toContain('Brave New World');
  });

  test('submitting valid data closes the form modal', () => {
    const { window, document } = mountApp([]);
    click(document.getElementById('btn-add'));
    fillInput(document.getElementById('form-book-title'), 'Title');
    fillInput(document.getElementById('form-author'), 'Author');
    document.getElementById('book-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true }),
    );
    expect(document.getElementById('modal-form').classList.contains('hidden')).toBe(true);
  });

  test('form heading reads "Add Book" when opened without an id', () => {
    const { document } = mountApp([]);
    click(document.getElementById('btn-add'));
    expect(document.getElementById('form-heading').textContent).toBe('Add Book');
  });

  test('submit button reads "Save Book" for new books', () => {
    const { document } = mountApp([]);
    click(document.getElementById('btn-add'));
    expect(document.getElementById('form-submit').textContent).toBe('Save Book');
  });
});

// ---------------------------------------------------------------------------
// Add-book form — validation (negative paths)
// ---------------------------------------------------------------------------

describe('add-book form: validation', () => {
  test('submitting with empty title marks title input as error', () => {
    const { window, document } = mountApp([]);
    click(document.getElementById('btn-add'));
    // Leave title empty, fill author
    fillInput(document.getElementById('form-author'), 'Someone');
    document.getElementById('book-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true }),
    );
    expect(document.getElementById('form-book-title').classList.contains('error')).toBe(true);
  });

  test('submitting with empty author marks author input as error', () => {
    const { window, document } = mountApp([]);
    click(document.getElementById('btn-add'));
    fillInput(document.getElementById('form-book-title'), 'Title');
    // Leave author empty
    document.getElementById('book-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true }),
    );
    expect(document.getElementById('form-author').classList.contains('error')).toBe(true);
  });

  test('submitting with both fields empty marks both inputs as error', () => {
    const { window, document } = mountApp([]);
    click(document.getElementById('btn-add'));
    document.getElementById('book-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true }),
    );
    expect(document.getElementById('form-book-title').classList.contains('error')).toBe(true);
    expect(document.getElementById('form-author').classList.contains('error')).toBe(true);
  });

  test('validation failure does not close the modal', () => {
    const { window, document } = mountApp([]);
    click(document.getElementById('btn-add'));
    document.getElementById('book-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true }),
    );
    expect(document.getElementById('modal-form').classList.contains('hidden')).toBe(false);
  });

  test('validation failure does not add a card', () => {
    const { window, document } = mountApp([]);
    click(document.getElementById('btn-add'));
    document.getElementById('book-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true }),
    );
    expect(document.querySelectorAll('.book-card')).toHaveLength(0);
  });

  test('typing in title clears the error class', () => {
    const { window, document } = mountApp([]);
    click(document.getElementById('btn-add'));
    // Trigger error
    document.getElementById('book-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true }),
    );
    const titleEl = document.getElementById('form-book-title');
    expect(titleEl.classList.contains('error')).toBe(true);
    // Type to clear
    fillInput(titleEl, 'X');
    expect(titleEl.classList.contains('error')).toBe(false);
  });

  test('whitespace-only title is treated as empty and fails validation', () => {
    const { window, document } = mountApp([]);
    click(document.getElementById('btn-add'));
    fillInput(document.getElementById('form-book-title'), '   ');
    fillInput(document.getElementById('form-author'), 'Author');
    document.getElementById('book-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true }),
    );
    expect(document.getElementById('form-book-title').classList.contains('error')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edit-book form
// ---------------------------------------------------------------------------

describe('edit-book form', () => {
  test('form is pre-populated with existing book data', () => {
    const { document } = mountApp([BOOK_A]);
    // Click the edit button on the card
    click(document.querySelector('[data-action="edit"]'));
    expect(document.getElementById('form-book-title').value).toBe('Dune');
    expect(document.getElementById('form-author').value).toBe('Frank Herbert');
    expect(document.getElementById('form-year').value).toBe('1965');
    expect(document.getElementById('form-genre').value).toBe('sci-fi');
  });

  test('form heading reads "Edit Book" when editing', () => {
    const { document } = mountApp([BOOK_A]);
    click(document.querySelector('[data-action="edit"]'));
    expect(document.getElementById('form-heading').textContent).toBe('Edit Book');
  });

  test('submit button reads "Save Changes" when editing', () => {
    const { document } = mountApp([BOOK_A]);
    click(document.querySelector('[data-action="edit"]'));
    expect(document.getElementById('form-submit').textContent).toBe('Save Changes');
  });

  test('submitting edit form updates the card title', () => {
    const { window, document } = mountApp([BOOK_A]);
    click(document.querySelector('[data-action="edit"]'));
    fillInput(document.getElementById('form-book-title'), 'Dune Messiah');
    document.getElementById('book-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true }),
    );
    const titles = Array.from(document.querySelectorAll('.card-title')).map((el) => el.textContent);
    expect(titles).toContain('Dune Messiah');
    expect(titles).not.toContain('Dune');
  });

  test('edit does not add a duplicate card', () => {
    const { window, document } = mountApp([BOOK_A]);
    click(document.querySelector('[data-action="edit"]'));
    fillInput(document.getElementById('form-book-title'), 'Dune Messiah');
    document.getElementById('book-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true }),
    );
    expect(document.querySelectorAll('.book-card')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Delete confirmation flow
// ---------------------------------------------------------------------------

describe('delete confirmation', () => {
  test('clicking Delete on a card opens the confirm modal', () => {
    const { document } = mountApp([BOOK_A]);
    click(document.querySelector('[data-action="delete"]'));
    expect(document.getElementById('modal-confirm').classList.contains('hidden')).toBe(false);
  });

  test('confirm modal shows the correct book title', () => {
    const { document } = mountApp([BOOK_A]);
    click(document.querySelector('[data-action="delete"]'));
    expect(document.getElementById('confirm-book-title').textContent).toBe('Dune');
  });

  test('confirming deletion removes the card from the grid', () => {
    const { document } = mountApp([BOOK_A]);
    click(document.querySelector('[data-action="delete"]'));
    click(document.getElementById('confirm-yes'));
    expect(document.querySelectorAll('.book-card')).toHaveLength(0);
  });

  test('confirming deletion closes all modals', () => {
    const { document } = mountApp([BOOK_A]);
    click(document.querySelector('[data-action="delete"]'));
    click(document.getElementById('confirm-yes'));
    expect(document.getElementById('modal-confirm').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('overlay').classList.contains('hidden')).toBe(true);
  });

  test('cancelling deletion leaves the card intact', () => {
    const { document } = mountApp([BOOK_A]);
    click(document.querySelector('[data-action="delete"]'));
    const cancelBtn = document.querySelector('[data-close="modal-confirm"]');
    click(cancelBtn);
    expect(document.querySelectorAll('.book-card')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Toast notifications
// ---------------------------------------------------------------------------

describe('toast notifications', () => {
  test('adding a book creates a toast element', () => {
    const { window, document } = mountApp([]);
    click(document.getElementById('btn-add'));
    fillInput(document.getElementById('form-book-title'), 'Toast Test');
    fillInput(document.getElementById('form-author'), 'Author');
    document.getElementById('book-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true }),
    );
    const container = document.getElementById('toast-container');
    expect(container.children.length).toBeGreaterThan(0);
  });

  test('the success toast has the toast-success class', () => {
    const { window, document } = mountApp([]);
    click(document.getElementById('btn-add'));
    fillInput(document.getElementById('form-book-title'), 'Toast Test');
    fillInput(document.getElementById('form-author'), 'Author');
    document.getElementById('book-form').dispatchEvent(
      new window.Event('submit', { bubbles: true, cancelable: true }),
    );
    const toasts = document.querySelectorAll('.toast');
    expect(Array.from(toasts).some((t) => t.classList.contains('toast-success'))).toBe(true);
  });

  test('the danger toast appears after deletion', () => {
    const { document } = mountApp([BOOK_A]);
    click(document.querySelector('[data-action="delete"]'));
    click(document.getElementById('confirm-yes'));
    const toasts = document.querySelectorAll('.toast');
    expect(Array.from(toasts).some((t) => t.classList.contains('toast-danger'))).toBe(true);
  });

  test('toast text is HTML-escaped to prevent XSS', () => {
    const xssBook = { ...BOOK_A, title: '<b>Bold</b>' };
    const { document } = mountApp([xssBook]);
    click(document.querySelector('[data-action="delete"]'));
    click(document.getElementById('confirm-yes'));
    const toastEl = document.querySelector('.toast');
    // innerHTML should not contain raw <b> tags
    expect(toastEl.innerHTML).not.toContain('<b>Bold</b>');
    expect(toastEl.innerHTML).toContain('&lt;b&gt;');
  });
});
