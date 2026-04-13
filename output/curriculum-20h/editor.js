/**
 * カリキュラム原稿の編集・localStorage 保存・Genspark プロンプト生成
 */
const STORAGE_KEY = "genspark-curriculum-20h-v2";

/** slides-data.json の想定枚数（セクションスライド含む） */
const SLIDE_COUNT = 23;

function normalizeSlide(s, i) {
  const bullets = Array.isArray(s.bullets) ? s.bullets.map(String) : [];
  const base = {
    kicker: String(s.kicker ?? ""),
    title: String(s.title ?? ""),
    sub: String(s.sub ?? ""),
    bullets,
    cover: i === 0,
  };
  const layout = s.layout;
  let result = base;
  if (layout === "compare" && s.compare && Array.isArray(s.compare.left) && Array.isArray(s.compare.right)) {
    result = {
      ...base,
      layout: "compare",
      compare: {
        leftTitle: String(s.compare.leftTitle ?? ""),
        rightTitle: String(s.compare.rightTitle ?? ""),
        left: s.compare.left.map(String),
        right: s.compare.right.map(String),
      },
      footBullets: Array.isArray(s.footBullets) ? s.footBullets.map(String) : undefined,
    };
  } else if (layout === "beforeafter" && s.beforeAfter && Array.isArray(s.beforeAfter.before) && Array.isArray(s.beforeAfter.after)) {
    result = {
      ...base,
      layout: "beforeafter",
      beforeAfter: {
        beforeTitle: String(s.beforeAfter.beforeTitle ?? ""),
        afterTitle: String(s.beforeAfter.afterTitle ?? ""),
        before: s.beforeAfter.before.map(String),
        after: s.beforeAfter.after.map(String),
      },
      footBullets: Array.isArray(s.footBullets) ? s.footBullets.map(String) : undefined,
    };
  } else if (layout === "threecol" && s.threeCol && Array.isArray(s.threeCol.columns)) {
    result = {
      ...base,
      layout: "threecol",
      threeCol: {
        columns: s.threeCol.columns.map((col) => ({
          title: String(col.title ?? ""),
          bullets: Array.isArray(col.bullets) ? col.bullets.map(String) : [],
        })),
      },
      footBullets: Array.isArray(s.footBullets) ? s.footBullets.map(String) : undefined,
    };
  }
  if (s.section) {
    return { ...result, section: true };
  }
  return result;
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.slides) || data.slides.length !== SLIDE_COUNT) return null;
    return data;
  } catch {
    return null;
  }
}

function saveToStorage(slides) {
  const payload = {
    version: 1,
    savedAt: new Date().toISOString(),
    slides: slides.map((s, i) => normalizeSlide(s, i)),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  return payload.savedAt;
}

async function loadDefaultSlides() {
  const res = await fetch("slides-data.json", { cache: "no-store" });
  if (!res.ok) throw new Error("slides-data.json を読めませんでした。");
  const raw = await res.json();
  const slides = (raw.slides || []).map((s, i) => normalizeSlide(s, i));
  if (slides.length !== SLIDE_COUNT) throw new Error(`slides-data.json の枚数が ${SLIDE_COUNT} 枚ではありません。`);
  return slides;
}

function getSlidesFromForm(prevSlides) {
  const slides = [];
  const n = prevSlides.length;
  for (let i = 0; i < n; i++) {
    const el = document.querySelector(`[data-slide-index="${i}"]`);
    if (!el) throw new Error(`スライド ${i + 1} のフォームが見つかりません。`);
    const kicker = el.querySelector(`[name="kicker-${i}"]`)?.value ?? "";
    const title = el.querySelector(`[name="title-${i}"]`)?.value ?? "";
    const sub = el.querySelector(`[name="sub-${i}"]`)?.value ?? "";
    const prev = prevSlides[i];
    if (prev && prev.section) {
      slides.push(normalizeSlide({ ...prev, kicker, title, sub }, i));
      continue;
    }
    if (prev && prev.layout && prev.layout !== "list") {
      slides.push(normalizeSlide({ ...prev, kicker, title, sub }, i));
      continue;
    }
    const bulletsText = el.querySelector(`[name="bullets-${i}"]`)?.value ?? "";
    const bullets = bulletsText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    slides.push(normalizeSlide({ kicker, title, sub, bullets, cover: i === 0 }, i));
  }
  return slides;
}

function renderForm(container, slides) {
  container.innerHTML = slides
    .map((s, i) => {
      const n = i + 1;
      const layoutNote = s.section
        ? `<p class="field-hint">セクションスライド（メンタルモデル）。本文は <code>slides-data.json</code> を編集し、<code>node generate-slides.mjs</code> で再生成してください。</p>`
        : s.layout && s.layout !== "list"
          ? `<p class="field-hint">本文は「${escapeAttr(layoutLabelJa(s.layout))}」レイアウトで <code>slides-data.json</code> に定義されています。列・パネルの文言は JSON を編集し、<code>node generate-slides.mjs</code> で静的HTMLを再生成してください。キッカー・タイトル・サブはここで編集できます。</p>`
          : `<p class="field-hint">改行で区切ると複数行になります。</p>`;
      return `
    <section class="slide-block${s.section ? " slide-block--section" : ""}${s.layout && s.layout !== "list" ? " slide-block--layout" : ""}" data-slide-index="${i}" aria-labelledby="slide-head-${i}">
      <h2 id="slide-head-${i}">スライド ${n} / ${slides.length}</h2>
      <div class="field-grid">
        <div>
          <label for="kicker-${i}">キッカー（左上ラベル）</label>
          <input type="text" id="kicker-${i}" name="kicker-${i}" value="${escapeAttr(s.kicker)}" autocomplete="off" />
        </div>
        <div>
          <label for="title-${i}">タイトル</label>
          <input type="text" id="title-${i}" name="title-${i}" value="${escapeAttr(s.title)}" autocomplete="off" />
        </div>
        <div>
          <label for="sub-${i}">サブタイトル（任意）</label>
          <input type="text" id="sub-${i}" name="sub-${i}" value="${escapeAttr(s.sub)}" autocomplete="off" />
        </div>
        <div>
          <label for="bullets-${i}">本文（1行が1箇条書き）</label>
          <textarea id="bullets-${i}" name="bullets-${i}" rows="5"></textarea>
          ${layoutNote}
        </div>
      </div>
    </section>`;
    })
    .join("");

  slides.forEach((s, i) => {
    const ta = container.querySelector(`#bullets-${i}`);
    if (!ta) return;
    if (s.section) {
      ta.value = "";
      ta.disabled = true;
      ta.placeholder = "（セクション定義済み — slides-data.json で編集）";
    } else if (s.layout && s.layout !== "list") {
      ta.value = "";
      ta.disabled = true;
      ta.placeholder = "（レイアウト定義済み — slides-data.json で編集）";
    } else {
      ta.value = (s.bullets || []).join("\n");
      ta.disabled = false;
      ta.placeholder = "";
    }
  });
}

function layoutLabelJa(layout) {
  if (layout === "compare") return "対比（2カラム）";
  if (layout === "beforeafter") return "Before / After";
  if (layout === "threecol") return "3カラム";
  return layout;
}

function escapeAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function flattenSlideLinesForPrompt(s) {
  if (s.section) {
    const lines = [];
    lines.push("［セクション・メンタルモデル］");
    (s.bullets || []).forEach((b) => lines.push(b));
    return lines;
  }
  const layout = s.layout || "list";
  if (!s.layout || layout === "list") {
    return s.bullets || [];
  }
  if (layout === "compare" && s.compare) {
    const c = s.compare;
    const lines = [];
    lines.push(`［対比・左］${c.leftTitle}`);
    (c.left || []).forEach((b) => lines.push(b));
    lines.push(`［対比・右］${c.rightTitle}`);
    (c.right || []).forEach((b) => lines.push(b));
    (s.footBullets || []).forEach((b) => lines.push(b));
    return lines;
  }
  if (layout === "beforeafter" && s.beforeAfter) {
    const ba = s.beforeAfter;
    const lines = [];
    lines.push(`［Before］${ba.beforeTitle}`);
    (ba.before || []).forEach((b) => lines.push(b));
    lines.push(`［After］${ba.afterTitle}`);
    (ba.after || []).forEach((b) => lines.push(b));
    (s.footBullets || []).forEach((b) => lines.push(b));
    return lines;
  }
  if (layout === "threecol" && s.threeCol) {
    const lines = [];
    (s.threeCol.columns || []).forEach((col) => {
      lines.push(`［${col.title}］`);
      (col.bullets || []).forEach((b) => lines.push(b));
    });
    (s.footBullets || []).forEach((b) => lines.push(b));
    return lines;
  }
  return s.bullets || [];
}

function buildGensparkPrompt(slides) {
  const lines = [];
  lines.push("以下のプロンプトを Genspark にそのまま（または必要に応じて冒頭・末尾だけ調整して）貼り付けてください。");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("あなたはスライド作成アシスタントです。次に示す「スライド原稿」に含まれる文言について、**要約・言い換え・省略はしないでください**。語句は原文のままスライドに配置してください。");
  lines.push("");
  lines.push("【体裁・トンマナの目安（厳密なルールではありません）】");
  lines.push("- 法人向けの提案・サービス紹介資料に近い、落ち着いたビジネス調のレイアウト（濃色アクセント、余白、読みやすい箇条書き）。");
  lines.push("- **視覚**：図解・フロー・アイコン・矢印を多めにし、文字量は抑えめ。原稿の意味を変えず、図で直感的に補ってよい。");
  lines.push("- **ベネフィット**：研修後の姿・時間削減・手戻り削減など、効果や未来が伝わる図やキャッチを追加してよい（原文の文言は変えない）。");
  lines.push("- **工程**：課題→解決のステップが追えるよう、フロー図や番号付きの工程表を入れてよい。");
  lines.push("- **セクションスライド**：「［セクション・メンタルモデル］」は、具体の前後で頭の中の地図を置く区切り。大きな見出し・余白多め・図1点など、ワクワク感のある章扉にしてよい。");
  lines.push("- 原稿に「［対比・左］」「［Before］」「［フェーズ名］」などの区分がある場合は、対比・Before/After・複数カラムなどの配置で表現してよい。");
  lines.push("- 行頭が「┗」で始まる行は、直前の箇条書きの補足としてぶら下げ表示してよい。");
  lines.push("- フッターに短いライン（研修名・構成案ドラフト等）を入れてよい。原文にない装飾は、意味を変えない範囲で追加してよい。");
  lines.push("");
  lines.push("【条件】");
  lines.push(`- 全 ${slides.length} 枚分のスライドを作成する。`);
  lines.push("- 各スライドのキッカー・タイトル・サブタイトル・本文（箇条書き）は、原稿と同一の表現を用いる。");
  lines.push("- レイアウト・配色・図表は、原文の意味を変えない範囲で追加してよい。");
  lines.push("- 日本語のまま。");
  lines.push("");
  lines.push("【スライド原稿】");
  lines.push("");

  slides.forEach((s, i) => {
    lines.push(`### スライド ${i + 1} / ${slides.length}`);
    lines.push(`- キッカー: ${s.kicker}`);
    lines.push(`- タイトル: ${s.title}`);
    lines.push(`- サブタイトル: ${s.sub || "（なし）"}`);
    lines.push("- 本文:");
    flattenSlideLinesForPrompt(s).forEach((b) => lines.push(`  - ${b}`));
    lines.push("");
  });

  return lines.join("\n");
}

function setStatus(el, message, kind) {
  if (!el) return;
  el.textContent = message || "";
  el.classList.remove("is-ok", "is-warn");
  if (kind === "ok") el.classList.add("is-ok");
  if (kind === "warn") el.classList.add("is-warn");
}

async function init() {
  const formRoot = document.getElementById("slide-form-root");
  const statusEl = document.getElementById("editor-status");
  const promptOut = document.getElementById("genspark-prompt-out");
  const savedHint = document.getElementById("saved-hint");

  let slides;

  try {
    const stored = loadFromStorage();
    const defaults = await loadDefaultSlides();
    if (stored && stored.slides) {
      slides = stored.slides.map((s, i) => normalizeSlide(s, i));
      setStatus(statusEl, "前回保存した内容を読み込みました。", "ok");
      if (savedHint && stored.savedAt) {
        savedHint.textContent = `最終保存: ${new Date(stored.savedAt).toLocaleString("ja-JP")}`;
      }
    } else {
      slides = defaults;
      setStatus(statusEl, "初期データ（slides-data.json）を表示しています。編集後、下部の「編集を完了して保存」でブラウザに保存できます。", "warn");
    }
  } catch (e) {
    setStatus(statusEl, e instanceof Error ? e.message : String(e), "warn");
    return;
  }

  renderForm(formRoot, slides);

  document.getElementById("btn-save-now")?.addEventListener("click", () => {
    try {
      slides = getSlidesFromForm(slides);
      const at = saveToStorage(slides);
      setStatus(statusEl, `保存しました（${new Date(at).toLocaleString("ja-JP")}）`, "ok");
      if (savedHint) savedHint.textContent = `最終保存: ${new Date(at).toLocaleString("ja-JP")}`;
    } catch (e) {
      setStatus(statusEl, e instanceof Error ? e.message : String(e), "warn");
    }
  });

  document.getElementById("btn-reset-default")?.addEventListener("click", () => {
    if (!confirm("保存済みの編集を破棄し、slides-data.json の初期内容に戻します。よろしいですか？")) return;
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  });

  document.getElementById("btn-export-json")?.addEventListener("click", () => {
    const stored = loadFromStorage();
    if (!stored || !stored.slides) {
      setStatus(statusEl, "エクスポートする保存データがありません。先に保存してください。", "warn");
      return;
    }
    const payload = { version: 1, slides: stored.slides.map((x, i) => normalizeSlide(x, i)) };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "slides-data.json";
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus(statusEl, "slides-data.json をダウンロードしました。置き換え後、node generate-slides.mjs で静的HTMLを再生成できます。", "ok");
  });

  document.getElementById("btn-final-save")?.addEventListener("click", () => {
    try {
      slides = getSlidesFromForm(slides);
      const at = saveToStorage(slides);
      setStatus(statusEl, `編集を保存しました。Genspark 用プロンプトは保存済みの内容をベースに生成できます（${new Date(at).toLocaleString("ja-JP")}）。`, "ok");
      if (savedHint) savedHint.textContent = `最終保存: ${new Date(at).toLocaleString("ja-JP")}`;
    } catch (e) {
      setStatus(statusEl, e instanceof Error ? e.message : String(e), "warn");
    }
  });

  document.getElementById("btn-genspark")?.addEventListener("click", () => {
    try {
      const stored = loadFromStorage();
      if (!stored || !stored.slides || stored.slides.length !== SLIDE_COUNT) {
        setStatus(
          statusEl,
          "保存データがありません。先に「今すぐ保存」または下部の「編集を完了して保存」を押してください。",
          "warn"
        );
        return;
      }
      const s = stored.slides.map((x, i) => normalizeSlide(x, i));
      const prompt = buildGensparkPrompt(s);
      if (promptOut) {
        promptOut.value = prompt;
        promptOut.focus();
      }
      setStatus(statusEl, "保存済みの文章をそのまま埋め込んだ Genspark 用プロンプトを生成しました。", "ok");
    } catch (e) {
      setStatus(statusEl, e instanceof Error ? e.message : String(e), "warn");
    }
  });

  document.getElementById("btn-genspark-from-form")?.addEventListener("click", () => {
    try {
      const s = getSlidesFromForm(slides);
      const prompt = buildGensparkPrompt(s);
      if (promptOut) {
        promptOut.value = prompt;
        promptOut.focus();
      }
      setStatus(statusEl, "画面上の内容（未保存含む）からプロンプトを生成しました。", "ok");
    } catch (e) {
      setStatus(statusEl, e instanceof Error ? e.message : String(e), "warn");
    }
  });

  document.getElementById("btn-copy-prompt")?.addEventListener("click", async () => {
    const t = promptOut?.value || "";
    if (!t.trim()) {
      setStatus(statusEl, "先にプロンプトを生成してください。", "warn");
      return;
    }
    try {
      await navigator.clipboard.writeText(t);
      setStatus(statusEl, "クリップボードにコピーしました。", "ok");
    } catch {
      setStatus(statusEl, "コピーに失敗しました。テキストエリアから手動でコピーしてください。", "warn");
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
