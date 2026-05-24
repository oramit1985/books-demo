const STORAGE_KEY = 'books_data';

let books = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
let activeBookId = null;

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// --- CRUD ---

function getAll() { return books; }

function getById(id) { return books.find(b => b.id === id); }

function create(data) {
  const book = { id: genId(), ...data };
  books.push(book);
  save();
  return book;
}

function update(id, data) {
  const idx = books.findIndex(b => b.id === id);
  if (idx === -1) return null;
  books[idx] = { ...books[idx], ...data };
  save();
  return books[idx];
}

function remove(id) {
  books = books.filter(b => b.id !== id);
  save();
}

// --- UI helpers ---

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  document.getElementById('overlay').classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  const anyOpen = document.querySelectorAll('.modal:not(.hidden)').length > 0;
  if (!anyOpen) document.getElementById('overlay').classList.add('hidden');
}

function renderBooks(filter = '') {
  const grid = document.getElementById('books-grid');
  const empty = document.getElementById('empty-state');
  const q = filter.toLowerCase();
  const list = getAll().filter(b =>
    b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)
  );

  grid.innerHTML = '';
  if (list.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.forEach(book => {
    const card = document.createElement('div');
    card.className = 'book-card';
    card.dataset.id = book.id;
    card.innerHTML = `
      <h3>${escape(book.title)}</h3>
      <p class="card-author">${escape(book.author)}${book.year ? ' &bull; ' + book.year : ''}</p>
      ${book.genre ? `<span class="card-genre">${escape(book.genre)}</span>` : ''}
    `;
    card.addEventListener('click', () => openDetail(book.id));
    grid.appendChild(card);
  });
}

function escape(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// --- Detail ---

function openDetail(id) {
  const book = getById(id);
  if (!book) return;
  activeBookId = id;
  document.getElementById('detail-title').textContent = book.title;
  document.getElementById('detail-author').textContent = book.author;
  document.getElementById('detail-year').textContent = book.year || '';
  const genreEl = document.getElementById('detail-genre');
  genreEl.textContent = book.genre || '';
  genreEl.classList.toggle('hidden', !book.genre);
  document.getElementById('detail-description').textContent = book.description || '';
  openModal('modal-detail');
}

document.getElementById('detail-edit').addEventListener('click', () => {
  closeModal('modal-detail');
  openForm(activeBookId);
});

document.getElementById('detail-delete').addEventListener('click', () => {
  const book = getById(activeBookId);
  if (!book) return;
  document.getElementById('confirm-book-title').textContent = book.title;
  openModal('modal-confirm');
});

document.getElementById('confirm-yes').addEventListener('click', () => {
  remove(activeBookId);
  closeModal('modal-confirm');
  closeModal('modal-detail');
  renderBooks(document.getElementById('search').value);
});

// --- Form ---

function openForm(id = null) {
  const form = document.getElementById('book-form');
  form.reset();
  form.querySelectorAll('.error').forEach(el => el.classList.remove('error'));

  if (id) {
    const book = getById(id);
    document.getElementById('form-title').textContent = 'Edit Book';
    document.getElementById('form-id').value = book.id;
    document.getElementById('form-book-title').value = book.title;
    document.getElementById('form-author').value = book.author;
    document.getElementById('form-year').value = book.year || '';
    document.getElementById('form-genre').value = book.genre || '';
    document.getElementById('form-description').value = book.description || '';
  } else {
    document.getElementById('form-title').textContent = 'Add Book';
    document.getElementById('form-id').value = '';
  }
  openModal('modal-form');
}

document.getElementById('btn-add').addEventListener('click', () => openForm());

document.getElementById('book-form').addEventListener('submit', e => {
  e.preventDefault();
  const titleEl = document.getElementById('form-book-title');
  const authorEl = document.getElementById('form-author');
  let valid = true;

  [titleEl, authorEl].forEach(el => {
    el.classList.toggle('error', !el.value.trim());
    if (!el.value.trim()) valid = false;
  });
  if (!valid) return;

  const data = {
    title: titleEl.value.trim(),
    author: authorEl.value.trim(),
    year: document.getElementById('form-year').value || '',
    genre: document.getElementById('form-genre').value.trim(),
    description: document.getElementById('form-description').value.trim(),
  };

  const id = document.getElementById('form-id').value;
  id ? update(id, data) : create(data);

  closeModal('modal-form');
  renderBooks(document.getElementById('search').value);
});

// --- Search ---
document.getElementById('search').addEventListener('input', e => renderBooks(e.target.value));

// --- Close buttons ---
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});
document.getElementById('overlay').addEventListener('click', () => {
  document.querySelectorAll('.modal:not(.hidden)').forEach(m => closeModal(m.id));
});

// --- Init ---
renderBooks();
