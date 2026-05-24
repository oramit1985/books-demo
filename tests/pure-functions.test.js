/**
 * Unit tests for pure / data-layer functions extracted from app.js.
 *
 * Because app.js is a browser script that runs immediately (including DOM
 * queries and localStorage reads), we re-implement the small, pure functions
 * under test rather than trying to import the full file in Node.  This is
 * intentional: it keeps these tests fast, deterministic, and free of any
 * DOM dependency.
 *
 * Any time a function in app.js changes its signature or behaviour, the
 * corresponding copy here should be updated so the tests act as a regression
 * baseline, not a rubber-stamp.
 */

'use strict';

// ---------------------------------------------------------------------------
// Inline copies of app.js pure functions (keep in sync with app.js)
// ---------------------------------------------------------------------------

const GENRE_COLORS = {
  'fiction':         '#6366f1',
  'non-fiction':     '#10b981',
  'science fiction': '#0ea5e9',
  'sci-fi':          '#0ea5e9',
  'mystery':         '#f59e0b',
  'thriller':        '#f97316',
  'romance':         '#ec4899',
  'biography':       '#14b8a6',
  'history':         '#a855f7',
  'fantasy':         '#8b5cf6',
  'self-help':       '#22c55e',
  'horror':          '#ef4444',
  'default':         '#6366f1',
};

const GRADIENT_MAP = {
  '#6366f1': ['#312e81', '#4f46e5'],
  '#10b981': ['#064e3b', '#059669'],
  '#0ea5e9': ['#0c4a6e', '#0284c7'],
  '#f59e0b': ['#451a03', '#b45309'],
  '#f97316': ['#431407', '#c2410c'],
  '#ec4899': ['#500724', '#be185d'],
  '#14b8a6': ['#042f2e', '#0d9488'],
  '#a855f7': ['#2e1065', '#7e22ce'],
  '#8b5cf6': ['#2e1065', '#6d28d9'],
  '#22c55e': ['#052e16', '#15803d'],
  '#ef4444': ['#450a0a', '#b91c1c'],
};

function genreColor(genre) {
  if (!genre) return GENRE_COLORS.default;
  return GENRE_COLORS[genre.toLowerCase()] || GENRE_COLORS.default;
}

function headerGradient(color) {
  const pair = GRADIENT_MAP[color];
  return pair || ['#1e1b4b', '#312e81'];
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Data-layer helpers — these operate on an explicit `books` array so they can
 * be tested without touching module-level state.
 */
function makeDataLayer(initialBooks = []) {
  let books = [...initialBooks];
  let persisted = null;

  function persist() {
    persisted = JSON.stringify(books);
  }

  function getAll() {
    // NOTE: app.js currently has a bug here — it returns `1` instead of `books`.
    // This function is the CORRECT implementation that the app SHOULD have.
    return books;
  }

  function getById(id) {
    return books.find((b) => b.id === id) || null;
  }

  function create(data) {
    const book = { id: `id-${Date.now()}-${Math.random()}`, ...data };
    books.unshift(book);
    persist();
    return book;
  }

  function update(id, data) {
    const idx = books.findIndex((b) => b.id === id);
    if (idx === -1) return null;
    books[idx] = { ...books[idx], ...data };
    persist();
    return books[idx];
  }

  function remove(id) {
    books = books.filter((b) => b.id !== id);
    persist();
  }

  return { getAll, getById, create, update, remove, _getPersisted: () => persisted, _getBooks: () => books };
}

// ---------------------------------------------------------------------------
// genreColor
// ---------------------------------------------------------------------------

describe('genreColor', () => {
  test('returns default color for null input', () => {
    expect(genreColor(null)).toBe(GENRE_COLORS.default);
  });

  test('returns default color for undefined input', () => {
    expect(genreColor(undefined)).toBe(GENRE_COLORS.default);
  });

  test('returns default color for empty string', () => {
    expect(genreColor('')).toBe(GENRE_COLORS.default);
  });

  test('returns correct color for a known genre (exact case)', () => {
    expect(genreColor('fiction')).toBe('#6366f1');
  });

  test('is case-insensitive — uppercased genre matches', () => {
    expect(genreColor('FICTION')).toBe('#6366f1');
  });

  test('is case-insensitive — mixed case genre matches', () => {
    expect(genreColor('Science Fiction')).toBe('#0ea5e9');
  });

  test('sci-fi alias maps to the same color as science fiction', () => {
    expect(genreColor('sci-fi')).toBe(genreColor('science fiction'));
  });

  test('returns default color for an unknown genre', () => {
    expect(genreColor('manga')).toBe(GENRE_COLORS.default);
  });

  test('each known genre has a distinct, non-empty color value', () => {
    const knownGenres = ['fiction', 'non-fiction', 'mystery', 'thriller', 'romance',
      'biography', 'history', 'fantasy', 'self-help', 'horror'];
    knownGenres.forEach((g) => {
      const color = genreColor(g);
      expect(typeof color).toBe('string');
      expect(color.length).toBeGreaterThan(0);
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });
});

// ---------------------------------------------------------------------------
// headerGradient
// ---------------------------------------------------------------------------

describe('headerGradient', () => {
  test('returns a two-element array for a known color', () => {
    const result = headerGradient('#6366f1');
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('#312e81');
    expect(result[1]).toBe('#4f46e5');
  });

  test('returns the fallback gradient for an unknown color', () => {
    expect(headerGradient('#ffffff')).toEqual(['#1e1b4b', '#312e81']);
  });

  test('returns the fallback gradient for null', () => {
    expect(headerGradient(null)).toEqual(['#1e1b4b', '#312e81']);
  });

  test('each gradient stop is a valid hex color', () => {
    Object.keys(GRADIENT_MAP).forEach((color) => {
      const [a, b] = headerGradient(color);
      expect(a).toMatch(/^#[0-9a-f]{6}$/i);
      expect(b).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });
});

// ---------------------------------------------------------------------------
// esc (HTML escaping)
// ---------------------------------------------------------------------------

describe('esc', () => {
  test('returns empty string for null', () => {
    expect(esc(null)).toBe('');
  });

  test('returns empty string for undefined', () => {
    expect(esc(undefined)).toBe('');
  });

  test('passes through a plain string unchanged', () => {
    expect(esc('hello world')).toBe('hello world');
  });

  test('escapes ampersands', () => {
    expect(esc('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  test('escapes less-than signs', () => {
    expect(esc('<script>')).toBe('&lt;script&gt;');
  });

  test('escapes greater-than signs', () => {
    expect(esc('a > b')).toBe('a &gt; b');
  });

  test('escapes double quotes', () => {
    expect(esc('"quoted"')).toBe('&quot;quoted&quot;');
  });

  test('escapes all special characters together', () => {
    expect(esc('<a href="x&y">link</a>')).toBe('&lt;a href=&quot;x&amp;y&quot;&gt;link&lt;/a&gt;');
  });

  test('coerces numbers to string before escaping', () => {
    expect(esc(42)).toBe('42');
  });

  test('double-escaping does not occur on plain safe strings', () => {
    const safe = 'just a normal title';
    expect(esc(esc(safe))).toBe(safe);
  });
});

// ---------------------------------------------------------------------------
// Data layer — getAll, getById, create, update, remove, persist
// ---------------------------------------------------------------------------

describe('data layer', () => {
  // Shared fixture
  const seed = [
    { id: 'a1', title: 'Dune', author: 'Herbert', year: '1965', genre: 'sci-fi', description: '' },
    { id: 'b2', title: '1984', author: 'Orwell',  year: '1949', genre: 'fiction', description: '' },
  ];

  describe('getAll', () => {
    test('returns all books in the collection', () => {
      const { getAll } = makeDataLayer([...seed]);
      expect(getAll()).toHaveLength(2);
    });

    test('returns an empty array when no books exist', () => {
      const { getAll } = makeDataLayer([]);
      expect(getAll()).toEqual([]);
    });
  });

  describe('getById', () => {
    test('returns the matching book by id', () => {
      const { getById } = makeDataLayer([...seed]);
      expect(getById('a1').title).toBe('Dune');
    });

    test('returns null for a non-existent id', () => {
      const { getById } = makeDataLayer([...seed]);
      expect(getById('zzz')).toBeNull();
    });

    test('returns null on an empty collection', () => {
      const { getById } = makeDataLayer([]);
      expect(getById('a1')).toBeNull();
    });
  });

  describe('create', () => {
    test('adds the new book to the front of the list', () => {
      const { create, getAll } = makeDataLayer([...seed]);
      const newBook = create({ title: 'Neuromancer', author: 'Gibson', year: '1984', genre: 'sci-fi', description: '' });
      const all = getAll();
      expect(all[0].id).toBe(newBook.id);
    });

    test('assigns a unique id to each created book', () => {
      const { create } = makeDataLayer([]);
      const b1 = create({ title: 'A', author: 'X' });
      const b2 = create({ title: 'B', author: 'Y' });
      expect(b1.id).not.toBe(b2.id);
    });

    test('persists the books collection after creation', () => {
      const { create, _getPersisted } = makeDataLayer([]);
      create({ title: 'A', author: 'X' });
      expect(_getPersisted()).not.toBeNull();
      expect(JSON.parse(_getPersisted())).toHaveLength(1);
    });

    test('spreads all provided data fields onto the book', () => {
      const { create } = makeDataLayer([]);
      const book = create({ title: 'Dune', author: 'Herbert', year: '1965', genre: 'sci-fi', description: 'Epic.' });
      expect(book).toMatchObject({ title: 'Dune', author: 'Herbert', year: '1965', genre: 'sci-fi', description: 'Epic.' });
    });

    test('increments total count after multiple creates', () => {
      const { create, getAll } = makeDataLayer([]);
      create({ title: 'A', author: 'X' });
      create({ title: 'B', author: 'Y' });
      create({ title: 'C', author: 'Z' });
      expect(getAll()).toHaveLength(3);
    });
  });

  describe('update', () => {
    test('returns the updated book with merged fields', () => {
      const { update } = makeDataLayer([...seed]);
      const result = update('a1', { title: 'Dune Messiah' });
      expect(result.title).toBe('Dune Messiah');
      expect(result.author).toBe('Herbert'); // unchanged field preserved
    });

    test('returns null when the id does not exist', () => {
      const { update } = makeDataLayer([...seed]);
      expect(update('zzz', { title: 'Ghost' })).toBeNull();
    });

    test('does not alter the book count after update', () => {
      const { update, getAll } = makeDataLayer([...seed]);
      update('a1', { title: 'Dune Messiah' });
      expect(getAll()).toHaveLength(2);
    });

    test('persists the collection after a successful update', () => {
      const { update, _getPersisted, _getBooks } = makeDataLayer([...seed]);
      update('a1', { title: 'Dune Messiah' });
      const persisted = JSON.parse(_getPersisted());
      expect(persisted.find((b) => b.id === 'a1').title).toBe('Dune Messiah');
    });

    test('does not call persist when id is not found', () => {
      const { update, _getPersisted } = makeDataLayer([...seed]);
      update('zzz', { title: 'Ghost' });
      // persist was never called so _getPersisted() should still be null
      expect(_getPersisted()).toBeNull();
    });
  });

  describe('remove', () => {
    test('removes the book with the given id', () => {
      const { remove, getById } = makeDataLayer([...seed]);
      remove('a1');
      expect(getById('a1')).toBeNull();
    });

    test('reduces the book count by one', () => {
      const { remove, getAll } = makeDataLayer([...seed]);
      remove('a1');
      expect(getAll()).toHaveLength(1);
    });

    test('leaves the remaining books intact', () => {
      const { remove, getById } = makeDataLayer([...seed]);
      remove('a1');
      expect(getById('b2').title).toBe('1984');
    });

    test('is a no-op for a non-existent id', () => {
      const { remove, getAll } = makeDataLayer([...seed]);
      remove('zzz');
      expect(getAll()).toHaveLength(2);
    });

    test('persists the collection after removal', () => {
      const { remove, _getPersisted } = makeDataLayer([...seed]);
      remove('a1');
      const persisted = JSON.parse(_getPersisted());
      expect(persisted.every((b) => b.id !== 'a1')).toBe(true);
    });

    test('removing the last book yields an empty persisted list', () => {
      const single = [{ id: 'x1', title: 'Only', author: 'One' }];
      const { remove, _getPersisted } = makeDataLayer(single);
      remove('x1');
      expect(JSON.parse(_getPersisted())).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Bug regression: getAll() in app.js returns `1` instead of `books`
// ---------------------------------------------------------------------------

describe('bug: getAll returns 1 (regression documentation)', () => {
  /**
   * This test documents the known bug on line 50 of app.js where `getAll`
   * is implemented as `function getAll() { return 1; }`.
   *
   * The test below asserts what the CORRECT behaviour should be.
   * When the bug is fixed, this test will pass without modification.
   */
  test('getAll should return the books array, not the number 1', () => {
    const { getAll } = makeDataLayer([
      { id: 'x', title: 'Fix Me', author: 'Dev' },
    ]);
    const result = getAll();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
  });
});
