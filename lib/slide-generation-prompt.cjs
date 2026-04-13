/**
 * OpenAI スライド生成用プロンプト（営業資料デザインルール）
 * body は「デザインを当てるだけ」の状態＝プレビューにそのまま載る本文のみ（メタラベル禁止）
 *
 * `training-deck-style-rules.md` を読み込み、研修ご案内 PDF に近いトーン・ボリューム・構成を指示する。
 */

const fs = require("fs");
const path = require("path");

function loadTrainingDeckStyleRules() {
  const f = path.join(__dirname, "training-deck-style-rules.md");
  try {
    return fs.readFileSync(f, "utf8");
  } catch {
    return "";
  }
}

const TRAINING_DECK_STYLE_RULES = loadTrainingDeckStyleRules();

const SYSTEM_PROMPT_CORE = `あなたはスライドのレイアウト（ブロック配置）を決める制作者です。各スライドは「この記法ならプレビュー上どう並ぶか」が一目で分かることが最優先です。
配色・装飾・フォントの指示は書かない。本文はレイアウト記法と短いプレースホルダだけにする。
禁止語・禁止ラベル（本文・見出し・### の行に含めない）: 「役割」「構成」「主メッセージ」「根拠」「So What」「結論（メタ用）」「エグゼクティブサマリー」など、思考フレームやプレゼン作法のメタ名。代わりに「左カラム」「カード1」「行1」のような**置き場所**の短いラベルでよい。
各スライドの body は必ず次の順: 先頭に \`:::subtitle\` … \`:::\`（1〜2行の短いキャッチ。中身はダミー可）。続けて \`:::cards\` / \`:::compare\` / \`:::table\` / \`:::media\` のいずれか1つ以上で枠を作る。長い説明段落のみのスライドは禁止。
枚数が複数あるときは、**できるだけ記法をローテーション**（例: 1枚目 table → 2枚目 cards → 3枚目 compare → 4枚目 media）し、同じ記法だけの連続を避ける。
必ず次のJSON形式のみを返す（JSON以外の文字は出さない）:
{"slides":[{"title":"そのスライドのレイアウトが伝わる短い見出し（配置名でも可）","body":":::subtitle ... ::: と記法ブロックのみ"}]}
slides の配列の長さはユーザー指定の枚数と一致させる。`;

const SYSTEM_PROMPT =
  SYSTEM_PROMPT_CORE +
  (TRAINING_DECK_STYLE_RULES
    ? "\n\n---\n\n# 研修ご案内資料スタイル（必ず遵守）\n\n" + TRAINING_DECK_STYLE_RULES
    : "");

function buildUserPrompt(brief) {
  const deckTitle =
    String(brief.deckTitle != null ? brief.deckTitle : brief.purpose != null ? brief.purpose : "").trim() || "（タイトル未入力）";

  return [
    "次の条件で、各スライドの title と body を日本語で作成してください。目的は**レイアウトの当て方の見本**です。ストーリーや説得構成は不要です。",
    TRAINING_DECK_STYLE_RULES
      ? "下に続く「研修ご案内資料スタイル」は、**記法のボリューム感・表・カードの使い方**の参考にするだけにし、三部構成や課題提示などの**話の構成**に引きずられないこと。"
      : "",
    "",
    "# 出力の形（重要）",
    "- title: そのスライドで使っている**レイアウト**が分かる短い見出し（例: 表紙・3カード・左右対比）。",
    "- body: 先頭 `:::subtitle` … `:::` のあと、必ず `:::cards` / `:::compare` / `:::table` / `:::media` のいずれか。",
    "- `:::compare` は `### 左` と `### 右` のみ。`:::media` は1行目に画像URL（プレースホルダURL可）。",
    "- 「役割」「構成」「主メッセージ」「根拠」などのメタラベルは書かない。### の見出しは置き場所の短い名前でよい。",
    "",
    "# 入力",
    `- 資料タイトル（表紙・サブタイトルの参考。ストーリー要件ではない）: ${deckTitle}`,
    `- 枚数: ちょうど ${brief.pageCount} 枚`,
    "",
    "1枚目は表紙想定で `:::table` か `:::cards` を推奨。以降は記法を変えてローテーション。",
    "",
    "JSON 以外の文字は出力しないこと。",
  ]
    .filter(Boolean)
    .join("\n");
}

module.exports = {
  SYSTEM_PROMPT,
  buildUserPrompt,
};
