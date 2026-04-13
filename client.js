/**
 * スライド案エディタ — ブリーフから構成生成 + localStorage 保存
 */

const STORAGE_KEY_V1 = "genspark-slide-draft-v1";
const STORAGE_KEY = "genspark-slide-draft-v2";

const TYPE_LABELS = {
  proposal: "提案",
  report: "報告・共有",
  training: "研修・教育",
  sales: "営業・紹介",
  explain: "説明・プレゼン",
  other: "その他",
};

/** @typedef {{ title: string, body: string | (ctx: object) => string }} SectionTpl */

/** @type {Record<string, SectionTpl[]>} */
const SECTION_POOLS = {
  proposal: [
    { title: "背景・現状", body: (c) => `- いまの状況（事実・データ）\n- ${c.audience} にとっての文脈\n- （数値・根拠を追記）` },
    { title: "課題・ニーズ", body: (c) => `- 解決すべき課題\n- 対象者（${c.audience}）のニーズ\n- （優先度・緊急度）` },
    { title: "提案の概要", body: (c) => `- 提案の一言要約\n- 主目的「${truncateOneLine(c.purpose, 50)}」との対応\n- （編集してください）` },
    { title: "ソリューション詳細", body: `- 具体的な仕組み・進め方\n- スコープ（含む／含まない）\n- （図・表の予定）` },
    { title: "期待効果", body: `- 定性的効果\n- 定量的効果（目安）\n- （検証方法）` },
    { title: "実施計画", body: `- マイルストーン\n- 体制・役割\n- （スケジュール表を追記）` },
    { title: "投資対効果・条件", body: `- コスト・期間の目安\n- 前提条件・リスク\n- （承認に必要な情報）` },
  ],
  report: [
    { title: "エグゼクティブサマリー", body: (c) => `- 結論（1〜2行）\n- 主目的との関係\n- （${c.audience}向けに要約）` },
    { title: "実施内容・経緯", body: `- 実施したこと\n- スケジュール\n- （成果物リンク）` },
    { title: "進捗・結果", body: `- 計画比の進捗\n- 成果指標\n- （グラフ・表）` },
    { title: "課題・リスク", body: `- いまの課題\n- 影響と対策\n- エスカレーション要否` },
    { title: "次のステップ", body: `- 今後の予定\n- 依頼事項（関係者）\n- （期限）` },
  ],
  training: [
    { title: "本日のゴール", body: (c) => `- 学習目標（できるようになること）\n- 対象者: ${c.audience}\n- （前提知識）` },
    { title: "キーポイント", body: `- 重要概念の整理\n- よくある誤解\n- （例・比喩）` },
    { title: "手順・やり方", body: `- ステップ1〜\n- チェックポイント\n- （デモの予定）` },
    { title: "演習・ディスカッション", body: `- 課題\n- 進め方\n- （時間配分）` },
    { title: "まとめ（要点の再確認）", body: `- 3つの要点\n- 参考資料\n- （宿題・フォロー）` },
  ],
  sales: [
    { title: "課題の確認", body: (c) => `- 顧客の状況・課題仮説\n- 本日のゴール\n- （${c.audience}の関心事）` },
    { title: "ソリューション概要", body: `- 提供価値（一言）\n- 差別化ポイント\n- （導入イメージ）` },
    { title: "機能・事例", body: `- 主要機能\n- 導入事例（業界・規模）\n- （実績数値）` },
    { title: "進め方・体制", body: `- 導入ステップ\n- 支援内容\n- （期間・費用の枠）` },
    { title: "次のアクション", body: `- 提案する次の打合せ\n- 必要情報・資料依頼\n- （クロージング）` },
  ],
  explain: [
    { title: "全体像", body: (c) => `- 何について話すか\n- なぜ今か\n- 対象者（${c.audience}）へのメリット` },
    { title: "ポイント（要点）", body: `- 要点1\n- 要点2\n- 要点3` },
    { title: "詳細・補足", body: `- 仕組み・ルール\n- 例外・注意点\n- （FAQ）` },
    { title: "具体例", body: `- シナリオ\n- Before / After\n- （画面・図）` },
    { title: "論点・確認事項", body: `- 決めたいこと\n- 確認したいこと\n- （次に必要な情報）` },
  ],
  other: [
    { title: "概要", body: (c) => `- テーマ\n- 目的: ${truncateOneLine(c.purpose, 60)}\n- 対象者: ${c.audience}` },
    { title: "本論（1）", body: `- 論点・データ\n- （根拠）\n- （図表）` },
    { title: "本論（2）", body: `- 論点・データ\n- （比較）\n- （事例）` },
    { title: "本論（3）", body: `- 論点・データ\n- （リスク）\n- （代替案）` },
    { title: "結び", body: `- メッセージ\n- 次のステップ\n- （質疑の受け方）` },
  ],
};

function truncateOneLine(text, max) {
  const line = String(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return "（記入）";
  return line.length <= max ? line : line.slice(0, max - 1) + "…";
}

function coverTitle(purpose) {
  const line = String(purpose)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return "（表紙）";
  return line.length > 40 ? line.slice(0, 39) + "…" : line;
}

function materializeBody(tpl, ctx) {
  if (typeof tpl.body === "function") return tpl.body(ctx);
  return tpl.body;
}

/**
 * @param {SectionTpl[]} pool
 * @param {object} ctx
 * @param {number} count
 */
function materializeSections(pool, ctx, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const tpl = pool[i % pool.length];
    const cycle = Math.floor(i / pool.length);
    const title = cycle === 0 ? tpl.title : `${tpl.title}（${cycle + 1}）`;
    out.push({ title, body: materializeBody(tpl, ctx) });
  }
  return out;
}

function defaultBrief() {
  return {
    purpose: "",
    audience: "",
    type: "explain",
    pageCount: 5,
  };
}

function normalizeBrief(b) {
  const d = defaultBrief();
  const n = parseInt(String(b.pageCount ?? d.pageCount), 10);
  const typeKey = typeof b.type === "string" && SECTION_POOLS[b.type] ? b.type : d.type;
  return {
    purpose: String(b.purpose ?? d.purpose),
    audience: String(b.audience ?? d.audience),
    type: typeKey,
    pageCount: Number.isFinite(n) && n >= 1 ? Math.min(50, n) : d.pageCount,
  };
}

/**
 * @param {{ purpose: string, audience: string, type: string, pageCount: number }} brief
 * @returns {{ title: string, body: string }[]}
 */
function generateSlidesFromBrief(brief) {
  const purpose = (brief.purpose || "").trim() || "（主目的を入力してください）";
  const audience = (brief.audience || "").trim() || "（対象者）";
  const typeKey = brief.type && SECTION_POOLS[brief.type] ? brief.type : "other";
  const typeLabel = TYPE_LABELS[typeKey] || TYPE_LABELS.other;
  const P = Math.max(1, Math.min(50, parseInt(String(brief.pageCount), 10) || 5));

  const ctx = { purpose, audience, typeLabel, typeKey };
  const pool = SECTION_POOLS[typeKey] || SECTION_POOLS.other;

  const slides = [];

  if (P === 1) {
    slides.push({
      title: coverTitle(purpose),
      body: [
        `- 主目的: ${purpose}`,
        `- 対象者: ${audience}`,
        `- 種別: ${typeLabel}`,
        `- （この1枚に全体をまとめる場合のメモ・図表の予定）`,
      ].join("\n"),
    });
    return slides;
  }

  slides.push({
    title: coverTitle(purpose),
    body: [`- 主目的: ${purpose}`, `- 対象者: ${audience}`, `- 種別: ${typeLabel}`].join("\n"),
  });

  if (P === 2) {
    slides.push({
      title: "まとめ・Next step",
      body: [
        `- 本日の目的の振り返り（${truncateOneLine(purpose, 40)}）`,
        `- 対象者（${audience}）へのお願い・確認事項`,
        `- 次のアクション・期限（編集してください）`,
      ].join("\n"),
    });
    return slides;
  }

  let middleCount;
  if (P === 3) {
    middleCount = 1;
  } else {
    middleCount = P - 3;
  }

  const middleSections = materializeSections(pool, ctx, middleCount);

  if (P >= 4) {
    const agendaLines = [
      `- 対象者: ${audience}`,
      `- 種別: ${typeLabel}`,
      "",
      "- 進行予定:",
      ...middleSections.map((s, i) => `- ${i + 1}. ${s.title}`),
      `- ${middleSections.length + 1}. まとめ・Next step`,
      "",
      "- （所要時間・配布資料を追記）",
    ];
    slides.push({
      title: "本日の流れ（アジェンダ）",
      body: agendaLines.join("\n"),
    });
  }

  for (const s of middleSections) {
    slides.push({ title: s.title, body: s.body });
  }

  slides.push({
    title: "まとめ・Next step",
    body: [
      `- メッセージ（一言）: ${truncateOneLine(purpose, 45)}`,
      `- 対象者（${audience}）に取ってほしいアクション`,
      `- 次の打合せ・期限・宿題（編集してください）`,
    ].join("\n"),
  });

  return slides;
}

const defaultSlides = () => [
  { title: "表紙：プレゼンテーションのタイトル", body: "サブタイトルや日付など（1行1項目）" },
  { title: "本日のアジェンダ", body: "項目1\n項目2\n項目3" },
  { title: "まとめ", body: "メッセージ\nNext step" },
];

function loadState() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const oldRaw = localStorage.getItem(STORAGE_KEY_V1);
      if (oldRaw) {
        const data = JSON.parse(oldRaw);
        const slides = Array.isArray(data.slides)
          ? data.slides.map((s) => ({ title: String(s.title ?? ""), body: String(s.body ?? "") }))
          : defaultSlides();
        const state = { slides: slides.length ? slides : defaultSlides(), brief: defaultBrief() };
        saveState(state);
        return state;
      }
    }
    if (!raw) return { slides: defaultSlides(), brief: defaultBrief() };
    const data = JSON.parse(raw);
    const slides = Array.isArray(data.slides) && data.slides.length
      ? data.slides.map((s) => ({ title: String(s.title ?? ""), body: String(s.body ?? "") }))
      : defaultSlides();
    const brief = normalizeBrief(data.brief || {});
    return { slides, brief };
  } catch {
    return { slides: defaultSlides(), brief: defaultBrief() };
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ slides: state.slides, brief: state.brief }));
}

/**
 * 本文を HTML に変換（プレビュー・書き出し共通）
 * - ### セクション見出し / ## サブ見出し
 * - :::cards … ::: で3カード（中身は ### カードタイトル + 箇条書き）
 * - :::compare … ::: で対比（### 左 / ### 右 または 《左》《右》）
 * - :::table … ::: で表（| 区切り）
 */
function parseBodyToHtml(text) {
  const s = String(text || "");
  if (!s.trim()) return "";

  const segments = [];
  const fenceRe = /:::(cards|3cards|compare|table)\r?\n([\s\S]*?)\r?\n:::/g;
  let lastIndex = 0;
  let m;
  while ((m = fenceRe.exec(s)) !== null) {
    const before = s.slice(lastIndex, m.index);
    if (before.trim()) segments.push({ type: "normal", content: before });
    segments.push({ type: m[1], content: m[2] });
    lastIndex = m.index + m[0].length;
  }
  const end = s.slice(lastIndex);
  if (end.trim()) segments.push({ type: "normal", content: end });
  if (segments.length === 0) segments.push({ type: "normal", content: s });

  return segments
    .map((seg) => {
      if (seg.type === "cards" || seg.type === "3cards") return parseCardsBlock(seg.content);
      if (seg.type === "compare") return parseCompareFenced(seg.content);
      if (seg.type === "table") return parseTableBlock(seg.content);
      return parseNormalSegment(seg.content);
    })
    .join("");
}

function bulletLinesToHtml(lines) {
  const items = lines
    .map((l) => l.trim())
    .filter((l) => l.length)
    .map((l) => l.replace(/^[-・*•\u2022]\s?|^[0-9]+[.)]\s?/, "").trim())
    .filter(Boolean);
  if (!items.length) return "";
  return `<ul>${items.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`;
}

function parseCardsBlock(inner) {
  const raw = inner.trim();
  if (!raw) return "";
  const parts = raw.split(/\n(?=### )/).map((p) => p.trim()).filter(Boolean);
  const cards = parts.map((p) => {
    const lines = p.split(/\r?\n/).map((l) => l.trimEnd());
    const first = lines[0].replace(/^###\s*/, "").trim();
    const rest = lines.slice(1).map((l) => l.trim()).filter(Boolean);
    return `<div class="slide-card"><h4 class="slide-card-title">${escapeHtml(first)}</h4>${bulletLinesToHtml(rest)}</div>`;
  });
  return `<div class="slide-cards">${cards.join("")}</div>`;
}

function parseLooseBody(inner) {
  const t = inner.trim();
  if (!t) return "";
  if (/^[-・*•\u2022]\s?/.test(t) || /^[0-9]+[.)]\s?/.test(t)) {
    return bulletLinesToHtml(t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
  }
  return parseNormalSegment(t);
}

function parseCompareFenced(inner) {
  const t = inner.trim();
  const idxRight = t.search(/^###\s*右\s*$/m);
  if (/^###\s*左\s*$/m.test(t) && idxRight > 0) {
    const head = t.slice(0, idxRight).trim();
    const tail = t.slice(idxRight).replace(/^###\s*右\s*\n?/m, "").trim();
    const leftBody = head.replace(/^###\s*左\s*\n?/m, "").trim();
    return (
      `<div class="slide-compare">` +
      `<div class="slide-compare-col"><div class="slide-compare-label">左</div>${parseLooseBody(leftBody)}</div>` +
      `<div class="slide-compare-col"><div class="slide-compare-label">右</div>${parseLooseBody(tail)}</div>` +
      `</div>`
    );
  }
  const m2 = t.match(/《左》\s*([^\n]*)\s*\n([\s\S]*?)《右》\s*([^\n]*)\s*\n([\s\S]*)/);
  if (m2) {
    return (
      `<div class="slide-compare">` +
      `<div class="slide-compare-col"><div class="slide-compare-label">${escapeHtml((m2[1] || "左").trim() || "左")}</div>${parseLooseBody(m2[2])}</div>` +
      `<div class="slide-compare-col"><div class="slide-compare-label">${escapeHtml((m2[3] || "右").trim() || "右")}</div>${parseLooseBody(m2[4])}</div>` +
      `</div>`
    );
  }
  return `<div class="slide-compare slide-compare--plain">${parseNormalSegment(t)}</div>`;
}

function parseTableBlock(inner) {
  const lines = inner.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const pipeLines = lines.filter((l) => l.includes("|"));
  if (pipeLines.length < 1) return `<p>${escapeHtml(inner)}</p>`;

  const parseCells = (line) => {
    const parts = line.split("|").map((c) => c.trim());
    return parts.filter((c, i, arr) => !(c === "" && (i === 0 || i === arr.length - 1)));
  };

  const dataRows = pipeLines.filter((l) => !/^\|[\s\-:\-|]+\|?$/.test(l.replace(/\s/g, "")));
  if (dataRows.length < 1) return `<p>${escapeHtml(inner)}</p>`;

  const headerCells = parseCells(dataRows[0]);
  const bodyRows = dataRows.slice(1);
  const thead = `<thead><tr>${headerCells.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${bodyRows
    .map((row) => {
      const cells = parseCells(row);
      return `<tr>${cells.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`;
    })
    .join("")}</tbody>`;
  return `<div class="slide-table-wrap"><table class="slide-table">${thead}${tbody}</table></div>`;
}

function parseNormalSegment(text) {
  const lines = text.split(/\r?\n/);
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (!t) {
      i++;
      continue;
    }
    if (t.startsWith("### ")) {
      html.push(`<h3 class="slide-section">${escapeHtml(t.slice(4).trim())}</h3>`);
      i++;
      continue;
    }
    if (t.startsWith("## ") && !t.startsWith("###")) {
      html.push(`<p class="slide-eyebrow">${escapeHtml(t.slice(3).trim())}</p>`);
      i++;
      continue;
    }
    if (/^[-・*•\u2022]\s?/.test(t) || /^[0-9]+[.)]\s?/.test(t)) {
      const bulletLines = [];
      while (i < lines.length) {
        const lt = lines[i].trim();
        if (!/^[-・*•\u2022]\s?/.test(lt) && !/^[0-9]+[.)]\s?/.test(lt)) break;
        bulletLines.push(lt);
        i++;
      }
      html.push(bulletLinesToHtml(bulletLines));
      continue;
    }
    const paraLines = [];
    while (i < lines.length) {
      const lt = lines[i].trim();
      if (!lt) break;
      if (lt.startsWith("### ") || (lt.startsWith("## ") && !lt.startsWith("###"))) break;
      if (/^[-・*•\u2022]\s?/.test(lt) || /^[0-9]+[.)]\s?/.test(lt)) break;
      paraLines.push(lt);
      i++;
    }
    if (paraLines.length) html.push(`<p>${escapeHtml(paraLines.join(" "))}</p>`);
  }
  return html.join("");
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderSlideInner(slide) {
  const title = slide.title.trim();
  const bodyHtml = parseBodyToHtml(slide.body);
  if (!title && !bodyHtml) {
    return '<p class="empty-hint">タイトルと本文を入力すると表示されます</p>';
  }
  let html = "";
  if (title) {
    html += `<h2 class="slide-title">${escapeHtml(title)}</h2>`;
  }
  if (bodyHtml) {
    html += `<div class="slide-body">${bodyHtml}</div>`;
  }
  return html;
}

function buildStandaloneHtml(slides) {
  const slidesHtml = slides
    .map(
      (s, i) => `
    <section class="deck-slide" data-index="${i}">
      ${renderSlideInner(s)}
    </section>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>スライド案（書き出し）</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif; background: #f4f4f5; color: #18181b; padding: 1.5rem; }
    h1 { font-size: 1rem; margin: 0 0 1rem; color: #71717a; }
    .deck { max-width: 900px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.25rem; }
    .deck-slide {
      background: #fafafa; border: 1px solid #e4e4e7; border-radius: 10px;
      padding: 1.75rem 2rem; min-height: 200px;
      aspect-ratio: 16 / 9; display: flex; flex-direction: column; justify-content: center;
    }
    .slide-title { margin: 0 0 1rem; font-size: 1.35rem; font-weight: 700; line-height: 1.25; }
    .slide-body { margin: 0; font-size: 0.95rem; line-height: 1.55; }
    .slide-body ul { margin: 0; padding-left: 1.25rem; }
    .slide-body li { margin-bottom: 0.35rem; }
    .slide-body p { margin: 0 0 0.5rem; }
    .slide-body .slide-section { margin: 0 0 0.5rem; font-size: 0.95rem; font-weight: 700; color: #2563eb; line-height: 1.3; }
    .slide-body .slide-eyebrow { margin: 0 0 0.35rem; font-size: 0.8rem; font-weight: 600; color: #71717a; letter-spacing: 0.06em; }
    .slide-body .slide-cards { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 0.55rem; margin: 0.4rem 0 0.6rem; }
    .slide-body .slide-card { background: #fff; border: 1px solid #e4e4e7; border-radius: 8px; padding: 0.5rem 0.55rem; }
    .slide-body .slide-card-title { margin: 0 0 0.35rem; font-size: 0.85rem; font-weight: 700; line-height: 1.25; }
    .slide-body .slide-card ul { font-size: 0.78rem; padding-left: 1rem; }
    .slide-body .slide-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem; margin: 0.4rem 0 0.6rem; }
    .slide-body .slide-compare-col { background: #fff; border: 1px solid #e4e4e7; border-radius: 8px; padding: 0.5rem 0.55rem; }
    .slide-body .slide-compare-label { font-size: 0.7rem; font-weight: 700; color: #71717a; margin-bottom: 0.35rem; }
    .slide-body .slide-table-wrap { margin: 0.4rem 0; overflow-x: auto; max-width: 100%; }
    .slide-body .slide-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; border: 1px solid #e4e4e7; }
    .slide-body .slide-table th, .slide-body .slide-table td { border: 1px solid #e4e4e7; padding: 0.35rem 0.45rem; text-align: left; vertical-align: top; }
    .slide-body .slide-table th { background: #f4f4f5; font-weight: 600; }
    @media (max-width: 640px) { .slide-body .slide-cards { grid-template-columns: 1fr; } .slide-body .slide-compare { grid-template-columns: 1fr; } }
    .empty-hint { color: #71717a; margin: 0; }
  </style>
</head>
<body>
  <h1>スライド内容案（${slides.length}枚）</h1>
  <div class="deck">
${slidesHtml}
  </div>
</body>
</html>`;
}

function readBriefFromForm(els) {
  const n = parseInt(String(els.briefPages.value), 10);
  return normalizeBrief({
    purpose: els.briefPurpose.value,
    audience: els.briefAudience.value,
    type: els.briefType.value,
    pageCount: Number.isFinite(n) ? n : 5,
  });
}

function writeBriefToForm(brief, els) {
  const b = normalizeBrief(brief);
  els.briefPurpose.value = b.purpose;
  els.briefAudience.value = b.audience;
  els.briefType.value = SECTION_POOLS[b.type] ? b.type : "other";
  els.briefPages.value = String(b.pageCount);
}

function init() {
  let state = loadState();
  let activeIndex = 0;

  const els = {
    slideList: document.getElementById("slide-list"),
    titleInput: document.getElementById("slide-title"),
    bodyInput: document.getElementById("slide-body"),
    preview: document.getElementById("slide-preview"),
    thumbStrip: document.getElementById("thumb-strip"),
    btnOpenPreview: document.getElementById("btn-open-preview"),
    btnAdd: document.getElementById("btn-add-slide"),
    btnDel: document.getElementById("btn-delete-slide"),
    btnExport: document.getElementById("btn-export-html"),
    btnReset: document.getElementById("btn-reset-sample"),
    btnGenerate: document.getElementById("btn-generate-outline"),
    btnGenerateOpenai: document.getElementById("btn-generate-openai"),
    openaiHint: document.getElementById("openai-hint"),
    briefPurpose: document.getElementById("brief-purpose"),
    briefAudience: document.getElementById("brief-audience"),
    briefType: document.getElementById("brief-type"),
    briefPages: document.getElementById("brief-pages"),
  };

  function applyExternalState() {
    const next = loadState();
    state = {
      slides: Array.isArray(next.slides) && next.slides.length ? next.slides : [{ title: "", body: "" }],
      brief: normalizeBrief(next.brief || {}),
    };
    activeIndex = Math.max(0, Math.min(activeIndex, state.slides.length - 1));
    render();
  }

  function persist() {
    saveState(state);
  }

  function persistBriefFromForm() {
    state.brief = readBriefFromForm(els);
    persist();
  }

  function setActive(index) {
    activeIndex = Math.max(0, Math.min(index, state.slides.length - 1));
    if (state.slides.length === 0) {
      state.slides.push({ title: "", body: "" });
      activeIndex = 0;
      persist();
    }
    render();
  }

  function render() {
    const slide = state.slides[activeIndex];

    els.slideList.innerHTML = state.slides
      .map(
        (_, i) => `
      <li>
        <button type="button" class="slide-item ${i === activeIndex ? "is-active" : ""}" data-index="${i}">
          <span class="num">${i + 1}.</span>${escapeHtml(state.slides[i].title.trim() || "（無題）")}
        </button>
      </li>`
      )
      .join("");

    els.slideList.querySelectorAll(".slide-item").forEach((btn) => {
      btn.addEventListener("click", () => setActive(Number(btn.dataset.index)));
    });

    els.titleInput.value = slide.title;
    els.bodyInput.value = slide.body;
    if (els.preview) {
      els.preview.innerHTML = renderSlideInner(slide);
    }

    if (els.thumbStrip) {
      els.thumbStrip.innerHTML = state.slides
        .map(
          (s, i) => `
      <button type="button" class="thumb ${i === activeIndex ? "is-active" : ""}" data-index="${i}" title="スライド ${i + 1}">
        <div class="thumb-inner">
          <p class="thumb-title">${escapeHtml(s.title.trim() || "（無題）")}</p>
          ${thumbBodyPreview(s.body)}
        </div>
      </button>`
        )
        .join("");

      els.thumbStrip.querySelectorAll(".thumb").forEach((btn) => {
        btn.addEventListener("click", () => setActive(Number(btn.dataset.index)));
      });
    }

    writeBriefToForm(state.brief, els);
  }

  function thumbBodyPreview(body) {
    const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const slice = lines.slice(0, 4);
    if (slice.length === 0) return "";
    const items = slice.map((l) => l.replace(/^[-・*•]\s?|^[0-9]+[.)]\s?/, "").trim());
    return `<ul>${items.map((t) => `<li>${escapeHtml(t.length > 28 ? t.slice(0, 28) + "…" : t)}</li>`).join("")}</ul>`;
  }

  function onFieldInput() {
    state.slides[activeIndex] = {
      title: els.titleInput.value,
      body: els.bodyInput.value,
    };
    persist();
    if (els.preview) {
      els.preview.innerHTML = renderSlideInner(state.slides[activeIndex]);
    }
    syncListAndThumbsFromState();
  }

  function syncListAndThumbsFromState() {
    const slide = state.slides[activeIndex];
    const titleText = slide.title.trim() || "（無題）";

    els.slideList.querySelectorAll(".slide-item").forEach((btn, i) => {
      btn.classList.toggle("is-active", i === activeIndex);
      if (i === activeIndex) {
        btn.innerHTML = `<span class="num">${activeIndex + 1}.</span>${escapeHtml(titleText)}`;
      }
    });

    if (!els.thumbStrip) return;
    els.thumbStrip.querySelectorAll(".thumb").forEach((btn, i) => {
      const s = state.slides[i];
      btn.classList.toggle("is-active", i === activeIndex);
      if (i !== activeIndex) return;
      const inner = btn.querySelector(".thumb-inner");
      if (inner) {
        inner.innerHTML = `<p class="thumb-title">${escapeHtml(s.title.trim() || "（無題）")}</p>${thumbBodyPreview(s.body)}`;
      }
    });
  }

  if (els.btnOpenPreview) {
    els.btnOpenPreview.addEventListener("click", () => {
      persist();
      window.open("preview.html", "_blank", "noopener,noreferrer");
    });
  }

  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY || e.newValue == null) return;
    applyExternalState();
  });

  els.titleInput.addEventListener("input", onFieldInput);
  els.bodyInput.addEventListener("input", onFieldInput);

  ["input", "change"].forEach((ev) => {
    els.briefPurpose.addEventListener(ev, persistBriefFromForm);
    els.briefAudience.addEventListener(ev, persistBriefFromForm);
    els.briefType.addEventListener(ev, persistBriefFromForm);
    els.briefPages.addEventListener(ev, persistBriefFromForm);
  });

  els.btnGenerate.addEventListener("click", () => {
    state.brief = readBriefFromForm(els);
    const next = generateSlidesFromBrief(state.brief);
    state.slides = next;
    activeIndex = 0;
    persist();
    render();
  });

  if (els.btnGenerateOpenai) {
    els.btnGenerateOpenai.addEventListener("click", async () => {
      state.brief = readBriefFromForm(els);
      const btn = els.btnGenerateOpenai;
      const prevText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "生成中…";
      if (els.openaiHint) {
        els.openaiHint.textContent = "OpenAI に送信中…";
      }
      try {
        const res = await fetch("/api/generate-slides", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(state.brief),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          const msg = data.error || `HTTP ${res.status}`;
          throw new Error(msg);
        }
        if (!Array.isArray(data.slides) || data.slides.length === 0) {
          throw new Error("スライドデータが空です");
        }
        state.slides = data.slides.map((s) => ({
          title: String(s.title ?? ""),
          body: String(s.body ?? ""),
        }));
        activeIndex = 0;
        persist();
        render();
        if (els.openaiHint) {
          els.openaiHint.textContent = `OpenAI で ${state.slides.length} 枚を生成しました（${data.model || "model 不明"}）。`;
        }
      } catch (e) {
        const isNetwork =
          e instanceof TypeError ||
          (e && String(e.message).includes("Failed to fetch")) ||
          (e && String(e.message).includes("NetworkError"));
        const hint = isNetwork
          ? "接続できませんでした。ターミナルで npm run dev を起動し、http://localhost:8787/ でこのページを開いていますか？（file:// では動きません）"
          : e instanceof Error
            ? e.message
            : String(e);
        if (els.openaiHint) {
          els.openaiHint.textContent = `エラー: ${hint}`;
        } else {
          alert(hint);
        }
      } finally {
        btn.disabled = false;
        btn.textContent = prevText;
      }
    });
  }

  els.btnAdd.addEventListener("click", () => {
    state.slides.splice(activeIndex + 1, 0, { title: "", body: "" });
    activeIndex += 1;
    persist();
    render();
  });

  els.btnDel.addEventListener("click", () => {
    if (state.slides.length <= 1) {
      state.slides[0] = { title: "", body: "" };
    } else {
      state.slides.splice(activeIndex, 1);
      activeIndex = Math.min(activeIndex, state.slides.length - 1);
    }
    persist();
    render();
  });

  els.btnExport.addEventListener("click", () => {
    const html = buildStandaloneHtml(state.slides);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `slide-draft-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  els.btnReset.addEventListener("click", () => {
    if (!confirm("サンプル構成に戻します。スライド内容とブリーフ入力は失われます。よろしいですか？")) return;
    state = { slides: defaultSlides(), brief: defaultBrief() };
    activeIndex = 0;
    persist();
    render();
  });

  render();
}

document.addEventListener("DOMContentLoaded", init);
