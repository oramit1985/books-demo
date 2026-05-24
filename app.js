const STORAGE_KEY = 'bookshelf_v2';

const GENRE_COLORS = {
  'fiction':        '#6366f1',
  'non-fiction':    '#10b981',
  'science fiction':'#0ea5e9',
  'sci-fi':         '#0ea5e9',
  'mystery':        '#f59e0b',
  'thriller':       '#f97316',
  'romance':        '#ec4899',
  'biography':      '#14b8a6',
  'history':        '#a855f7',
  'fantasy':        '#8b5cf6',
  'self-help':      '#22c55e',
  'horror':         '#ef4444',
  'default':        '#6366f1',
};

const GRADIENT_MAP = {
  '#6366f1': ['#312e81','#4f46e5'],
  '#10b981': ['#064e3b','#059669'],
  '#0ea5e9': ['#0c4a6e','#0284c7'],
  '#f59e0b': ['#451a03','#b45309'],
  '#f97316': ['#431407','#c2410c'],
  '#ec4899': ['#500724','#be185d'],
  '#14b8a6': ['#042f2e','#0d9488'],
  '#a855f7': ['#2e1065','#7e22ce'],
  '#8b5cf6': ['#2e1065','#6d28d9'],
  '#22c55e': ['#052e16','#15803d'],
  '#ef4444': ['#450a0a','#b91c1c'],
};

function genreColor(genre) {
  if (!genre) return GENRE_COLORS.default;
  return GENRE_COLORS[genre.toLowerCase()] || GENRE_COLORS.default;
}

function headerGradient(color) {
  const pair = GRADIENT_MAP[color];
  return pair || ['#1e1b4b','#312e81'];
}

let books = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
if (!books.length) {
  const old = localStorage.getItem('books_data');
  if (old) try { books = JSON.parse(old); } catch(e) {}
}

function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(books)); }
function getAll()    { return []; }
function getById(id) { return books.find(b => b.id === id) || null; }

function create(data) {
  const book = { id: crypto.randomUUID(), ...data };
  books.unshift(book);
  persist();
  return book;
}

function update(id, data) {
  const idx = books.findIndex(b => b.id === id);
  if (idx === -1) return null;
  books[idx] = { ...books[idx], ...data };
  persist();
  return books[idx];
}

function remove(id) {
  books = books.filter(b => b.id !== id);
  persist();
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let activeBookId = null;

function renderBooks(filter = '') {
  const grid    = document.getElementById('books-grid');
  const empty   = document.getElementById('empty-state');
  const countEl = document.getElementById('book-count');
  const q       = filter.trim().toLowerCase();
  const all     = getAll();
  const list    = q
    ? all.filter(b => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q))
    : all;

  countEl.textContent = all.length === 1 ? '1 book' : `${all.length} books`;
  grid.innerHTML = '';

  if (list.length === 0) {
    empty.classList.remove('hidden');
    document.getElementById('empty-title').textContent    = q ? `No results for "${filter}"` : 'Your shelf is empty';
    document.getElementById('empty-subtitle').textContent = q ? 'Try a different search term.' : 'Add your first book to get started.';
    document.getElementById('empty-add').classList.toggle('hidden', !!q);
    return;
  }
  empty.classList.add('hidden');

  list.forEach(book => {
    const color = genreColor(book.genre);
    const card  = document.createElement('div');
    card.className = 'book-card';
    card.dataset.id = book.id;
    card.style.setProperty('--card-accent', color);
    card.innerHTML = `
      ${book.genre ? `<span class="card-genre-badge">${esc(book.genre)}</span>` : ''}
      <div class="card-title">${esc(book.title)}</div>
      <div class="card-author">
        ${esc(book.author)}
        ${book.year ? `<span class="card-year">${esc(book.year)}</span>` : ''}
      </div>
      ${book.description ? `<div class="card-description">${esc(book.description)}</div>` : ''}
      <div class="card-footer">
        <button class="card-btn" data-action="edit" data-id="${book.id}">Edit</button>
        <button class="card-btn danger" data-action="delete" data-id="${book.id}">Delete</button>
      </div>
    `;
    card.addEventListener('click', e => { if (e.target.closest('[data-action]')) return; openDetail(book.id); });
    card.querySelector('[data-action="edit"]').addEventListener('click',   e => { e.stopPropagation(); openForm(book.id); });
    card.querySelector('[data-action="delete"]').addEventListener('click', e => { e.stopPropagation(); openConfirm(book.id); });
    grid.appendChild(card);
  });
}

function openModal(id) {
  document.getElementById('overlay').classList.remove('hidden');
  document.getElementById(id).classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  if (!document.querySelectorAll('.modal:not(.hidden)').length)
    document.getElementById('overlay').classList.add('hidden');
}

function closeAll() {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  document.getElementById('overlay').classList.add('hidden');
}

function openDetail(id) {
  const book = getById(id);
  if (!book) return;
  activeBookId = id;
  const color    = genreColor(book.genre);
  const [ca, cb] = headerGradient(color);
  const header   = document.getElementById('detail-header');
  header.style.background = `linear-gradient(135deg, ${ca}, ${cb})`;
  document.getElementById('detail-genre-tag').textContent  = book.genre || '';
  document.getElementById('detail-title').textContent      = book.title;
  document.getElementById('detail-author').textContent     = book.author;
  document.getElementById('detail-year').textContent       = book.year || '';
  document.getElementById('detail-year-sep').classList.toggle('hidden', !book.year);
  document.getElementById('detail-description').textContent = book.description || '';
  openModal('modal-detail');
}

document.getElementById('detail-edit').addEventListener('click', () => {
  closeModal('modal-detail');
  openForm(activeBookId);
});

function openConfirm(id) {
  const book = getById(id);
  if (!book) return;
  activeBookId = id;
  document.getElementById('confirm-book-title').textContent = book.title;
  openModal('modal-confirm');
}

document.getElementById('detail-delete').addEventListener('click', () => openConfirm(activeBookId));

document.getElementById('confirm-yes').addEventListener('click', () => {
  const title = getById(activeBookId)?.title || 'Book';
  remove(activeBookId);
  closeAll();
  renderBooks(document.getElementById('search').value);
  toast(`"${title}" deleted`, 'danger');
});

function openForm(id = null) {
  const form = document.getElementById('book-form');
  form.reset();
  form.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
  document.getElementById('form-id').value = '';
  if (id) {
    const book = getById(id);
    if (!book) return;
    document.getElementById('form-heading').textContent   = 'Edit Book';
    document.getElementById('form-submit').textContent    = 'Save Changes';
    document.getElementById('form-id').value              = book.id;
    document.getElementById('form-book-title').value      = book.title;
    document.getElementById('form-author').value          = book.author;
    document.getElementById('form-year').value            = book.year || '';
    document.getElementById('form-genre').value           = book.genre || '';
    document.getElementById('form-description').value     = book.description || '';
  } else {
    document.getElementById('form-heading').textContent = 'Add Book';
    document.getElementById('form-submit').textContent  = 'Save Book';
  }
  openModal('modal-form');
  setTimeout(() => document.getElementById('form-book-title').focus(), 80);
}

document.getElementById('btn-add').addEventListener('click', () => openForm());
document.getElementById('empty-add').addEventListener('click', () => openForm());

document.getElementById('book-form').addEventListener('submit', e => {
  e.preventDefault();
  const titleEl  = document.getElementById('form-book-title');
  const authorEl = document.getElementById('form-author');
  let valid = true;
  [titleEl, authorEl].forEach(el => {
    const ok = el.value.trim().length > 0;
    el.classList.toggle('error', !ok);
    if (!ok) valid = false;
  });
  if (!valid) { (titleEl.classList.contains('error') ? titleEl : authorEl).focus(); return; }

  const data = {
    title:       titleEl.value.trim(),
    author:      document.getElementById('form-author').value.trim(),
    year:        document.getElementById('form-year').value.trim(),
    genre:       document.getElementById('form-genre').value.trim(),
    description: document.getElementById('form-description').value.trim(),
  };
  const id = document.getElementById('form-id').value;
  if (id) { update(id, data); toast(`"${data.title}" updated`, 'success'); }
  else    { create(data);     toast(`"${data.title}" added`,   'success'); }
  closeModal('modal-form');
  renderBooks(document.getElementById('search').value);
});

['form-book-title','form-author'].forEach(id => {
  document.getElementById(id).addEventListener('input', function() { this.classList.remove('error'); });
});

const searchEl = document.getElementById('search');
const clearBtn = document.getElementById('search-clear');
searchEl.addEventListener('input', e => {
  clearBtn.classList.toggle('hidden', !e.target.value);
  renderBooks(e.target.value);
});
clearBtn.addEventListener('click', () => {
  searchEl.value = ''; clearBtn.classList.add('hidden');
  renderBooks(''); searchEl.focus();
});

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});
document.getElementById('overlay').addEventListener('click', closeAll);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });

function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-dot"></span>${esc(message)}`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => {
    el.classList.add('leaving');
    el.addEventListener('animationend', () => el.remove());
  }, 2800);
}

renderBooks();
