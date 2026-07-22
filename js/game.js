(function () {
  const BOOKS_PATH = 'assets/';
  const CATALOG_PREFIX = 'katalog/oblojka_';
  const CATALOG_SUFFIX = '.jpg';
  const MAX_BOOKS = 10;

  let books = [];
  let currentBook = null;
  let currentPageIndex = 0;
  let tiles = [];
  let dragging = null;
  let dragOffset = { x: 0, y: 0 };
  let gameWon = false;

  const gridEl = document.getElementById('grid');
  const tilesLayer = document.getElementById('tiles-layer');
  const fullImage = document.getElementById('full-image');
  const btnContinue = document.getElementById('btn-continue');
  const episodeInput = document.getElementById('episode-input');
  const catalogScreen = document.getElementById('catalog-screen');
  const bookScreen = document.getElementById('book-screen');
  const catalogGrid = document.getElementById('catalog-grid');

  function getStorage() {
    try {
      const raw = localStorage.getItem('storyPuzzleData');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { books: {} };
  }

  function saveStorage(data) {
    try {
      localStorage.setItem('storyPuzzleData', JSON.stringify(data));
    } catch (e) {}
  }

  async function fileExists(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = src;
    });
  }

  function countPieces(folder, ext) {
    // unused; kept intentionally for possible future use
    return Promise.resolve(0);
  }

  async function detectGrid(folder, ext) {
    const MAX_ROWS = 8, MAX_COLS = 8;
    const checks = [];
    for (let row = 0; row < MAX_ROWS; row++) {
      for (let col = 0; col < MAX_COLS; col++) {
        checks.push(fileExists(`${folder}${col}_${row}.${ext}`).then(exists => ({row, col, exists})));
      }
    }
    const results = await Promise.all(checks);
    const map = new Map();
    let count = 0, maxCol = 0, maxRow = 0;
    for (const {row, col, exists} of results) {
      map.set(`${row}_${col}`, exists);
      if (exists) {
        if (col > maxCol) maxCol = col;
        if (row > maxRow) maxRow = row;
        count++;
      }
    }
    if (count === 0) return null;
    for (let row = 0; row <= maxRow; row++) {
      let found = false;
      for (let col = 0; col <= maxCol; col++) {
        if (map.get(`${row}_${col}`)) { found = true; break; }
      }
      if (!found && row > 0) return null;
    }
    for (let col = 0; col <= maxCol; col++) {
      let found = false;
      for (let row = 0; row <= maxRow; row++) {
        if (map.get(`${row}_${col}`)) { found = true; break; }
      }
      if (!found && col > 0) return null;
    }
    const cols = maxCol + 1;
    const rows = maxRow + 1;
    if (cols * rows !== count) return null;
    return { cols, rows };
  }

  async function discoverBooks() {
    const storage = getStorage();
    const bookPromises = [];
    for (let i = 1; i <= MAX_BOOKS; i++) {
      bookPromises.push((async (idx) => {
        const cover = `${BOOKS_PATH}${CATALOG_PREFIX}${idx}${CATALOG_SUFFIX}`;
        const hasCover = await fileExists(cover);
        const folder = `${BOOKS_PATH}book${idx}/`;
        const pages = [];
        const levelDirs = await getLevelDirs(folder);
        const pieceExt = levelDirs.length > 0 ? await detectPieceExt(levelDirs[0]) : null;
        if (pieceExt) {
          for (const levelDir of levelDirs) {
            const image = await detectLevelImage(levelDir);
            if (!image) continue;
            const grid = await detectGrid(levelDir, pieceExt);
            if (!grid) continue;
            const imgSize = await loadImageSize(image);
            if (!imgSize) continue;
            const isVertical = imgSize.height > imgSize.width;
            const isSquare = imgSize.width === imgSize.height;
            const maxW = isSquare ? 320 : (isVertical ? 280 : 320);
            const maxH = isSquare ? 320 : (isVertical ? 360 : 320);
            const scale = Math.min(maxW / imgSize.width, maxH / imgSize.height);
            const wrapperW = Math.floor(imgSize.width * scale);
            const wrapperH = Math.floor(imgSize.height * scale);
            const tileW = Math.floor(wrapperW / grid.cols);
            const tileH = Math.floor(wrapperH / grid.rows);
            pages.push({
              folder: levelDir,
              image,
              pieceExt,
              cols: grid.cols,
              rows: grid.rows,
              tileW,
              tileH,
              wrapperW,
              wrapperH,
              completed: !!(storage.books[idx] && storage.books[idx].pages && storage.books[idx].pages[pages.length + 1])
            });
          }
        }
        return { index: idx, cover, hasCover, folder, pages, pageCount: pages.length };
      })(i));
    }
    const books = await Promise.all(bookPromises);
    return books.map(book => ({
      ...book,
      completed: book.pages.length > 0 && book.pages.every(p => p.completed)
    }));
  }

  async function getLevelDirs(bookFolder) {
    const checks = [];
    for (let n = 1; n <= 50; n++) {
      const dir = `${bookFolder}level${n}/`;
      checks.push(fileExists(dir + '0_0.jpg').then(() => dir));
      checks.push(fileExists(dir + '0_0.png').then(() => dir));
    }
    const results = await Promise.all(checks);
    return results.filter(Boolean);
  }

  async function detectLevelImage(folder) {
    const main = folder.replace(/\/$/, '');
    const baseName = main.split('/').pop();
    const candidates = [
      `${folder}${baseName}.jpg`,
      `${folder}${baseName}.png`,
      `${folder}level.jpg`,
      `${folder}level.png`
    ];
    const results = await Promise.all(candidates.map(src => fileExists(src).then(exists => ({exists, src}))));
    for (const {exists, src} of results) {
      if (exists) return src;
    }
    return null;
  }

  async function detectPieceExt(folder) {
    if (await fileExists(`${folder}0_0.png`)) return 'png';
    if (await fileExists(`${folder}0_0.jpg`)) return 'jpg';
    return null;
  }

  function loadImageSize(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function showScreen(screen) {
    [catalogScreen, bookScreen].forEach(s => {
      s.classList.remove('active');
      s.classList.add('hidden');
    });
    screen.classList.remove('hidden');
    screen.classList.add('active');
  }

  async function initStart() {
    await initCatalog();
  }

  async function initCatalog() {
    try {
      books = await discoverBooks();
    } catch (e) {
      books = [];
    }
    renderCatalog();
    showScreen(catalogScreen);
  }

  function renderCatalog() {
    catalogGrid.innerHTML = '';
    books.forEach(book => {
      const card = document.createElement('div');
      card.className = 'book-card' + (book.completed ? '' : ' locked');

      const img = document.createElement('img');
      img.src = book.cover;
      img.alt = book.hasCover ? `Книга ${book.index}` : 'Нет обложки';
      img.draggable = false;

      const title = document.createElement('div');
      title.className = 'book-title';
      title.textContent = `Книга ${book.index}`;

      const status = document.createElement('div');
      status.className = 'book-status';
      if (book.pageCount === 0) {
        status.textContent = 'В разработке';
      } else if (book.completed) {
        status.textContent = 'Собрана ✓';
      } else {
        const collected = book.pages.filter(p => p.completed).length;
        status.textContent = `Страниц: ${collected}/${book.pageCount}`;
      }

      card.appendChild(img);
      card.appendChild(title);
      card.appendChild(status);

      if (book.pageCount > 0) {
        card.addEventListener('click', () => openBook(book.index));
      }

      catalogGrid.appendChild(card);
    });
  }

  async function openBook(bookIndex) {
    const book = books.find(b => b.index === bookIndex);
    if (!book || book.pageCount === 0) return;
    currentBook = book;
    currentPageIndex = 0;
    showScreen(bookScreen);
    await initPage(0);
  }

  async function loadLevelText(folder) {
    const main = folder.replace(/\/$/, '');
    const baseName = main.split('/').pop();
    const txtPath = `${folder}${baseName}.txt`;
    try {
      const response = await fetch(txtPath);
      if (!response.ok) return '';
      return await response.text();
    } catch (e) {
      return '';
    }
  }

  function resizeEpisodeInput() {
    if (!episodeInput || !episodeInput.value) return;
    episodeInput.style.height = 'auto';
    const newHeight = Math.max(44, episodeInput.scrollHeight);
    episodeInput.style.height = newHeight + 'px';
    const wrapperWidth = document.getElementById('game-wrapper').offsetWidth;
    const inputWidth = Math.min(wrapperWidth, 440);
    episodeInput.style.width = inputWidth + 'px';
  }

  async function initPage(pageIndex) {
    if (!currentBook) return;
    const page = currentBook.pages[pageIndex];
    if (!page) {
      showBookCompleted();
      return;
    }

    gameWon = false;
    btnContinue.disabled = true;
    gridEl.style.opacity = '1';
    fullImage.classList.remove('visible');
    fullImage.classList.add('hidden');
    episodeInput.classList.remove('visible');
    tilesLayer.innerHTML = '';
    tiles = [];

    const cols = page.cols;
    const rows = page.rows;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const filename = `${col}_${row}.${page.pieceExt}`;
        tiles.push({
          id: row * cols + col,
          correctRow: row,
          correctCol: col,
          row: row,
          col: col,
          src: page.folder + filename
        });
      }
    }

    document.getElementById('game-wrapper').style.width = page.wrapperW + 'px';
    document.getElementById('game-wrapper').style.height = page.wrapperH + 'px';
    fullImage.style.width = page.wrapperW + 'px';
    fullImage.style.height = page.wrapperH + 'px';

    const levelText = await loadLevelText(page.folder);
    episodeInput.value = levelText;
    resizeEpisodeInput();

    if (page.completed) {
      fullImage.src = page.image;
      fullImage.classList.remove('hidden');
      requestAnimationFrame(() => {
        fullImage.classList.add('visible');
        resizeEpisodeInput();
      });
      btnContinue.disabled = false;
      episodeInput.classList.add('visible');
    } else {
      fullImage.src = page.image;
      shuffleTiles(200, cols, rows);
      renderTiles(page);
      checkCorrect();
    }
  }

  function showBookCompleted() {
    gameWon = true;
    btnContinue.disabled = true;
    tilesLayer.innerHTML = '';
    document.getElementById('game-wrapper').style.width = '320px';
    document.getElementById('game-wrapper').style.height = '320px';
    fullImage.style.width = '320px';
    fullImage.style.height = '320px';
    fullImage.src = currentBook.cover;
    fullImage.classList.remove('hidden');
    requestAnimationFrame(() => fullImage.classList.add('visible'));
    episodeInput.classList.remove('visible');
  }

  function shuffleTiles(moves, cols, rows) {
    for (let i = 0; i < moves; i++) {
      const r1 = Math.floor(Math.random() * rows);
      const c1 = Math.floor(Math.random() * cols);
      const r2 = Math.floor(Math.random() * rows);
      const c2 = Math.floor(Math.random() * cols);
      const t1 = tiles.find(t => t.row === r1 && t.col === c1);
      const t2 = tiles.find(t => t.row === r2 && t.col === c2);
      if (t1 && t2) {
        const tmpRow = t1.row, tmpCol = t1.col;
        t1.row = t2.row; t1.col = t2.col;
        t2.row = tmpRow; t2.col = tmpCol;
      }
    }
  }

  function renderTiles(level) {
    tilesLayer.innerHTML = '';
    tiles.forEach(t => {
      const el = document.createElement('div');
      el.className = 'tile';
      el.dataset.id = t.id;
      const img = document.createElement('img');
      img.src = t.src;
      img.alt = '';
      img.draggable = false;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.display = 'block';
      img.style.pointerEvents = 'none';
      el.appendChild(img);
      el.style.width = level.tileW + 'px';
      el.style.height = level.tileH + 'px';
      setTilePosition(el, t.row, t.col, level);
      tilesLayer.appendChild(el);
    });
  }

  function setTilePosition(el, row, col, level, animate) {
    if (animate) el.classList.add('animating');
    else el.classList.remove('animating');
    el.style.left = col * level.tileW + 'px';
    el.style.top = row * level.tileH + 'px';
  }

  function getTileAt(row, col) {
    return tiles.find(t => t.row === row && t.col === col) || null;
  }

  function checkCorrect() {
    const level = currentBook.pages[currentPageIndex];
    if (!level) return;
    document.querySelectorAll('.tile').forEach(el => {
      const t = tiles.find(t => t.id === parseInt(el.dataset.id, 10));
      if (!t) return;
      if (t.row === t.correctRow && t.col === t.correctCol) {
        el.classList.add('correct');
        el.classList.add('bounce');
        setTimeout(() => el.classList.remove('bounce'), 400);
      } else {
        el.classList.remove('correct');
        el.classList.remove('locked');
        el.style.borderTop = '';
        el.style.borderRight = '';
        el.style.borderBottom = '';
        el.style.borderLeft = '';
        el.style.borderRadius = '';
      }
    });
    mergeCorrectGroups();
  }

  function mergeCorrectGroups() {
    const correctTiles = tiles.filter(t => t.row === t.correctRow && t.col === t.correctCol);
    if (correctTiles.length === 0) return;
    const adj = new Map();
    correctTiles.forEach(t => adj.set(t.id, []));
    correctTiles.forEach(t => {
      const neighbors = [{row: t.row - 1, col: t.col}, {row: t.row + 1, col: t.col}, {row: t.row, col: t.col - 1}, {row: t.row, col: t.col + 1}];
      neighbors.forEach(n => {
        const neighbor = correctTiles.find(ct => ct.row === n.row && ct.col === n.col);
        if (neighbor) adj.get(t.id).push(neighbor.id);
      });
    });
    const visited = new Set();
    const components = [];
    correctTiles.forEach(t => {
      if (visited.has(t.id)) return;
      const component = [];
      const queue = [t];
      visited.add(t.id);
      while (queue.length > 0) {
        const current = queue.shift();
        component.push(current);
        adj.get(current.id).forEach(neighborId => {
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            queue.push(tiles.find(tile => tile.id === neighborId));
          }
        });
      }
      components.push(component);
    });
    components.forEach(component => {
      if (component.length === 1) {
        const el = document.querySelector(`.tile[data-id="${component[0].id}"]`);
        if (el) {
          el.classList.add('correct');
          el.classList.remove('locked');
          el.style.borderTop = '';
          el.style.borderRight = '';
          el.style.borderBottom = '';
          el.style.borderLeft = '';
          el.style.borderRadius = '';
        }
      } else {
        component.forEach(t => {
          const el = document.querySelector(`.tile[data-id="${t.id}"]`);
          if (el) {
            el.classList.remove('correct');
            el.classList.remove('bounce');
            el.classList.add('locked');
          }
        });
        component.forEach(t => {
          const el = document.querySelector(`.tile[data-id="${t.id}"]`);
          if (!el) return;
          const top = component.some(n => n.row === t.row - 1 && n.col === t.col);
          const bottom = component.some(n => n.row === t.row + 1 && n.col === t.col);
          const left = component.some(n => n.row === t.row && n.col === t.col - 1);
          const right = component.some(n => n.row === t.row && n.col === t.col + 1);
          el.style.borderTop = top ? 'none' : '3px solid #4caf50';
          el.style.borderRight = right ? 'none' : '3px solid #4caf50';
          el.style.borderBottom = bottom ? 'none' : '3px solid #4caf50';
          el.style.borderLeft = left ? 'none' : '3px solid #4caf50';
          el.style.borderRadius = '0';
        });
      }
    });
  }

  function checkWin() {
    if (gameWon) return;
    const level = currentBook.pages[currentPageIndex];
    if (!level) return;
    const won = tiles.every(t => t.row === t.correctRow && t.col === t.correctCol);
    if (!won) return;
    gameWon = true;
    document.querySelectorAll('.tile').forEach(el => {
      el.style.borderColor = 'transparent';
      el.style.boxShadow = 'none';
      el.style.transition = 'all 0.6s ease-out';
    });
    setTimeout(() => {
      gridEl.style.transition = 'opacity 0.5s ease-out';
      gridEl.style.opacity = '0';
      fullImage.classList.remove('hidden');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => fullImage.classList.add('visible'));
      });
      btnContinue.disabled = false;
      episodeInput.classList.add('visible');
    }, 500);

    const storage = getStorage();
    if (!storage.books[currentBook.index]) storage.books[currentBook.index] = { pages: {}, completed: false };
    storage.books[currentBook.index].pages[currentPageIndex + 1] = { correct: true };
    currentBook.pages[currentPageIndex].completed = true;
    const allDone = currentBook.pages.every(p => p.completed);
    if (allDone) {
      storage.books[currentBook.index].completed = true;
      currentBook.completed = true;
    }
    saveStorage(storage);
  }

  tilesLayer.addEventListener('mousedown', (e) => {
    if (gameWon) return;
    const tileEl = e.target.closest('.tile');
    if (!tileEl) return;
    const t = tiles.find(t => t.id === parseInt(tileEl.dataset.id, 10));
    if (!t) return;
    dragging = tileEl;
    const rect = tileEl.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    tileEl.classList.add('dragging');
    tileEl.style.zIndex = 100;
    e.preventDefault();
  });

  tilesLayer.addEventListener('touchstart', (e) => {
    if (gameWon) return;
    const touch = e.touches[0];
    const tileEl = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!tileEl) return;
    const tile = tileEl.closest('.tile');
    if (!tile) return;
    const t = tiles.find(t => t.id === parseInt(tile.dataset.id, 10));
    if (!t) return;
    dragging = tile;
    const rect = tile.getBoundingClientRect();
    dragOffset.x = touch.clientX - rect.left;
    dragOffset.y = touch.clientY - rect.top;
    tile.classList.add('dragging');
    tile.style.zIndex = 100;
    e.preventDefault();
  }, { passive: false });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const wrapperRect = document.getElementById('game-wrapper').getBoundingClientRect();
    let x = e.clientX - wrapperRect.left - dragOffset.x;
    let y = e.clientY - wrapperRect.top - dragOffset.y;
    dragging.style.left = x + 'px';
    dragging.style.top = y + 'px';
  });

  window.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const touch = e.touches[0];
    const wrapperRect = document.getElementById('game-wrapper').getBoundingClientRect();
    let x = touch.clientX - wrapperRect.left - dragOffset.x;
    let y = touch.clientY - wrapperRect.top - dragOffset.y;
    dragging.style.left = x + 'px';
    dragging.style.top = y + 'px';
    e.preventDefault();
  }, { passive: false });

  window.addEventListener('mouseup', (e) => {
    if (!dragging) return;
    const level = currentBook.pages[currentPageIndex];
    if (!level) { resetDrag(); return; }
    const t = tiles.find(t => t.id === parseInt(dragging.dataset.id, 10));
    if (!t) { resetDrag(); return; }
    const wrapperRect = document.getElementById('game-wrapper').getBoundingClientRect();
    const mx = e.clientX - wrapperRect.left;
    const my = e.clientY - wrapperRect.top;
    let targetRow = Math.floor(my / level.tileH);
    let targetCol = Math.floor(mx / level.tileW);
    targetRow = Math.max(0, Math.min(level.rows - 1, targetRow));
    targetCol = Math.max(0, Math.min(level.cols - 1, targetCol));
    const targetTile = getTileAt(targetRow, targetCol);
    if (targetTile && (targetTile.row !== t.row || targetTile.col !== t.col)) {
      swapTiles(t, targetTile, dragging, level);
    } else {
      returnTile(dragging, t, level);
    }
    checkWin();
  });

  window.addEventListener('touchend', (e) => {
    if (!dragging) return;
    const level = currentBook.pages[currentPageIndex];
    if (!level) { resetDrag(); return; }
    const t = tiles.find(t => t.id === parseInt(dragging.dataset.id, 10));
    if (!t) { resetDrag(); return; }
    const touch = e.changedTouches[0];
    const wrapperRect = document.getElementById('game-wrapper').getBoundingClientRect();
    const mx = touch.clientX - wrapperRect.left;
    const my = touch.clientY - wrapperRect.top;
    let targetRow = Math.floor(my / level.tileH);
    let targetCol = Math.floor(mx / level.tileW);
    targetRow = Math.max(0, Math.min(level.rows - 1, targetRow));
    targetCol = Math.max(0, Math.min(level.cols - 1, targetCol));
    const targetTile = getTileAt(targetRow, targetCol);
    if (targetTile && (targetTile.row !== t.row || targetTile.col !== t.col)) {
      swapTiles(t, targetTile, dragging, level);
    } else {
      returnTile(dragging, t, level);
    }
    checkWin();
  });

  function swapTiles(t1, t2, el1, level) {
    const el2 = document.querySelector(`.tile[data-id="${t2.id}"]`);
    const tmpRow = t1.row, tmpCol = t1.col;
    t1.row = t2.row; t1.col = t2.col;
    t2.row = tmpRow; t2.col = tmpCol;
    setTilePosition(el1, t1.row, t1.col, level, true);
    setTilePosition(el2, t2.row, t2.col, level, true);
    finishDrag(el1, t1);
    finishDrag(el2, t2);
  }

  function returnTile(el, t, level) {
    setTilePosition(el, t.row, t.col, level, true);
    finishDrag(el, t);
  }

  function finishDrag(el, t) {
    el.classList.remove('dragging');
    el.style.zIndex = '';
    el.classList.remove('animating');
    dragging = null;
    checkCorrect();
  }

  function resetDrag() {
    if (!dragging) return;
    dragging.classList.remove('dragging');
    dragging.style.zIndex = '';
    dragging.classList.remove('animating');
    dragging = null;
  }

  document.getElementById('btn-continue').addEventListener('click', () => {
    const level = currentBook.pages[currentPageIndex];
    if (level) {
      fullImage.classList.remove('visible');
      fullImage.classList.add('hidden');
      gridEl.style.opacity = '1';
    }
    const next = currentPageIndex + 1;
    if (next < currentBook.pages.length) {
      currentPageIndex = next;
      initPage(currentPageIndex);
    } else {
      showBookCompleted();
    }
  });

  document.querySelectorAll('.menu-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'restart') {
        const level = currentBook.pages[currentPageIndex];
        if (!level) return;
        gameWon = false;
        btnContinue.disabled = true;
        gridEl.style.opacity = '1';
        fullImage.classList.remove('visible');
        fullImage.classList.add('hidden');
        episodeInput.classList.remove('visible');
        shuffleTiles(200, level.cols, level.rows);
        renderTiles(level);
        checkCorrect();
      }
      if (action === 'catalog') {
        initCatalog();
      }
    });
  });

  initStart();
})();
