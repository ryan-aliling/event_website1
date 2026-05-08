// Classic 2048 (static) — no dependencies, works on Amplify/S3.
// Controls: Arrow keys or WASD. Touch swipe supported.

const SIZE = 4;

const boardEl = document.getElementById("board");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const statusEl = document.getElementById("status");

const overlayEl = document.getElementById("overlay");
const overlayTitleEl = document.getElementById("overlayTitle");
const overlayTextEl = document.getElementById("overlayText");
const tryAgainBtn = document.getElementById("tryAgainBtn");
const keepPlayingBtn = document.getElementById("keepPlayingBtn");

const newGameBtn = document.getElementById("newGameBtn");
const undoBtn = document.getElementById("undoBtn");

let grid = makeEmptyGrid();
let score = 0;
let best = Number(localStorage.getItem("best2048") || "0");
let won = false;
let canKeepPlaying = false;

let undoState = null;

bestEl.textContent = String(best);

// Render background cells once
function renderCells() {
  boardEl.innerHTML = "";
  for (let i = 0; i < SIZE * SIZE; i++) {
    const cell = document.createElement("div");
    cell.className = "cell";
    boardEl.appendChild(cell);
  }
}

function makeEmptyGrid() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function cloneGrid(g) {
  return g.map(row => row.slice());
}

function saveUndo() {
  undoState = {
    grid: cloneGrid(grid),
    score,
    won,
    canKeepPlaying
  };
  undoBtn.disabled = false;
}

function undo() {
  if (!undoState) return;
  grid = cloneGrid(undoState.grid);
  score = undoState.score;
  won = undoState.won;
  canKeepPlaying = undoState.canKeepPlaying;
  undoState = null;
  undoBtn.disabled = true;
  hideOverlay();
  draw(true);
  updateHUD();
  setStatus("Undo! Use it wisely.");
}

function randomEmptyCell(g) {
  const empties = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (g[r][c] === 0) empties.push([r, c]);
    }
  }
  if (empties.length === 0) return null;
  return empties[Math.floor(Math.random() * empties.length)];
}

function addRandomTile(g) {
  const spot = randomEmptyCell(g);
  if (!spot) return false;
  const [r, c] = spot;
  // Classic: 90% 2, 10% 4
  g[r][c] = Math.random() < 0.9 ? 2 : 4;
  return { r, c };
}

function resetGame() {
  grid = makeEmptyGrid();
  score = 0;
  won = false;
  canKeepPlaying = false;
  undoState = null;
  undoBtn.disabled = true;

  addRandomTile(grid);
  addRandomTile(grid);

  hideOverlay();
  draw(true);
  updateHUD();
  setStatus("Good luck. You got this.");
}

function setStatus(msg) {
  statusEl.textContent = msg;
}

function updateHUD() {
  scoreEl.textContent = String(score);
  if (score > best) {
    best = score;
    localStorage.setItem("best2048", String(best));
    bestEl.textContent = String(best);
  }
}

function tileClass(val) {
  if (val <= 2048) return `t${val}`;
  if (val <= 4096) return "t4096";
  return "t8192";
}

function fontClass(val) {
  const s = String(val).length;
  if (s <= 2) return "";
  if (s === 3) return "small";
  if (s === 4) return "smaller";
  return "tiny";
}

function cellToPx(r, c) {
  // Positions are calculated based on CSS gap/padding.
  // We use percentage-based transforms for smoothness.
  // Each tile uses translate with CSS variables computed in px for accurate alignment.
  const gap = 12;      // must match CSS
  const pad = 12;      // must match CSS board padding
  const boardSize = boardEl.clientWidth;
  const tileSize = (boardSize - pad * 2 - gap * (SIZE - 1)) / SIZE;
  const x = pad + c * (tileSize + gap);
  const y = pad + r * (tileSize + gap);
  return { x, y, tileSize };
}

function clearTiles() {
  // Remove only tile elements (cells stay)
  const tiles = boardEl.querySelectorAll(".tile");
  tiles.forEach(t => t.remove());
}

function draw(initial = false, animations = []) {
  // animations: [{from:{r,c}, to:{r,c}, val, type:"move|merge|spawn"}]
  clearTiles();

  // Build a map of "special" animations by destination cell (only for style)
  const animByPos = new Map();
  for (const a of animations) {
    const key = `${a.to.r},${a.to.c}`;
    animByPos.set(key, a);
  }

  // Render tiles from grid
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const val = grid[r][c];
      if (val === 0) continue;

      const tile = document.createElement("div");
      tile.className = `tile ${tileClass(val)} ${fontClass(val)}`.trim();

      const num = document.createElement("div");
      num.className = "num";
      num.textContent = String(val);
      tile.appendChild(num);

      const { x, y } = cellToPx(r, c);
      tile.style.setProperty("--tx", `${x}px`);
      tile.style.setProperty("--ty", `${y}px`);
      tile.style.transform = `translate3d(${x}px, ${y}px, 0)`;

      const key = `${r},${c}`;
      const anim = animByPos.get(key);
      if (anim) {
        if (anim.type === "spawn") tile.classList.add("pop");
        if (anim.type === "merge") tile.classList.add("merge");
      } else if (initial) {
        tile.classList.add("pop");
      }

      boardEl.appendChild(tile);
    }
  }
}

function compressLine(line) {
  // returns { newLine, gainedScore, merges: [indices merged] }
  const nonZero = line.filter(v => v !== 0);
  const out = [];
  let gained = 0;
  const mergedAt = [];

  for (let i = 0; i < nonZero.length; i++) {
    const a = nonZero[i];
    const b = nonZero[i + 1];
    if (b != null && a === b) {
      const m = a + b;
      out.push(m);
      gained += m;
      mergedAt.push(out.length - 1);
      i++;
    } else {
      out.push(a);
    }
  }

  while (out.length < SIZE) out.push(0);
  return { newLine: out, gainedScore: gained, mergedAt };
}

function move(dir) {
  // dir: "left" "right" "up" "down"
  const before = cloneGrid(grid);

  saveUndo();

  let gainedTotal = 0;
  let moved = false;
  let anyMerge = false;

  // for fun spawn/merge animation hints:
  const animations = [];

  const getLine = (index) => {
    if (dir === "left" || dir === "right") return grid[index].slice();
    // up/down: column
    return grid.map(row => row[index]);
  };

  const setLine = (index, line) => {
    if (dir === "left" || dir === "right") {
      grid[index] = line.slice();
    } else {
      for (let r = 0; r < SIZE; r++) grid[r][index] = line[r];
    }
  };

  const reverseIfNeeded = (line) => {
    if (dir === "right" || dir === "down") return line.slice().reverse();
    return line;
  };

  const unreverseIfNeeded = (line) => {
    if (dir === "right" || dir === "down") return line.slice().reverse();
    return line;
  };

  for (let i = 0; i < SIZE; i++) {
    const original = getLine(i);
    const working = reverseIfNeeded(original);

    const { newLine, gainedScore, mergedAt } = compressLine(working);
    const finalLine = unreverseIfNeeded(newLine);

    setLine(i, finalLine);

    if (gainedScore > 0) anyMerge = true;
    gainedTotal += gainedScore;

    if (!arraysEqual(original, finalLine)) moved = true;

    // animation hints (lightweight): mark merges (by dest cell)
    // We'll add only destination merges/spawns for the "pop" effect.
    // (Full movement animations are more complex; keeping it simple & classic.)
    if (mergedAt.length > 0) {
      // mergedAt refers to index in "working" direction
      for (const mi of mergedAt) {
        const destIndex = (dir === "right" || dir === "down") ? (SIZE - 1 - mi) : mi;
        const to = dirToCell(i, destIndex, dir);
        animations.push({ to, type: "merge" });
      }
    }
  }

  if (!moved) {
  // No change to board: don't allow undo for a non-move
  undoState = null;
  undoBtn.disabled = true;

  // ✅ But still check if the game is actually over
  if (isGameOver()) {
    showGameOver();
  } else {
    setStatus("Nope — that move won't work.");
  }
  return;
}


  score += gainedTotal;
  updateHUD();

  const spawn = addRandomTile(grid);
  if (spawn) animations.push({ to: spawn, type: "spawn" });

  draw(false, animations);

  if (!won && hasTile(2048)) {
    won = true;
    showWin();
  } else if (!canKeepPlaying && won) {
    // do nothing
  }

  if (isGameOver()) {
    showGameOver();
  } else {
    if (anyMerge) {
      const quips = [
        "Nice merge!",
        "Clean.",
        "That one felt good.",
        "You’re cooking 🔥",
        "Smooth moves."
      ];
      setStatus(quips[Math.floor(Math.random() * quips.length)]);
    } else {
      setStatus("Keep going…");
    }
  }
}

function dirToCell(i, j, dir) {
  // i is row index for left/right, column index for up/down
  if (dir === "left" || dir === "right") return { r: i, c: j };
  return { r: j, c: i };
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function hasTile(v) {
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      if (grid[r][c] === v) return true;
  return false;
}

function hasMoves() {
  // empty exists
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      if (grid[r][c] === 0) return true;

  // adjacent equals
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = grid[r][c];
      if (r + 1 < SIZE && grid[r + 1][c] === v) return true;
      if (c + 1 < SIZE && grid[r][c + 1] === v) return true;
    }
  }
  return false;
}

function isGameOver() {
  return !hasMoves();
}

function showWin() {
  overlayTitleEl.textContent = "You made 2048!";
  overlayTextEl.textContent = "Big brain moment. Want to keep playing?";
  keepPlayingBtn.classList.remove("hidden");
  overlayEl.classList.remove("hidden");
}

function showGameOver() {
  overlayTitleEl.textContent = "Game Over";
  overlayTextEl.textContent = "No moves left. Try again?";
  keepPlayingBtn.classList.add("hidden");
  overlayEl.classList.remove("hidden");
}

function hideOverlay() {
  overlayEl.classList.add("hidden");
}

newGameBtn.addEventListener("click", resetGame);
tryAgainBtn.addEventListener("click", resetGame);
keepPlayingBtn.addEventListener("click", () => {
  canKeepPlaying = true;
  hideOverlay();
  setStatus("Okay… continuing. Respect.");
});

undoBtn.addEventListener("click", undo);

function onKey(e) {
  const key = e.key.toLowerCase();
  const map = {
    "arrowleft": "left",
    "a": "left",
    "arrowright": "right",
    "d": "right",
    "arrowup": "up",
    "w": "up",
    "arrowdown": "down",
    "s": "down"
  };
  const dir = map[key];
  if (!dir) return;
  e.preventDefault();
  if (overlayEl && !overlayEl.classList.contains("hidden") && overlayTitleEl.textContent === "You made 2048!" && !canKeepPlaying) {
    // block moves while win dialog is up (unless keep playing)
    return;
  }
  move(dir);
}

window.addEventListener("keydown", onKey, { passive: false });

// Touch swipe support
let touchStart = null;
boardEl.addEventListener("touchstart", (e) => {
  const t = e.touches[0];
  touchStart = { x: t.clientX, y: t.clientY };
}, { passive: true });

boardEl.addEventListener("touchend", (e) => {
  if (!touchStart) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  touchStart = null;

  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (Math.max(ax, ay) < 18) return;

  if (ax > ay) move(dx > 0 ? "right" : "left");
  else move(dy > 0 ? "down" : "up");
}, { passive: true });

function init() {
  renderCells();
  resetGame();
}

init();
