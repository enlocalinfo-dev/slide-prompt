/**
 * スライド案エディタ — ブリーフから構成生成 + localStorage 保存
 */

const STORAGE_KEY_V1 = "genspark-slide-draft-v1";
const STORAGE_KEY = "genspark-slide-draft-v2";

/** スライドの見た目プリセット（プレビュー・書き出しでクラスとして適用） */
const LAYOUT_IDS = ["default", "vscode", "cols3", "cards", "section", "toc", "compare", "media"];

const LAYOUT_PRESETS = [
  { id: "default", label: "標準", hint: "白背景・汎用" },
  { id: "vscode", label: "VS Code風", hint: "ダーク・エディタ風" },
  { id: "cols3", label: "3カラム表", hint: "表レイアウト強調" },
  { id: "cards", label: "3カード", hint: "横並びカード強調" },
  { id: "section", label: "セクション", hint: "章扉・大見出し" },
  { id: "toc", label: "目次", hint: "アジェンダ・流れ" },
  { id: "compare", label: "VS対比", hint: "左右対比" },
  { id: "media", label: "左画像", hint: "画像＋右テキスト" },
];

/** 本文が空のときだけ、レイアウト選択で挿入するひな形（先頭は :::subtitle → デザインパターン） */
const LAYOUT_STARTERS = {
  default: `:::subtitle\n聞き手へのサブメッセージ（1行）\n:::\n\n:::cards\n### 論点A\n- 要点\n### 論点B\n- 要点\n### 論点C\n- 要点\n:::`,
  vscode: `:::subtitle\n画面の役割を1行で\n:::\n\n### 画面構成\n- 左: サイドバー\n- 中央: エディタ\n- 右: パネル`,
  cols3: `:::subtitle\n3カラムで整理するメッセージ\n:::\n\n:::table\n| 列A | 列B | 列C |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |\n:::`,
  cards: `:::subtitle\n3カードで伝える要点\n:::\n\n:::cards\n### カード1\n- 要点\n### カード2\n- 要点\n### カード3\n- 要点\n:::`,
  section: `:::subtitle\nこの章で伝えること（1行）\n:::\n\n:::cards\n### キーメッセージ\n- 一言\n### 次の論点\n- 橋渡し\n### 期待アクション\n- （編集）\n:::`,
  toc: `:::subtitle\n進行のイメージ\n:::\n\n## 本日の流れ\n1. イントロダクション\n2. 本論\n3. まとめ`,
  compare: `:::subtitle\n対比で見せるメリット\n:::\n\n:::compare\n### 左\n- 現状・課題\n### 右\n- 提案後・効果\n:::`,
  media: `:::subtitle\nビジュアルとセットで伝える内容\n:::\n\n:::media\nhttps://images.unsplash.com/photo-1552664730-d307ca884978?w=480&q=80\n### ポイント\n- 左に画像・右に説明\n- URLは1行目（または ![alt](URL) ）\n:::`,
};

function normalizeLayout(id) {
  const s = String(id || "").trim();
  return LAYOUT_IDS.includes(s) ? s : "default";
}

function normalizeSlide(raw) {
  return {
    title: String(raw?.title ?? ""),
    body: String(raw?.body ?? ""),
    layout: normalizeLayout(raw?.layout),
  };
}

function applyLayoutPreset(slide, layoutId) {
  const id = normalizeLayout(layoutId);
  slide.layout = id;
  const starter = LAYOUT_STARTERS[id];
  if (starter && !String(slide.body || "").trim()) {
    slide.body = starter;
  }
}

function escAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function fillLayoutPresetBar(container) {
  if (!container || container.dataset.filled === "1") return;
  container.innerHTML = `
    <span class="layout-preset-label">デザイン</span>
    <div class="layout-preset-tabs" role="tablist">
      ${LAYOUT_PRESETS.map(
        (p) =>
          `<button type="button" class="layout-preset-btn" data-layout="${escAttr(p.id)}" title="${escAttr(p.hint)}" role="tab">${escAttr(p.label)}</button>`
      ).join("")}
    </div>`;
  container.dataset.filled = "1";
}

function updateLayoutPresetBarUI(container, layoutId) {
  if (!container) return;
  const lid = normalizeLayout(layoutId);
  container.querySelectorAll(".layout-preset-btn[data-layout]").forEach((btn) => {
    const on = btn.dataset.layout === lid;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

const TYPE_LABELS = {
  proposal: "提案",
  report: "報告・共有",
  training: "研修・教育",
  sales: "営業・紹介",
  explain: "説明・プレゼン",
  other: "その他",
};

/** サブメッセージ（タイトル直下）＋本文ブロック */
function slideSub(subtitle, bodyMd) {
  return `:::subtitle\n${String(subtitle).trim()}\n:::\n\n${String(bodyMd).trim()}`;
}

/** @typedef {{ title: string, body: string | (ctx: object) => string }} SectionTpl */

/** @type {Record<string, SectionTpl[]>} */
const SECTION_POOLS = {
  proposal: [
    {
      title: "背景・現状",
      body: (c) =>
        slideSub(`${c.audience} にとっての現状`, `:::cards\n### 事実・データ\n- （根拠）\n### 文脈\n- ${c.audience} の視点\n### 数値・根拠\n- （追記）\n:::`),
    },
    {
      title: "課題・ニーズ",
      body: (c) =>
        slideSub("解決すべき論点", `:::compare\n### 左\n- いまの課題（優先度・緊急度）\n### 右\n- ${c.audience} のニーズ・期待\n:::`),
    },
    {
      title: "提案の概要",
      body: (c) =>
        slideSub("提案の一言", `:::table\n| 項目 | 内容 |\n| --- | --- |\n| 要約 | （編集） |\n| 主目的との対応 | ${truncateOneLine(c.purpose, 45)} |\n| 差別化 | （編集） |\n:::`),
    },
    {
      title: "ソリューション詳細",
      body: () =>
        slideSub("仕組みとスコープ", `:::cards\n### 進め方\n- ステップ\n### 含む範囲\n- （編集）\n### 含まない範囲\n- （編集）\n:::`),
    },
    {
      title: "期待効果",
      body: () =>
        slideSub("効果のイメージ", `:::table\n| 種類 | 内容 | 目安 |\n| --- | --- | --- |\n| 定性的 | （編集） |  |\n| 定量的 | （編集） |  |\n| 検証 | （編集） |  |\n:::`),
    },
    {
      title: "実施計画",
      body: () =>
        slideSub("マイルストーン", `:::cards\n### フェーズ1\n- 期限・成果物\n### フェーズ2\n- 体制\n### フェーズ3\n- リスク対応\n:::`),
    },
    {
      title: "投資対効果・条件",
      body: () =>
        slideSub("条件とリスク", `:::compare\n### 左\n- 投資・期間の目安 / 前提条件\n### 右\n- リスクと対策\n:::`),
    },
  ],
  report: [
    {
      title: "エグゼクティブサマリー",
      body: (c) =>
        slideSub(`${c.audience} 向け要約`, `:::cards\n### 結論\n- 1〜2行\n### 主目的との関係\n- （編集）\n### 次のアクション\n- （編集）\n:::`),
    },
    {
      title: "実施内容・経緯",
      body: () =>
        slideSub("実施の整理", `:::table\n| 項目 | 内容 |\n| --- | --- |\n| 実施内容 | （編集） |\n| スケジュール | （編集） |\n| 成果物 | リンク |\n:::`),
    },
    {
      title: "進捗・結果",
      body: () =>
        slideSub("計画比と指標", `:::cards\n### 進捗\n- 計画比\n### 成果指標\n- （数値）\n### グラフ・表\n- （予定）\n:::`),
    },
    {
      title: "課題・リスク",
      body: () =>
        slideSub("いまの論点", `:::cards\n### 課題\n- 内容\n### 影響と対策\n- （編集）\n### エスカレーション\n- 要否\n:::`),
    },
    {
      title: "次のステップ",
      body: () =>
        slideSub("依頼と期限", `:::cards\n### 今後の予定\n- （編集）\n### 依頼事項\n- 関係者\n### 期限\n- （編集）\n:::`),
    },
  ],
  training: [
    {
      title: "本日のゴール",
      body: (c) =>
        slideSub("学習で得るもの", `:::table\n| 項目 | 内容 |\n| --- | --- |\n| できるようになること | （編集） |\n| 対象者 | ${c.audience} |\n| 前提知識 | （編集） |\n:::`),
    },
    {
      title: "キーポイント",
      body: () =>
        slideSub("押さえる3点", `:::cards\n### 概念A\n- 整理\n### よくある誤解\n- （編集）\n### 例・比喩\n- （編集）\n:::`),
    },
    {
      title: "手順・やり方",
      body: () =>
        slideSub("進め方", `:::cards\n### ステップ1\n- チェック\n### ステップ2\n- チェック\n### デモ\n- （予定）\n:::`),
    },
    {
      title: "演習・ディスカッション",
      body: () =>
        slideSub("演習の進行", `:::compare\n### 左\n- 課題・進め方\n### 右\n- 時間配分・振り返り\n:::`),
    },
    {
      title: "まとめ（要点の再確認）",
      body: () =>
        slideSub("持ち帰る3つ", `:::cards\n### 要点1\n- \n### 要点2\n- \n### 参考・宿題\n- \n:::`),
    },
  ],
  sales: [
    {
      title: "課題の確認",
      body: (c) =>
        slideSub("顧客の状況", `:::cards\n### 状況\n- （編集）\n### 本日のゴール\n- （編集）\n### ${c.audience} の関心事\n- （編集）\n:::`),
    },
    {
      title: "ソリューション概要",
      body: () =>
        slideSub("提供価値", `:::compare\n### 左\n- 一言価値・差別化\n### 右\n- 導入イメージ\n:::`),
    },
    {
      title: "機能・事例",
      body: () =>
        slideSub("根拠の提示", `:::table\n| 区分 | 内容 |\n| --- | --- |\n| 主要機能 | （編集） |\n| 事例（業界） | （編集） |\n| 実績数値 | （編集） |\n:::`),
    },
    {
      title: "進め方・体制",
      body: () =>
        slideSub("導入の進め方", `:::cards\n### ステップ\n- （編集）\n### 支援内容\n- （編集）\n### 期間・費用の枠\n- （編集）\n:::`),
    },
    {
      title: "次のアクション",
      body: () =>
        slideSub("クロージング", `:::cards\n### 次の打合せ\n- （編集）\n### 必要情報\n- （編集）\n### 宿題\n- （編集）\n:::`),
    },
  ],
  explain: [
    {
      title: "全体像",
      body: (c) =>
        slideSub(`${c.audience} へのメリット`, `:::cards\n### テーマ\n- 何について\n### なぜ今か\n- 背景\n### メリット\n- 聞き手へ\n:::`),
    },
    {
      title: "ポイント（要点）",
      body: () =>
        slideSub("3つの要点", `:::cards\n### 要点1\n- （編集）\n### 要点2\n- （編集）\n### 要点3\n- （編集）\n:::`),
    },
    {
      title: "詳細・補足",
      body: () =>
        slideSub("ルールと例外", `:::table\n| 区分 | 内容 |\n| --- | --- |\n| 仕組み | （編集） |\n| 例外 | （編集） |\n| FAQ | （編集） |\n:::`),
    },
    {
      title: "具体例",
      body: () =>
        slideSub("シナリオで理解", `:::compare\n### 左\n- Before（編集）\n### 右\n- After（編集）\n:::\n\n### 補足\n- 画面・図の予定`),
    },
    {
      title: "論点・確認事項",
      body: () =>
        slideSub("決めたいこと", `:::cards\n### 決定事項\n- （編集）\n### 確認したいこと\n- （編集）\n### 次に必要な情報\n- （編集）\n:::`),
    },
  ],
  other: [
    {
      title: "概要",
      body: (c) =>
        slideSub("このプレゼンの位置づけ", `:::table\n| 項目 | 内容 |\n| --- | --- |\n| テーマ | （編集） |\n| 目的 | ${truncateOneLine(c.purpose, 50)} |\n| 対象者 | ${c.audience} |\n:::`),
    },
    {
      title: "本論（1）",
      body: () =>
        slideSub("論点と根拠", `:::cards\n### 論点\n- （編集）\n### データ\n- （編集）\n### 図表\n- （予定）\n:::`),
    },
    {
      title: "本論（2）",
      body: () =>
        slideSub("比較・事例", `:::cards\n### パターンA\n- （編集）\n### パターンB\n- （編集）\n### 事例\n- （編集）\n:::`),
    },
    {
      title: "本論（3）",
      body: () =>
        slideSub("リスクと代替案", `:::table\n| 論点 | 内容 | 備考 |\n| --- | --- | --- |\n| リスク | （編集） |  |\n| 代替案 | （編集） |  |\n:::`),
    },
    {
      title: "結び",
      body: () =>
        slideSub("締めのメッセージ", `:::cards\n### 一言メッセージ\n- （編集）\n### 次のステップ\n- （編集）\n### 質疑\n- （編集）\n:::`),
    },
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

  const L = () => ({ layout: "default" });

  if (P === 1) {
    slides.push({
      title: coverTitle(purpose),
      body: `:::subtitle\n${truncateOneLine(purpose, 72)}\n:::\n\n:::table\n| 項目 | 内容 |\n| --- | --- |\n| 主目的 | ${purpose} |\n| 対象者 | ${audience} |\n| 種別 | ${typeLabel} |\n| メモ | （図表・数値を追記） |\n:::`,
      ...L(),
    });
    return slides;
  }

  slides.push({
    title: coverTitle(purpose),
    body: `:::subtitle\n${truncateOneLine(purpose, 72)}\n:::\n\n:::table\n| 項目 | 内容 |\n| --- | --- |\n| 主目的 | ${purpose} |\n| 対象者 | ${audience} |\n| 種別 | ${typeLabel} |\n:::`,
    ...L(),
  });

  if (P === 2) {
    slides.push({
      title: "まとめ・Next step",
      body: slideSub("確認と次の一歩", `:::compare\n### 左\n- 本日の目的の振り返り（${truncateOneLine(purpose, 38)}）\n### 右\n- 対象者（${audience}）への依頼・次のアクション・期限\n:::`),
      ...L(),
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
    const agendaBody = `:::cards\n### 対象・種別\n- ${audience} / ${typeLabel}\n### 進行（例）\n${middleSections.map((s, i) => `- ${i + 1}. ${s.title}`).join("\n")}\n- ${middleSections.length + 1}. まとめ・Next step\n### 所要・資料\n- （時間・配布物を追記）\n:::`;
    slides.push({
      title: "本日の流れ（アジェンダ）",
      body: slideSub("進行の全体像", agendaBody),
      layout: "toc",
    });
  }

  for (const s of middleSections) {
    slides.push({ title: s.title, body: s.body, ...L() });
  }

  slides.push({
    title: "まとめ・Next step",
    body: slideSub("締めのメッセージ", `:::cards\n### 一言メッセージ\n- ${truncateOneLine(purpose, 48)}\n### お願い（${audience}）\n- 取ってほしいアクション\n### 次の打合せ・期限\n- （編集）\n:::`),
    ...L(),
  });

  return slides;
}

const defaultSlides = () => [
  {
    title: "表紙：プレゼンテーションのタイトル",
    body: `:::subtitle\n聞き手に一言で伝えるサブメッセージ\n:::\n\n:::table\n| 項目 | 内容 |\n| --- | --- |\n| サブタイトル | （編集） |\n| 日付 |  |\n| 作成 |  |\n:::`,
    layout: "default",
  },
  {
    title: "本日のアジェンダ",
    body: `:::subtitle\n進行と時間配分のイメージ\n:::\n\n:::cards\n### 1. 導入\n- 5分\n### 2. 本論\n- 20分\n### 3. まとめ\n- 10分\n:::`,
    layout: "toc",
  },
  {
    title: "まとめ",
    body: `:::subtitle\n次に取るアクションのイメージ\n:::\n\n:::media\nhttps://images.unsplash.com/photo-1552664730-d307ca884978?w=480&q=80\n### Next step\n- アクション1\n- アクション2\n:::`,
    layout: "default",
  },
];

function loadState() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const oldRaw = localStorage.getItem(STORAGE_KEY_V1);
      if (oldRaw) {
        const data = JSON.parse(oldRaw);
        const slides = Array.isArray(data.slides)
          ? data.slides.map((s) => normalizeSlide(s))
          : defaultSlides();
        const state = { slides: slides.length ? slides : defaultSlides(), brief: defaultBrief() };
        saveState(state);
        return state;
      }
    }
    if (!raw) return { slides: defaultSlides(), brief: defaultBrief() };
    const data = JSON.parse(raw);
    const slides = Array.isArray(data.slides) && data.slides.length
      ? data.slides.map((s) => normalizeSlide(s))
      : defaultSlides();
    const brief = normalizeBrief(data.brief || {});
    return { slides, brief };
  } catch {
    return { slides: defaultSlides().map((s) => normalizeSlide(s)), brief: defaultBrief() };
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ slides: state.slides, brief: state.brief }));
}

/**
 * 本文を HTML に変換（プレビュー・書き出し共通）
 * - 先頭の :::subtitle … ::: は renderSlideInner でタイトル直下に表示し、ここでは渡さない
 * - ### セクション見出し / ## サブ見出し
 * - :::cards … ::: で3カード（中身は ### カードタイトル + 箇条書き）
 * - :::compare … ::: で対比（### 左 / ### 右 または 《左》《右》）
 * - :::table … ::: で表（| 区切り）
 * - :::media … ::: で左画像＋右本文（1行目: 画像URL または ![alt](url)）
 */
function parseBodyToHtml(text) {
  const s = String(text || "");
  if (!s.trim()) return "";

  const segments = [];
  const fenceRe = /:::(cards|3cards|compare|table|media)\r?\n([\s\S]*?)\r?\n:::/g;
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
      if (seg.type === "media") return parseMediaBlock(seg.content);
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

function parseMediaBlock(inner) {
  const lines = inner.split(/\r?\n/);
  const first = (lines[0] || "").trim();
  let imgSrc = "";
  let restLines = lines.slice(1);
  const mdImg = first.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
  if (mdImg) {
    imgSrc = mdImg[2].trim();
  } else if (/^https?:\/\//i.test(first)) {
    imgSrc = first;
  } else {
    restLines = lines;
  }
  const rest = restLines.join("\n").trim();
  const rightHtml = rest ? parseNormalSegment(rest) : "";
  const imgEl = imgSrc
    ? `<img class="slide-media__img-el" src="${escapeHtml(imgSrc)}" alt="" loading="lazy" decoding="async" />`
    : "";
  const imgCol = imgSrc
    ? `<div class="slide-media__img">${imgEl}</div>`
    : `<div class="slide-media__img slide-media__img--placeholder"><span>画像URL または ![説明](URL)</span></div>`;
  const bodyCol = `<div class="slide-media__body">${rightHtml || '<p class="slide-media__empty">右側に見出し・箇条書き</p>'}</div>`;
  return `<div class="slide-media">${imgCol}${bodyCol}</div>`;
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
    if (paraLines.length) {
      html.push(
        `<ul class="slide-auto-bullets">${paraLines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`
      );
    }
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

/**
 * 本文先頭の :::subtitle … ::: を取り除き、タイトル直下に表示するテキストとして返す。
 */
function stripSubtitleFromBody(text) {
  const s = String(text || "");
  const re = /^:::\s*subtitle\s*\r?\n([\s\S]*?)\r?\n:::\s*/i;
  const m = s.match(re);
  if (!m) return { subtitle: "", rest: s };
  return { subtitle: m[1].trim(), rest: s.slice(m[0].length).trim() };
}

function renderSlideInner(slide, options = {}) {
  const { editableShell = false } = options;
  const layout = normalizeLayout(slide.layout);
  const layoutClass = `slide-layout slide-layout--${layout}`;
  const title = slide.title.trim();
  const { subtitle, rest } = stripSubtitleFromBody(slide.body);
  const bodyHtml = parseBodyToHtml(rest);
  if (!title && !subtitle && !bodyHtml) {
    if (editableShell) {
      return `<div class="slide-inner slide-inner--stacked ${layoutClass}"><header class="slide-header"><h2 class="slide-title"></h2></header><div class="slide-body"><p class="empty-hint">タイトルと本文を入力すると表示されます（本文先頭に <code>:::subtitle</code> でサブメッセージ）</p></div></div>`;
    }
    return `<div class="slide-inner slide-inner--stacked ${layoutClass}"><p class="empty-hint">タイトルと本文を入力すると表示されます</p></div>`;
  }
  let html = `<header class="slide-header">`;
  html += `<h2 class="slide-title">${escapeHtml(title)}</h2>`;
  if (subtitle) {
    html += `<p class="slide-subtitle">${escapeHtml(subtitle)}</p>`;
  }
  html += `</header>`;
  if (bodyHtml) {
    html += `<div class="slide-body">${bodyHtml}</div>`;
  } else {
    html += `<div class="slide-body"></div>`;
  }
  return `<div class="slide-inner slide-inner--stacked ${layoutClass}">${html}</div>`;
}

function buildStandaloneHtml(slides) {
  const slidesHtml = slides
    .map(
      (s, i) => `
    <section class="deck-slide" data-index="${i}" data-layout="${normalizeLayout(s.layout)}">
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
    body { margin: 0; font-family: "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif; background: #f1f5f9; color: #0f172a; padding: 1.5rem; }
    h1 { font-size: 0.95rem; margin: 0 0 1rem; color: #64748b; font-weight: 500; }
    .deck { max-width: 900px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.25rem; }
    :root { --slide-v: 0.88; }
    .deck-slide {
      --slide-v: 0.88;
      background: #fafafa; border: 1px solid #e2e8f0; border-radius: 12px;
      padding: 0.2rem 0.35rem; min-height: 200px;
      aspect-ratio: 16 / 9; display: flex; flex-direction: column; justify-content: flex-start; align-items: stretch;
      overflow: hidden;
    }
    .slide-inner {
      width: calc(100% / var(--slide-v)); max-width: calc(100% / var(--slide-v)); max-height: calc(100% / var(--slide-v));
      min-height: 0; flex: 0 1 auto;
      display: flex; flex-direction: column; justify-content: flex-start;
      align-items: flex-start;
      transform: scale(var(--slide-v)); transform-origin: top center;
      overflow: hidden;
    }
    .slide-inner.slide-inner--stacked { width: 100%; padding: 0.3rem 0.4rem 0.25rem; box-sizing: border-box; gap: 0.2rem; }
    .slide-header { width: 100%; text-align: left; }
    .slide-title { margin: 0 0 0.2rem; font-size: clamp(1.35rem, 2.6vw, 1.85rem); font-weight: 700; line-height: 1.18; text-align: left; }
    .slide-subtitle { margin: 0 0 0.3rem; font-size: clamp(0.95rem, 1.65vw, 1.1rem); font-weight: 500; color: #64748b; line-height: 1.4; }
    .slide-body { margin: 0; font-size: clamp(1.02rem, 1.85vw, 1.2rem); line-height: 1.36; width: 100%; padding-top: 0.28rem; border-top: 1px solid rgba(15, 23, 42, 0.08); }
    .slide-body ul { margin: 0; padding-left: 1.15rem; }
    .slide-body li { margin-bottom: 0.28rem; }
    .slide-body p { margin: 0 0 0.5rem; }
    .slide-body .slide-section { margin: 0 0 0.35rem; font-size: clamp(1rem, 1.75vw, 1.15rem); font-weight: 700; color: #2563eb; line-height: 1.22; letter-spacing: 0.02em; }
    .slide-body .slide-eyebrow { margin: 0 0 0.25rem; font-size: clamp(0.85rem, 1.35vw, 0.95rem); font-weight: 600; color: #64748b; letter-spacing: 0.06em; }
    .slide-body .slide-cards { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 0.4rem; margin: 0.2rem 0 0.3rem; align-items: stretch; }
    .slide-body .slide-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.38rem 0.45rem; min-height: 0; }
    .slide-body .slide-card-title { margin: 0 0 0.25rem; font-size: clamp(0.95rem, 1.55vw, 1.08rem); font-weight: 700; line-height: 1.22; }
    .slide-body .slide-card ul { font-size: clamp(0.88rem, 1.45vw, 1rem); padding-left: 1rem; }
    .slide-body .slide-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; margin: 0.2rem 0 0.35rem; align-items: start; }
    .slide-body .slide-compare-col { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.38rem 0.45rem; }
    .slide-body .slide-compare-label { font-size: 0.82rem; font-weight: 700; color: #64748b; margin-bottom: 0.25rem; letter-spacing: 0.04em; }
    .slide-body .slide-table-wrap { margin: 0.25rem 0; overflow-x: auto; max-width: 100%; }
    .slide-body .slide-table { width: 100%; border-collapse: collapse; font-size: clamp(0.88rem, 1.45vw, 1.02rem); border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; }
    .slide-body .slide-table th, .slide-body .slide-table td { border: 1px solid #e2e8f0; padding: 0.28rem 0.38rem; text-align: left; vertical-align: top; }
    .slide-body .slide-table th { background: #f4f4f5; font-weight: 600; }
    @media (max-width: 640px) { .slide-body .slide-cards { grid-template-columns: 1fr; } .slide-body .slide-compare { grid-template-columns: 1fr; } }
    .empty-hint { color: #64748b; margin: 0; font-size: 0.9rem; text-align: center; }
    .slide-inner.slide-layout--vscode { background: #1e1e1e; color: #d4d4d4; margin: -1.75rem -2rem; padding: 1.75rem 2rem; border-radius: 12px; }
    .deck-slide .slide-body { flex: 1; min-height: 0; overflow: auto; -webkit-overflow-scrolling: touch; }
    .slide-inner.slide-layout--vscode .slide-title { color: #fff; font-family: ui-monospace, monospace; border-bottom: 2px solid #3fb950; padding-bottom: 0.45rem; }
    .slide-inner.slide-layout--vscode .slide-body { font-family: ui-monospace, monospace; font-size: clamp(0.8rem, 1.4vw, 0.9rem); }
    .slide-inner.slide-layout--vscode .slide-section { color: #569cd6; }
    .slide-inner.slide-layout--cols3 .slide-table th { background: linear-gradient(180deg, #1d4ed8, #2563eb); color: #fff; border-color: #1e40af; }
    .slide-inner.slide-layout--cols3 .slide-table { box-shadow: 0 6px 20px rgba(37,99,235,0.18); border-radius: 8px; overflow: hidden; }
    .slide-inner.slide-layout--cards .slide-cards { gap: 0.45rem; }
    .slide-inner.slide-layout--cards .slide-card { box-shadow: 0 4px 12px rgba(15,23,42,0.08); border-radius: 12px; }
    .slide-inner.slide-layout--section { text-align: left; justify-content: flex-start; }
    .slide-inner.slide-layout--section .slide-title { font-size: clamp(1.35rem, 2.8vw, 1.85rem); background: linear-gradient(135deg, #0ea5e9, #2563eb); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .slide-inner.slide-layout--toc .slide-body { border-left: 4px solid #6366f1; padding-left: 0.65rem; }
    .slide-inner.slide-layout--compare .slide-compare { gap: 0.45rem; }
    .slide-inner.slide-layout--compare .slide-compare-col:first-child { background: #fef2f2; border-color: #fecaca; }
    .slide-inner.slide-layout--compare .slide-compare-col:last-child { background: #eff6ff; border-color: #bfdbfe; }
    .slide-body .slide-media { display: grid; grid-template-columns: minmax(0, 38%) minmax(0, 1fr); gap: 0.45rem; align-items: start; margin: 0.2rem 0 0.35rem; }
    .slide-body .slide-media__img { border-radius: 10px; overflow: hidden; background: #f1f5f9; border: 1px solid #e2e8f0; min-height: 96px; }
    .slide-body .slide-media__img-el { width: 100%; height: auto; display: block; }
    .slide-body .slide-media__img--placeholder { display: flex; align-items: center; justify-content: center; min-height: 120px; padding: 0.5rem; font-size: 0.72rem; color: #64748b; text-align: center; }
    .slide-body .slide-media__body { min-width: 0; }
    @media (max-width: 640px) { .slide-body .slide-media { grid-template-columns: 1fr; } }
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
  if (!els || !els.briefPurpose || !els.briefPages || !els.briefAudience || !els.briefType) {
    return defaultBrief();
  }
  const n = parseInt(String(els.briefPages.value), 10);
  return normalizeBrief({
    purpose: els.briefPurpose.value,
    audience: els.briefAudience.value,
    type: els.briefType.value,
    pageCount: Number.isFinite(n) ? n : 5,
  });
}

function writeBriefToForm(brief, els) {
  if (!els || !els.briefPurpose || !els.briefPages || !els.briefAudience || !els.briefType) return;
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
    layoutPresetBar: document.getElementById("layout-preset-bar"),
    titleInput: document.getElementById("slide-title"),
    bodyInput: document.getElementById("slide-body"),
    preview: document.getElementById("slide-preview"),
    thumbStrip: document.getElementById("thumb-strip"),
    btnPrev: document.getElementById("btn-prev-slide"),
    btnNext: document.getElementById("btn-next-slide"),
    counter: document.getElementById("slide-counter"),
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

  const hasBriefForm = Boolean(
    els.briefPurpose && els.briefAudience && els.briefType && els.briefPages
  );
  const unifiedPreview = Boolean(els.preview && els.bodyInput && !els.titleInput);
  let bodyDebounceTimer = null;

  fillLayoutPresetBar(els.layoutPresetBar);
  if (els.layoutPresetBar) {
    els.layoutPresetBar.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-layout]");
      if (!btn || !els.layoutPresetBar.contains(btn)) return;
      syncSlideFromDom();
      applyLayoutPreset(state.slides[activeIndex], btn.dataset.layout);
      if (els.bodyInput) els.bodyInput.value = state.slides[activeIndex].body;
      persist();
      render();
    });
  }

  function syncSlideFromDom() {
    const slide = state.slides[activeIndex];
    if (!slide) return;
    if (els.bodyInput) slide.body = els.bodyInput.value;
    const h2 = els.preview && els.preview.querySelector(".slide-title");
    if (h2) slide.title = h2.textContent.trim();
    else if (els.titleInput) slide.title = els.titleInput.value;
  }

  function applyExternalState() {
    const next = loadState();
    const rawSlides = Array.isArray(next.slides) && next.slides.length ? next.slides : [{ title: "", body: "", layout: "default" }];
    state = {
      slides: rawSlides.map((s) => normalizeSlide(s)),
      brief: normalizeBrief(next.brief || {}),
    };
    activeIndex = Math.max(0, Math.min(activeIndex, state.slides.length - 1));
    render();
  }

  function persist() {
    saveState(state);
  }

  function persistBriefFromForm() {
    if (!hasBriefForm) return;
    state.brief = readBriefFromForm(els);
    persist();
  }

  function setActive(index) {
    syncSlideFromDom();
    persist();
    activeIndex = Math.max(0, Math.min(index, state.slides.length - 1));
    if (state.slides.length === 0) {
      state.slides.push({ title: "", body: "", layout: "default" });
      activeIndex = 0;
      persist();
    }
    render();
  }

  function thumbBodyPreview(body) {
    const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const slice = lines.slice(0, 4);
    if (slice.length === 0) return "";
    const items = slice.map((l) => l.replace(/^[-・*•]\s?|^[0-9]+[.)]\s?/, "").trim());
    return `<ul>${items.map((t) => `<li>${escapeHtml(t.length > 28 ? t.slice(0, 28) + "…" : t)}</li>`).join("")}</ul>`;
  }

  function syncListAndThumbsFromState() {
    const slide = state.slides[activeIndex];
    const titleText = slide.title.trim() || "（無題）";

    if (els.slideList) {
      els.slideList.querySelectorAll(".slide-item").forEach((btn, i) => {
        btn.classList.toggle("is-active", i === activeIndex);
        if (i === activeIndex) {
          btn.innerHTML = `<span class="num">${activeIndex + 1}.</span>${escapeHtml(titleText)}`;
        }
      });
    }

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

  function onFieldInput() {
    state.slides[activeIndex] = {
      title: els.titleInput ? els.titleInput.value : state.slides[activeIndex].title,
      body: els.bodyInput ? els.bodyInput.value : "",
      layout: normalizeLayout(state.slides[activeIndex].layout),
    };
    persist();
    if (els.preview) {
      els.preview.innerHTML = renderSlideInner(state.slides[activeIndex]);
    }
    syncListAndThumbsFromState();
  }

  function render() {
    const slide = state.slides[activeIndex];

    if (els.slideList) {
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
    }

    updateLayoutPresetBarUI(els.layoutPresetBar, slide.layout);

    if (unifiedPreview) {
      if (els.preview) {
        els.preview.innerHTML = renderSlideInner(slide, { editableShell: true });
        const h2 = els.preview.querySelector(".slide-title");
        if (h2) {
          h2.contentEditable = "true";
          h2.setAttribute("spellcheck", "false");
        }
      }
      if (els.bodyInput) els.bodyInput.value = slide.body;
      if (els.counter) els.counter.textContent = `${activeIndex + 1} / ${state.slides.length}`;
      if (els.btnPrev) els.btnPrev.disabled = activeIndex <= 0;
      if (els.btnNext) els.btnNext.disabled = activeIndex >= state.slides.length - 1;
      if (els.btnDel) els.btnDel.disabled = state.slides.length <= 1;
    } else {
      if (els.titleInput) els.titleInput.value = slide.title;
      if (els.bodyInput) els.bodyInput.value = slide.body;
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
    }

    writeBriefToForm(state.brief, els);
  }

  if (unifiedPreview && els.preview) {
    els.preview.addEventListener("input", (e) => {
      const t = e.target;
      if (t && t.classList && t.classList.contains("slide-title")) {
        state.slides[activeIndex].title = t.textContent.trim();
        persist();
        const item = els.slideList && els.slideList.querySelector(`.slide-item[data-index="${activeIndex}"]`);
        if (item) {
          item.innerHTML = `<span class="num">${activeIndex + 1}.</span>${escapeHtml(state.slides[activeIndex].title.trim() || "（無題）")}`;
        }
      }
    });
  }

  if (els.bodyInput) {
    if (unifiedPreview) {
      els.bodyInput.addEventListener("input", () => {
        state.slides[activeIndex].body = els.bodyInput.value;
        state.slides[activeIndex].layout = normalizeLayout(state.slides[activeIndex].layout);
        persist();
        clearTimeout(bodyDebounceTimer);
        bodyDebounceTimer = setTimeout(() => {
          const bodyDiv = els.preview && els.preview.querySelector(".slide-body");
          if (bodyDiv) {
            bodyDiv.innerHTML = parseBodyToHtml(state.slides[activeIndex].body);
          }
        }, 120);
      });
    } else {
      if (els.titleInput) els.titleInput.addEventListener("input", onFieldInput);
      els.bodyInput.addEventListener("input", onFieldInput);
    }
  }

  if (els.btnPrev) {
    els.btnPrev.addEventListener("click", () => {
      if (activeIndex <= 0) return;
      setActive(activeIndex - 1);
    });
  }
  if (els.btnNext) {
    els.btnNext.addEventListener("click", () => {
      if (activeIndex >= state.slides.length - 1) return;
      setActive(activeIndex + 1);
    });
  }

  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY || e.newValue == null) return;
    applyExternalState();
  });

  if (hasBriefForm) {
    ["input", "change"].forEach((ev) => {
      els.briefPurpose.addEventListener(ev, persistBriefFromForm);
      els.briefAudience.addEventListener(ev, persistBriefFromForm);
      els.briefType.addEventListener(ev, persistBriefFromForm);
      els.briefPages.addEventListener(ev, persistBriefFromForm);
    });
  }

  if (els.btnGenerate) {
    els.btnGenerate.addEventListener("click", () => {
      state.brief = readBriefFromForm(els);
      const next = generateSlidesFromBrief(state.brief);
      state.slides = next;
      activeIndex = 0;
      persist();
      render();
    });
  }

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
        state.slides = data.slides.map((s) => normalizeSlide(s));
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

  if (els.btnAdd) {
    els.btnAdd.addEventListener("click", () => {
      syncSlideFromDom();
      state.slides.splice(activeIndex + 1, 0, { title: "", body: "", layout: "default" });
      activeIndex += 1;
      persist();
      render();
    });
  }

  if (els.btnDel) {
    els.btnDel.addEventListener("click", () => {
      syncSlideFromDom();
      if (state.slides.length <= 1) {
        state.slides[0] = { title: "", body: "", layout: "default" };
      } else {
        state.slides.splice(activeIndex, 1);
        activeIndex = Math.min(activeIndex, state.slides.length - 1);
      }
      persist();
      render();
    });
  }

  if (els.btnExport) {
    els.btnExport.addEventListener("click", () => {
      syncSlideFromDom();
      persist();
      const html = buildStandaloneHtml(state.slides);
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `slide-draft-${new Date().toISOString().slice(0, 10)}.html`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  if (els.btnReset) {
    els.btnReset.addEventListener("click", () => {
      if (!confirm("サンプル構成に戻します。スライド内容とブリーフ入力は失われます。よろしいですか？")) return;
      state = { slides: defaultSlides(), brief: defaultBrief() };
      activeIndex = 0;
      persist();
      render();
    });
  }

  render();
}

document.addEventListener("DOMContentLoaded", init);
