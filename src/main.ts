import opentype from 'opentype.js';
import './style.css';

type Point = { x: number; y: number };
type GlyphMark = { points: Point[]; filled: boolean };
type GlyphMap = Record<string, GlyphMark[]>;
type Category = 'uppercase' | 'lowercase' | 'numbers' | 'punctuation';
type Draft = { fontName: string; glyphs: GlyphMap };

const categories: Record<Category, { label: string; characters: string[] }> = {
  uppercase: { label: 'Uppercase', characters: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'] },
  lowercase: { label: 'Lowercase', characters: [...'abcdefghijklmnopqrstuvwxyz'] },
  numbers: { label: 'Numbers', characters: [...'0123456789'] },
  punctuation: { label: 'Punctuation', characters: [...'.,!?\'"-:;()&@'] },
};
const allCharacters = Object.values(categories).flatMap(({ characters }) => characters);
const storageKey = 'glyph-studio-draft-v2';
const canvasWidth = 720;
const canvasHeight = 440;
const glyphWidth = 700;
const brushWidth = 12;

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App mount point was not found.');

function loadDraft(): Draft {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return { fontName: 'My Handwriting', glyphs: {} };

  const parsed: unknown = JSON.parse(saved);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('fontName' in parsed) ||
    typeof parsed.fontName !== 'string' ||
    !('glyphs' in parsed) ||
    typeof parsed.glyphs !== 'object' ||
    parsed.glyphs === null
  ) {
    throw new Error('The saved draft has an unexpected format.');
  }
  return parsed as Draft;
}

let draft: Draft;
let draftLoadError = '';
try {
  draft = loadDraft();
} catch (error) {
  draft = { fontName: 'My Handwriting', glyphs: {} };
  draftLoadError = error instanceof Error ? error.message : 'The saved draft could not be loaded.';
}

let activeCategory: Category = 'uppercase';
let activeCharacter = categories[activeCategory].characters[0];
let activeStroke: Point[] | null = null;
let previewObjectUrl = '';
let saveTimer = 0;
let toastTimer = 0;

app.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <a class="brand" href="#" aria-label="Glyph Studio home">
        <span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></span>
        <span>glyph<span class="brand-light">studio</span></span>
      </a>
      <div class="topbar-right">
        <span class="save-state" id="save-state"><span class="save-dot"></span><span id="save-label">Saved on this device</span></span>
        <button class="button button-outline" id="import-button" type="button">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 12.5V2.8m0 0L6.5 6.3M10 2.8l3.5 3.5M3 11.5v4.7A1.8 1.8 0 0 0 4.8 18h10.4a1.8 1.8 0 0 0 1.8-1.8v-4.7"/></svg>
          Import scan
        </button>
        <button class="button button-outline" id="print-button" type="button">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 6V2.8h9V6M5 14H3.7a1.7 1.7 0 0 1-1.7-1.7V8.2a1.7 1.7 0 0 1 1.7-1.7h12.6A1.7 1.7 0 0 1 18 8.2v4.1a1.7 1.7 0 0 1-1.7 1.7H15M5.5 11.5h9v5.7h-9z"/></svg>
          Print template
        </button>
        <button class="button button-primary" id="export-button" type="button">
          Export font <span class="button-arrow" aria-hidden="true">↗</span>
        </button>
      </div>
    </header>
    <input id="scan-input" type="file" accept="image/png,image/jpeg,image/webp" hidden />

    <main>
      <section class="intro">
        <div>
          <div class="eyebrow"><span class="eyebrow-line"></span> YOUR LETTERS, YOUR WAY</div>
          <h1>A little more <em>you</em> in every word.</h1>
          <p>Fill in a template or draw right here, then turn your handwriting into a font.</p>
        </div>
        <div class="stepper" aria-label="Font creation steps">
          <div class="step step-active"><span class="step-number">01</span><span>Draw</span></div>
          <span class="step-connector"></span>
          <div class="step"><span class="step-number">02</span><span>Preview</span></div>
          <span class="step-connector"></span>
          <div class="step"><span class="step-number">03</span><span>Export</span></div>
        </div>
      </section>

      <div class="workspace">
        <section class="editor-card card">
          <div class="card-heading">
            <div>
              <span class="section-kicker">THE CHARACTER WORKSHOP</span>
              <h2>Make it yours</h2>
            </div>
            <div class="progress-wrap">
              <span class="progress-copy"><strong id="glyph-count">0</strong> <span id="glyph-total">/ ${allCharacters.length} characters</span></span>
              <div class="progress-track"><div class="progress-fill" id="progress-fill"></div></div>
            </div>
          </div>

          <div class="category-tabs" role="tablist" aria-label="Character groups">
            ${Object.entries(categories).map(([key, value]) => `
              <button class="category-tab ${key === activeCategory ? 'selected' : ''}" type="button" role="tab" data-category="${key}" aria-selected="${key === activeCategory}">
                ${value.label}<span class="category-count" data-count="${key}">0</span>
              </button>
            `).join('')}
          </div>

          <div class="character-grid" id="character-grid" aria-label="Choose a character"></div>

          <div class="draw-area">
            <div class="draw-toolbar">
              <div class="active-character"><span id="active-character">${activeCharacter}</span><div><strong>Draw this character</strong><small>Use your mouse, trackpad, or finger</small></div></div>
              <div class="draw-actions">
                <button class="icon-button" id="undo-button" type="button" aria-label="Undo last stroke" title="Undo last stroke">
                  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.2 6.2H3.5v-3.7M3.8 6a7 7 0 1 1-.7 7.7"/></svg>
                </button>
                <button class="text-button" id="clear-button" type="button">Clear</button>
              </div>
            </div>
            <div class="canvas-wrap">
              <canvas id="glyph-canvas" width="${canvasWidth}" height="${canvasHeight}" aria-label="Drawing area for the selected character"></canvas>
              <div class="guide-label guide-cap">CAP HEIGHT</div>
              <div class="guide-label guide-baseline">BASELINE</div>
            </div>
            <div class="canvas-hint"><span class="hint-dot"></span> Keep letters between the guides for a balanced typeface <span class="hint-shortcut">TIP: SLOW STROKES LOOK SMOOTHER</span></div>
          </div>
        </section>

        <aside class="preview-column">
          <section class="font-card card">
            <div class="font-card-top">
              <span class="section-kicker">YOUR TYPEFACE</span>
              <span class="live-badge"><span></span> LIVE PREVIEW</span>
            </div>
            <label class="font-name-label" for="font-name">Give it a name</label>
            <input id="font-name" class="font-name-input" type="text" maxlength="40" value="${escapeHtml(draft.fontName)}" />
            <div class="preview-box">
              <div class="preview-meta"><span>PREVIEW</span><span class="preview-size">32 PX</span></div>
              <textarea id="preview-text" aria-label="Font preview text" spellcheck="false">The quick brown fox
jumps over the lazy dog.</textarea>
            </div>
            <div class="preview-footer"><span>All your written characters appear here</span><span class="preview-sparkle">✳</span></div>
          </section>

          <section class="export-card">
            <div class="export-illustration" aria-hidden="true"><span class="illustration-a">Aa</span><span class="illustration-star">✳</span><span class="illustration-line"></span></div>
            <div>
              <h3>Your font is taking shape</h3>
              <p>Draw a few characters to see your handwriting come to life.</p>
            </div>
            <button class="button button-dark" id="export-secondary" type="button">Download .OTF <span aria-hidden="true">↓</span></button>
            <div class="export-note">Works with most design apps and word processors</div>
          </section>
          <p class="privacy-note"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.6 2.8 3.5v3.8c0 3.2 2.2 5.7 5.2 7.1 3-1.4 5.2-3.9 5.2-7.1V3.5L8 1.6Zm-2.2 6.2 1.5 1.5 3-3.2"/></svg> Your work stays private on this device.</p>
        </aside>
      </div>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>
    </main>
  </div>
  <section id="print-sheet" aria-hidden="true">
    <header class="print-header">
      <div class="print-logo">glyph<span>studio</span></div>
      <h1>My handwriting, in type.</h1>
      <p>Write one character in each box with a dark pen. Scan this page straight-on, crop to the page edges, then choose Import scan in the character workshop.</p>
    </header>
    <div class="print-grid">
      ${allCharacters.map((character) => `
        <div class="print-cell"><span class="print-character">${escapeHtml(character)}</span><span class="print-cap-guide"></span><span class="print-base-guide"></span></div>
      `).join('')}
    </div>
    <footer class="print-footer">One letter per box · Keep letters within the guides · glyphstudio</footer>
  </section>
`;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char] ?? char);
}

function notify(message: string, isError = false): void {
  const toast = document.querySelector<HTMLDivElement>('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle('toast-error', isError);
  toast.classList.add('toast-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('toast-visible'), 3200);
}

function getCompletedCount(): number {
  return allCharacters.filter((character) => (draft.glyphs[character]?.length ?? 0) > 0).length;
}

function updateProgress(): void {
  const completed = getCompletedCount();
  const count = document.querySelector<HTMLElement>('#glyph-count');
  const total = document.querySelector<HTMLElement>('#glyph-total');
  const fill = document.querySelector<HTMLElement>('#progress-fill');
  if (count) count.textContent = String(completed);
  if (total) total.textContent = `/ ${allCharacters.length} characters`;
  if (fill) fill.style.width = `${(completed / allCharacters.length) * 100}%`;
  for (const [category, { characters }] of Object.entries(categories)) {
    const categoryCount = document.querySelector<HTMLElement>(`[data-count="${category}"]`);
    if (categoryCount) {
      categoryCount.textContent = String(characters.filter((char) => (draft.glyphs[char]?.length ?? 0) > 0).length);
    }
  }
  const exportButtons = [
    document.querySelector<HTMLButtonElement>('#export-button'),
    document.querySelector<HTMLButtonElement>('#export-secondary'),
  ];
  for (const button of exportButtons) {
    if (button) button.disabled = completed === 0;
  }
}

function renderCharacterGrid(): void {
  const grid = document.querySelector<HTMLDivElement>('#character-grid');
  if (!grid) return;
  grid.innerHTML = categories[activeCategory].characters.map((character) => {
    const completed = (draft.glyphs[character]?.length ?? 0) > 0;
    return `<button type="button" class="character-button ${character === activeCharacter ? 'active' : ''} ${completed ? 'complete' : ''}" data-character="${escapeHtml(character)}" aria-label="${character === ' ' ? 'space' : character}${completed ? ', drawn' : ''}" aria-pressed="${character === activeCharacter}">${escapeHtml(character)}${completed ? '<span class="character-check" aria-hidden="true">✓</span>' : ''}</button>`;
  }).join('');
}

const canvas = document.querySelector<HTMLCanvasElement>('#glyph-canvas');
if (!canvas) throw new Error('The drawing canvas could not be found.');
const drawingContext = canvas.getContext('2d');
if (!drawingContext) throw new Error('The drawing canvas could not be initialized.');
const context: CanvasRenderingContext2D = drawingContext;

function drawGuides(): void {
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  context.fillStyle = '#fffefa';
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  context.save();
  context.strokeStyle = '#e9e5dd';
  context.lineWidth = 1;
  context.setLineDash([]);
  context.beginPath();
  context.moveTo(48, 0);
  context.lineTo(48, canvasHeight);
  context.moveTo(canvasWidth - 48, 0);
  context.lineTo(canvasWidth - 48, canvasHeight);
  context.stroke();
  context.strokeStyle = '#e7bfd0';
  context.setLineDash([6, 8]);
  context.beginPath();
  context.moveTo(48, 90);
  context.lineTo(canvasWidth - 48, 90);
  context.moveTo(48, 350);
  context.lineTo(canvasWidth - 48, 350);
  context.stroke();
  context.restore();

  const marks = draft.glyphs[activeCharacter] ?? [];
  context.strokeStyle = '#28333a';
  context.fillStyle = '#28333a';
  context.lineWidth = brushWidth;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  const filledMarks = marks.filter((mark) => mark.filled && mark.points.length >= 3);
  if (filledMarks.length > 0) {
    context.beginPath();
    for (const mark of filledMarks) {
      context.moveTo(mark.points[0].x * canvasWidth, mark.points[0].y * canvasHeight);
      for (const point of mark.points.slice(1)) {
        context.lineTo(point.x * canvasWidth, point.y * canvasHeight);
      }
      context.closePath();
    }
    context.fill('evenodd');
  }
  for (const mark of marks.filter((entry) => !entry.filled)) {
    if (mark.points.length === 0) continue;
    const first = mark.points[0];
    context.beginPath();
    context.moveTo(first.x * canvasWidth, first.y * canvasHeight);
    for (const point of mark.points.slice(1)) {
      context.lineTo(point.x * canvasWidth, point.y * canvasHeight);
    }
    if (mark.points.length === 1) {
      context.arc(first.x * canvasWidth, first.y * canvasHeight, brushWidth / 2, 0, Math.PI * 2);
      context.fill();
    } else {
      context.stroke();
    }
  }
  if (activeStroke) {
    context.beginPath();
    context.moveTo(activeStroke[0].x * canvasWidth, activeStroke[0].y * canvasHeight);
    for (const point of activeStroke.slice(1)) {
      context.lineTo(point.x * canvasWidth, point.y * canvasHeight);
    }
    if (activeStroke.length === 1) {
      context.arc(activeStroke[0].x * canvasWidth, activeStroke[0].y * canvasHeight, brushWidth / 2, 0, Math.PI * 2);
      context.fill();
    } else {
      context.stroke();
    }
  }
}

function scheduleSave(): void {
  const label = document.querySelector<HTMLElement>('#save-label');
  const state = document.querySelector<HTMLElement>('#save-state');
  if (label) label.textContent = 'Saving…';
  state?.classList.add('saving');
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
      if (label) label.textContent = 'Saved on this device';
      state?.classList.remove('saving', 'save-error');
    } catch (error) {
      if (label) label.textContent = 'Could not save draft';
      state?.classList.remove('saving');
      state?.classList.add('save-error');
      notify(error instanceof Error ? `Draft could not be saved: ${error.message}` : 'Draft could not be saved.', true);
    }
  }, 250);
}

function renderFontPreview(): void {
  const typed = document.querySelector<HTMLTextAreaElement>('#preview-text');
  const nameInput = document.querySelector<HTMLInputElement>('#font-name');
  if (!typed || !nameInput || getCompletedCount() === 0) return;
  try {
    const font = makeFont();
    const objectUrl = URL.createObjectURL(new Blob([font.toArrayBuffer()], { type: 'font/otf' }));
    const styleId = 'generated-font-style';
    document.querySelector(`#${styleId}`)?.remove();
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `@font-face{font-family:"GlyphStudioPreview";src:url("${objectUrl}") format("opentype");font-display:swap}`;
    document.head.append(style);
    typed.style.fontFamily = '"GlyphStudioPreview", cursive';
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = objectUrl;
  } catch (error) {
    notify(error instanceof Error ? `Preview could not be updated: ${error.message}` : 'Preview could not be updated.', true);
  }
}

function polygon(path: opentype.Path, points: Point[]): void {
  if (points.length < 3) return;
  path.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) path.lineTo(point.x, point.y);
  path.close();
}

function addCircle(path: opentype.Path, center: Point, radius: number): void {
  const sides = 10;
  const points = Array.from({ length: sides }, (_, index) => {
    const angle = (index / sides) * Math.PI * 2;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });
  polygon(path, points);
}

type GridAxis = { start: number; pitch: number; cellSize: number; evidence: number };

function fitGridAxis(
  projection: number[],
  cellCount: number,
  startMin: number,
  startMax: number,
  pitchMin: number,
  pitchMax: number,
  gapRatio: number,
): GridAxis | null {
  const localPeak = (coordinate: number): number => {
    let peak = 0;
    for (let offset = -2; offset <= 2; offset += 1) {
      const value = projection[Math.round(coordinate) + offset] ?? 0;
      peak = Math.max(peak, value);
    }
    return peak;
  };
  let best: GridAxis | null = null;
  let bestScore = 0;
  for (let start = startMin; start <= startMax; start += 1) {
    for (let pitch = pitchMin; pitch <= pitchMax; pitch += 0.5) {
      const cellSize = pitch * (1 - gapRatio);
      let score = 0;
      for (let index = 0; index < cellCount; index += 1) {
        const cellStart = start + index * pitch;
        score += localPeak(cellStart);
        score += localPeak(cellStart + cellSize);
      }
      if (score > bestScore) {
        bestScore = score;
        best = { start, pitch, cellSize, evidence: score / (cellCount * 2) };
      }
    }
  }
  return best;
}

function detectTemplateGrid(imageData: ImageData): { x: GridAxis; y: GridAxis } {
  const xProjection = new Array<number>(imageData.width).fill(0);
  const yProjection = new Array<number>(imageData.height).fill(0);
  for (let y = 130; y < imageData.height - 70; y += 1) {
    for (let x = 0; x < imageData.width; x += 1) {
      const offset = (y * imageData.width + x) * 4;
      const luminance = 0.2126 * imageData.data[offset]
        + 0.7152 * imageData.data[offset + 1]
        + 0.0722 * imageData.data[offset + 2];
      if (luminance < 230) xProjection[x] += 1;
    }
  }
  const x = fitGridAxis(xProjection, 8, 0, 180, 62, 105, 5 / 85.4);
  if (!x || x.evidence < 20) {
    throw new Error('Could not locate the character grid. Scan the complete template page and try again.');
  }

  const gridRight = Math.min(
    imageData.width,
    Math.ceil(x.start + 7 * x.pitch + x.cellSize),
  );
  for (let y = 100; y < imageData.height; y += 1) {
    for (let xPos = Math.max(0, Math.floor(x.start)); xPos < gridRight; xPos += 1) {
      const offset = (y * imageData.width + xPos) * 4;
      const luminance = 0.2126 * imageData.data[offset]
        + 0.7152 * imageData.data[offset + 1]
        + 0.0722 * imageData.data[offset + 2];
      if (luminance < 235) yProjection[y] += 1;
    }
  }
  const y = fitGridAxis(yProjection, 10, 100, 450, 62, 96, 5 / 83);
  if (!y || y.evidence < 20) {
    throw new Error('Could not align the template rows. Use a straight, upright scan and try again.');
  }
  return { x, y };
}

function simplifyContour(points: Point[], tolerance: number): Point[] {
  if (points.length <= 4) return points;
  const first = points[0];
  let farthestIndex = 1;
  let farthestDistance = 0;
  for (let index = 1; index < points.length; index += 1) {
    const dx = points[index].x - first.x;
    const dy = points[index].y - first.y;
    const distance = dx * dx + dy * dy;
    if (distance > farthestDistance) {
      farthestDistance = distance;
      farthestIndex = index;
    }
  }

  const simplifyOpenPath = (path: Point[]): Point[] => {
    if (path.length <= 2) return path;
    const start = path[0];
    const end = path[path.length - 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    let maximumDistance = 0;
    let maximumIndex = 0;
    for (let index = 1; index < path.length - 1; index += 1) {
      const point = path[index];
      const distance = Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x) / length;
      if (distance > maximumDistance) {
        maximumDistance = distance;
        maximumIndex = index;
      }
    }
    if (maximumDistance <= tolerance) return [start, end];
    const left = simplifyOpenPath(path.slice(0, maximumIndex + 1));
    const right = simplifyOpenPath(path.slice(maximumIndex));
    return [...left.slice(0, -1), ...right];
  };

  const firstHalf = simplifyOpenPath(points.slice(0, farthestIndex + 1));
  const secondHalf = simplifyOpenPath([...points.slice(farthestIndex), first]);
  return [...firstHalf.slice(0, -1), ...secondHalf.slice(0, -1)];
}

function traceContours(binary: Uint8Array, width: number, height: number): Point[][] {
  type Edge = { from: number; to: number; direction: number; used: boolean };
  const edges: Edge[] = [];
  const edgesByStart = new Map<number, Edge[]>();
  const vertex = (x: number, y: number) => y * (width + 1) + x;
  const addEdge = (x1: number, y1: number, x2: number, y2: number, direction: number) => {
    const edge = { from: vertex(x1, y1), to: vertex(x2, y2), direction, used: false };
    edges.push(edge);
    const outgoing = edgesByStart.get(edge.from) ?? [];
    outgoing.push(edge);
    edgesByStart.set(edge.from, outgoing);
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!binary[y * width + x]) continue;
      if (y === 0 || !binary[(y - 1) * width + x]) addEdge(x, y, x + 1, y, 0);
      if (x === width - 1 || !binary[y * width + x + 1]) addEdge(x + 1, y, x + 1, y + 1, 1);
      if (y === height - 1 || !binary[(y + 1) * width + x]) addEdge(x + 1, y + 1, x, y + 1, 2);
      if (x === 0 || !binary[y * width + x - 1]) addEdge(x, y + 1, x, y, 3);
    }
  }

  const contours: Point[][] = [];
  for (const firstEdge of edges) {
    if (firstEdge.used) continue;
    const start = firstEdge.from;
    const points: Point[] = [];
    let edge: Edge | undefined = firstEdge;
    let closed = false;
    for (let steps = 0; edge && steps <= edges.length; steps += 1) {
      edge.used = true;
      points.push({ x: edge.from % (width + 1), y: Math.floor(edge.from / (width + 1)) });
      if (edge.to === start) {
        closed = true;
        break;
      }
      const incomingDirection = edge.direction;
      const candidates: Edge[] = (edgesByStart.get(edge.to) ?? []).filter((candidate) => !candidate.used);
      candidates.sort((a, b) => {
        const turnRank = (direction: number) => {
          const turn = (direction - incomingDirection + 4) % 4;
          return turn === 1 ? 0 : turn === 0 ? 1 : turn === 3 ? 2 : 3;
        };
        return turnRank(a.direction) - turnRank(b.direction);
      });
      edge = candidates[0];
    }
    if (!closed || points.length < 3) continue;

    const simplified = points.filter((point, index) => {
      const previous = points[(index + points.length - 1) % points.length];
      const next = points[(index + 1) % points.length];
      return (point.x - previous.x) * (next.y - point.y) !== (point.y - previous.y) * (next.x - point.x);
    });
    let twiceArea = 0;
    for (let index = 0; index < simplified.length; index += 1) {
      const current = simplified[index];
      const next = simplified[(index + 1) % simplified.length];
      twiceArea += current.x * next.y - next.x * current.y;
    }
    if (simplified.length >= 3 && Math.abs(twiceArea) >= 24) {
      contours.push(simplifyContour(simplified, 1.1));
    }
  }
  return contours;
}

function extractCellMarks(
  imageData: ImageData,
  left: number,
  top: number,
  right: number,
  bottom: number,
): GlyphMark[] {
  const width = right - left;
  const height = bottom - top;
  const binary = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = ((top + y) * imageData.width + left + x) * 4;
      const red = imageData.data[offset];
      const green = imageData.data[offset + 1];
      const blue = imageData.data[offset + 2];
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      if (imageData.data[offset + 3] > 160 && luminance < 150) binary[y * width + x] = 1;
    }
  }
  const visited = new Uint8Array(binary.length);
  const minimumComponentSize = Math.max(7, Math.round(width * height * 0.0005));
  for (let index = 0; index < binary.length; index += 1) {
    if (!binary[index] || visited[index]) continue;
    const component: number[] = [index];
    visited[index] = 1;
    for (let cursor = 0; cursor < component.length; cursor += 1) {
      const current = component[cursor];
      const x = current % width;
      const y = Math.floor(current / width);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nextX = x + dx;
          const nextY = y + dy;
          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
          const next = nextY * width + nextX;
          if (binary[next] && !visited[next]) {
            visited[next] = 1;
            component.push(next);
          }
        }
      }
    }
    if (component.length < minimumComponentSize) {
      for (const pixel of component) binary[pixel] = 0;
    }
  }
  return traceContours(binary, width, height).map((contour) => ({
    points: contour.map((point) => ({ x: point.x / width, y: point.y / height })),
    filled: true,
  }));
}

async function importTemplate(file: File): Promise<void> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a PNG, JPG, or WebP scan.');
  if (file.size > 30 * 1024 * 1024) throw new Error('The image is too large. Choose a scan under 30 MB.');

  const bitmap = await createImageBitmap(file);
  try {
    const aspectRatio = bitmap.width / bitmap.height;
    if (aspectRatio < 0.6 || aspectRatio > 0.82) {
      throw new Error('Use a portrait scan cropped to the page edges. Rotate or crop the image and try again.');
    }
    if (bitmap.width * bitmap.height > 80_000_000) {
      throw new Error('The image dimensions are too large to process in this browser.');
    }

    const page = document.createElement('canvas');
    page.width = 794;
    page.height = 1123;
    const pageContext = page.getContext('2d', { willReadFrequently: true });
    if (!pageContext) throw new Error('The scan could not be processed.');
    pageContext.fillStyle = '#fff';
    pageContext.fillRect(0, 0, page.width, page.height);
    pageContext.drawImage(bitmap, 0, 0, page.width, page.height);
    const grid = detectTemplateGrid(pageContext.getImageData(0, 0, page.width, page.height));

    const tracingCanvas = document.createElement('canvas');
    const scale = 2;
    tracingCanvas.width = page.width * scale;
    tracingCanvas.height = page.height * scale;
    const tracingContext = tracingCanvas.getContext('2d', { willReadFrequently: true });
    if (!tracingContext) throw new Error('The scan could not be traced.');
    tracingContext.fillStyle = '#fff';
    tracingContext.fillRect(0, 0, tracingCanvas.width, tracingCanvas.height);
    tracingContext.drawImage(bitmap, 0, 0, tracingCanvas.width, tracingCanvas.height);
    const imageData = tracingContext.getImageData(0, 0, tracingCanvas.width, tracingCanvas.height);
    let imported = 0;

    for (let index = 0; index < allCharacters.length; index += 1) {
      const column = index % 8;
      const row = Math.floor(index / 8);
      const cellLeft = grid.x.start + column * grid.x.pitch;
      const cellTop = grid.y.start + row * grid.y.pitch;
      const cropLeft = 0.06;
      const cropRight = 0.94;
      const cropTop = 0.24;
      const cropBottom = 0.92;
      const marks = extractCellMarks(
        imageData,
        Math.round((cellLeft + grid.x.cellSize * cropLeft) * scale),
        Math.round((cellTop + grid.y.cellSize * cropTop) * scale),
        Math.round((cellLeft + grid.x.cellSize * cropRight) * scale),
        Math.round((cellTop + grid.y.cellSize * cropBottom) * scale),
      );
      if (marks.length > 0) {
        for (const mark of marks) {
          for (const point of mark.points) {
            point.x = 48 / canvasWidth + point.x * ((canvasWidth - 96) / canvasWidth);
            const cellY = cropTop + point.y * (cropBottom - cropTop);
            const capGuide = 24 / 78;
            const baselineGuide = (78 - 12) / 78;
            point.y = 90 / canvasHeight
              + ((cellY - capGuide) / (baselineGuide - capGuide)) * ((350 - 90) / canvasHeight);
          }
        }
        if (allCharacters[index] === '.') {
          const lowestPoint = Math.max(...marks.flatMap((mark) => mark.points.map((point) => point.y)));
          const baseline = 350 / canvasHeight;
          const correction = Math.max(0, baseline - lowestPoint);
          for (const mark of marks) {
            for (const point of mark.points) point.y += correction;
          }
        }
        draft.glyphs[allCharacters[index]] = marks;
        imported += 1;
      }
    }

    if (imported === 0) {
      throw new Error('No handwriting was found. Use dark ink inside the guide boxes and try again.');
    }
    renderCharacterGrid();
    drawGuides();
    updateProgress();
    scheduleSave();
    renderFontPreview();
    notify(`Imported ${imported} characters. Review your letters before exporting.`);
  } finally {
    bitmap.close();
  }
}

function makeFont(): opentype.Font {
  const sideBearing = 40;
  const horizontalScale = canvasWidth * 760 / (350 - 90);
  const capGuide = 90 / canvasHeight;
  const baselineGuide = 350 / canvasHeight;
  const fontBrushWidth = brushWidth * 760 / (350 - 90);
  const notdef = new opentype.Glyph({
    name: '.notdef',
    unicode: 0,
    advanceWidth: glyphWidth,
    path: new opentype.Path(),
  });
  const glyphs = [
    notdef,
    new opentype.Glyph({
      name: 'space',
      unicode: 32,
      advanceWidth: 300,
      path: new opentype.Path(),
    }),
  ];
  for (const character of allCharacters) {
    const path = new opentype.Path();
    const marks = draft.glyphs[character] ?? [];
    const sourcePoints = marks.flatMap((mark) => mark.points);
    const minX = sourcePoints.length > 0 ? Math.min(...sourcePoints.map((point) => point.x)) : 0;
    const maxX = sourcePoints.length > 0 ? Math.max(...sourcePoints.map((point) => point.x)) : 0;
    const hasStrokes = marks.some((mark) => !mark.filled);
    const outlinePadding = hasStrokes ? fontBrushWidth * 0.63 : 0;
    const glyphScale = maxX > minX
      ? Math.min(1, 900 / ((maxX - minX) * horizontalScale))
      : 1;
    const rawMinX = minX * horizontalScale * glyphScale - outlinePadding;
    const rawMaxX = maxX * horizontalScale * glyphScale + outlinePadding;
    const xOffset = sideBearing - rawMinX;
    for (const mark of marks) {
      const points = mark.points.map((point) => ({
        x: point.x * horizontalScale * glyphScale + xOffset,
        y: 760 - ((point.y - capGuide) / (baselineGuide - capGuide)) * 760,
      }));
      if (mark.filled) {
        polygon(path, points);
        continue;
      }
      if (points.length === 1) {
        addCircle(path, points[0], fontBrushWidth * 0.63);
        continue;
      }
      addCircle(path, points[0], fontBrushWidth * 0.63);
      for (let index = 1; index < points.length; index += 1) {
        const from = points[index - 1];
        const to = points[index];
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy);
        if (length === 0) continue;
        const halfWidth = fontBrushWidth * 0.55;
        const nx = (-dy / length) * halfWidth;
        const ny = (dx / length) * halfWidth;
        polygon(path, [
          { x: from.x + nx, y: from.y + ny },
          { x: to.x + nx, y: to.y + ny },
          { x: to.x - nx, y: to.y - ny },
          { x: from.x - nx, y: from.y - ny },
        ]);
        addCircle(path, to, fontBrushWidth * 0.63);
      }
    }
    const outlineWidth = rawMaxX - rawMinX;
    glyphs.push(new opentype.Glyph({
      name: `uni${character.codePointAt(0)?.toString(16).padStart(4, '0').toUpperCase()}`,
      unicode: character.codePointAt(0),
      advanceWidth: marks.length > 0 ? Math.ceil(outlineWidth + sideBearing * 2) : 500,
      path,
    }));
  }
  const familyName = draft.fontName.trim() || 'My Handwriting';
  return new opentype.Font({
    familyName,
    styleName: 'Regular',
    version: 'Version 0.2',
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs,
  });
}

function exportFont(): void {
  if (getCompletedCount() === 0) {
    notify('Draw at least one character before exporting your font.', true);
    return;
  }
  try {
    const font = makeFont();
    const blob = new Blob([font.toArrayBuffer()], { type: 'font/otf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filename = (draft.fontName.trim() || 'my-handwriting')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'my-handwriting';
    link.href = url;
    link.download = `${filename}.otf`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    notify('Your font is ready to download.');
  } catch (error) {
    notify(error instanceof Error ? `Font could not be exported: ${error.message}` : 'Font could not be exported.', true);
  }
}

function updateCharacter(character: string): void {
  activeCharacter = character;
  activeStroke = null;
  const label = document.querySelector<HTMLElement>('#active-character');
  if (label) label.textContent = character;
  renderCharacterGrid();
  drawGuides();
}

app.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const categoryButton = target.closest<HTMLButtonElement>('[data-category]');
  if (categoryButton) {
    const category = categoryButton.dataset.category as Category;
    if (!(category in categories)) return;
    activeCategory = category;
    activeCharacter = categories[category].characters[0];
    document.querySelectorAll<HTMLButtonElement>('.category-tab').forEach((button) => {
      const selected = button === categoryButton;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-selected', String(selected));
    });
    updateCharacter(activeCharacter);
    return;
  }
  const characterButton = target.closest<HTMLButtonElement>('[data-character]');
  if (characterButton?.dataset.character) {
    updateCharacter(characterButton.dataset.character);
    return;
  }
  if (target.closest('#clear-button')) {
    delete draft.glyphs[activeCharacter];
    drawGuides();
    renderCharacterGrid();
    updateProgress();
    scheduleSave();
    renderFontPreview();
    return;
  }
  if (target.closest('#undo-button')) {
    draft.glyphs[activeCharacter]?.pop();
    if (draft.glyphs[activeCharacter]?.length === 0) delete draft.glyphs[activeCharacter];
    drawGuides();
    renderCharacterGrid();
    updateProgress();
    scheduleSave();
    renderFontPreview();
    return;
  }
  if (target.closest('#print-button')) {
    window.print();
    return;
  }
  if (target.closest('#import-button')) {
    document.querySelector<HTMLInputElement>('#scan-input')?.click();
    return;
  }
  if (target.closest('#export-button, #export-secondary')) exportFont();
});

document.querySelector<HTMLInputElement>('#scan-input')?.addEventListener('change', async (event) => {
  const input = event.currentTarget;
  if (!(input instanceof HTMLInputElement)) return;
  const file = input.files?.[0];
  if (!file) return;
  try {
    await importTemplate(file);
  } catch (error) {
    notify(error instanceof Error ? error.message : 'The template scan could not be imported.', true);
  } finally {
    input.value = '';
  }
});

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 && event.pointerType === 'mouse') return;
  const bounds = canvas.getBoundingClientRect();
  activeStroke = [{
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
  }];
  canvas.setPointerCapture(event.pointerId);
  drawGuides();
});

canvas.addEventListener('pointermove', (event) => {
  if (!activeStroke) return;
  const bounds = canvas.getBoundingClientRect();
  activeStroke.push({
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
  });
  drawGuides();
});

canvas.addEventListener('pointerup', () => {
  if (!activeStroke) return;
  if (activeStroke.length === 1) activeStroke.push({ ...activeStroke[0] });
  draft.glyphs[activeCharacter] ??= [];
  draft.glyphs[activeCharacter].push({ points: activeStroke, filled: false });
  activeStroke = null;
  drawGuides();
  renderCharacterGrid();
  updateProgress();
  scheduleSave();
  renderFontPreview();
});

canvas.addEventListener('pointercancel', () => {
  activeStroke = null;
  drawGuides();
});

document.querySelector<HTMLInputElement>('#font-name')?.addEventListener('input', (event) => {
  const input = event.currentTarget;
  if (!(input instanceof HTMLInputElement)) return;
  draft.fontName = input.value;
  scheduleSave();
  renderFontPreview();
});

document.querySelector<HTMLTextAreaElement>('#preview-text')?.addEventListener('input', (event) => {
  const input = event.currentTarget;
  if (input instanceof HTMLTextAreaElement) input.dataset.edited = 'true';
});

renderCharacterGrid();
drawGuides();
updateProgress();
if (draftLoadError) notify(`Saved draft could not be loaded: ${draftLoadError}`, true);
