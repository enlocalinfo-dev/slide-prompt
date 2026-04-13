/**
 * slides-data.json を読み、slide-01.html … を生成
 * 再生成: node generate-slides.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "slides-data.json"), "utf8"));
const slides = raw.slides;

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderBulletList(items) {
  const arr = Array.isArray(items) ? items : [];
  if (arr.length === 0) return "";
  const lis = arr.map((b) => `<li>${esc(b)}</li>`).join("\n            ");
  return `<ul>\n            ${lis}\n          </ul>`;
}

function renderFootBullets(footBullets) {
  const arr = Array.isArray(footBullets) ? footBullets : [];
  if (arr.length === 0) return "";
  return `
        <div class="slide-foot">
          ${renderBulletList(arr)}
        </div>`;
}

/** セクション見出し（抽象メンタルモデル：具体の塊の前後で挟む） */
function renderBodySection(slide) {
  return `<div class="slide-body slide-layout slide-layout--section" role="region" aria-label="セクション">
          ${renderBulletList(slide.bullets)}
        </div>`;
}

/** 単一カラムの箇条書き（従来） */
function renderBodyList(slide) {
  return `<div class="slide-body slide-layout slide-layout--list">
          ${renderBulletList(slide.bullets)}
        </div>`;
}

/** 左右対比（2カラム） */
function renderBodyCompare(slide) {
  const c = slide.compare;
  if (!c || !Array.isArray(c.left) || !Array.isArray(c.right)) return renderBodyList(slide);
  return `<div class="slide-body slide-layout slide-layout--compare" role="group" aria-label="対比">
          <div class="slide-panel slide-panel--compare slide-panel--left">
            <h3 class="slide-panel__title">${esc(c.leftTitle || "")}</h3>
            ${renderBulletList(c.left)}
          </div>
          <div class="slide-panel slide-panel--compare slide-panel--right">
            <h3 class="slide-panel__title">${esc(c.rightTitle || "")}</h3>
            ${renderBulletList(c.right)}
          </div>
        </div>${renderFootBullets(slide.footBullets)}`;
}

/** Before / After */
function renderBodyBeforeAfter(slide) {
  const ba = slide.beforeAfter;
  if (!ba || !Array.isArray(ba.before) || !Array.isArray(ba.after)) return renderBodyList(slide);
  return `<div class="slide-body slide-layout slide-layout--beforeafter" role="group" aria-label="Before と After">
          <div class="slide-ba slide-ba--before">
            <p class="slide-ba__label">${esc(ba.beforeTitle || "Before")}</p>
            ${renderBulletList(ba.before)}
          </div>
          <div class="slide-ba__arrow" aria-hidden="true">→</div>
          <div class="slide-ba slide-ba--after">
            <p class="slide-ba__label">${esc(ba.afterTitle || "After")}</p>
            ${renderBulletList(ba.after)}
          </div>
        </div>${renderFootBullets(slide.footBullets)}`;
}

/** 3カラム（フェーズ A/B/C など） */
function renderBodyThreeCol(slide) {
  const tc = slide.threeCol;
  const cols = tc && Array.isArray(tc.columns) ? tc.columns : [];
  if (cols.length === 0) return renderBodyList(slide);
  const panels = cols
    .map(
      (col, i) => `
          <div class="slide-panel slide-panel--col slide-panel--col-${i + 1}">
            <h3 class="slide-panel__title">${esc(col.title || "")}</h3>
            ${renderBulletList(col.bullets)}
          </div>`
    )
    .join("");
  return `<div class="slide-body slide-layout slide-layout--threecol" role="group" aria-label="3カラム">${panels}
        </div>${renderFootBullets(slide.footBullets)}`;
}

function renderSlideBody(slide) {
  if (slide.section) {
    return renderBodySection(slide);
  }
  const layout = slide.layout || "list";
  switch (layout) {
    case "compare":
      return renderBodyCompare(slide);
    case "beforeafter":
      return renderBodyBeforeAfter(slide);
    case "threecol":
      return renderBodyThreeCol(slide);
    case "list":
    default:
      return renderBodyList(slide);
  }
}

function renderSlide(slide, index, total) {
  const prev = index > 0 ? `slide-${String(index).padStart(2, "0")}.html` : null;
  const next = index < total - 1 ? `slide-${String(index + 2).padStart(2, "0")}.html` : null;
  const coverClass = slide.cover ? " slide--cover" : "";
  const sectionClass = slide.section ? " slide--section" : "";

  const navParts = [
    `<a href="index.html">一覧</a>`,
    prev ? `<a href="${prev}">← 前</a>` : `<span class="nav-meta">← 前</span>`,
    `<span class="nav-meta">${index + 1} / ${total}</span>`,
    next ? `<a href="${next}">次 →</a>` : `<span class="nav-meta">次 →</span>`,
  ];

  const subBlock = slide.sub ? `<p class="slide-sub">${esc(slide.sub)}</p>` : "";

  const bodyBlock = renderSlideBody(slide);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>スライド ${index + 1}/${total} — ${esc(slide.title)}</title>
  <link rel="stylesheet" href="assets/slides.css" />
</head>
<body>
  <div class="shell">
    <nav class="nav" aria-label="スライドナビ">
      ${navParts.join("\n      ")}
    </nav>
    <div class="slide-wrap">
      <main class="slide${coverClass}${sectionClass}">
        <p class="kicker">${esc(slide.kicker)}</p>
        <h1 class="slide-title">${esc(slide.title)}</h1>
        ${subBlock}
        ${bodyBlock}
        <footer class="slide-footer">Cursor AIコード生成研修 · 構成案（ドラフト）</footer>
      </main>
    </div>
  </div>
</body>
</html>
`;
}

const outDir = __dirname;
for (let i = 0; i < slides.length; i++) {
  const num = String(i + 1).padStart(2, "0");
  fs.writeFileSync(path.join(outDir, `slide-${num}.html`), renderSlide(slides[i], i, slides.length), "utf8");
}

console.log(`Wrote ${slides.length} slides from slides-data.json`);
