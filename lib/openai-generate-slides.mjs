/**
 * OpenAI でスライド構成を生成（server.mjs / Vercel api 共通）
 */
export async function generateSlidesFromBrief(brief) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !String(apiKey).startsWith("sk-")) {
    const err = new Error(
      "OPENAI_API_KEY が設定されていません（sk- で始まるキー）。ローカルは .env、Vercel は Project Settings → Environment Variables へ。"
    );
    err.code = "NO_KEY";
    throw err;
  }

  // 上書き: OPENAI_MODEL（例: コスト優先なら gpt-5.4-mini）
  const model = process.env.OPENAI_MODEL || "gpt-5.4";
  const typeLabel =
    {
      proposal: "提案",
      report: "報告・共有",
      training: "研修・教育",
      sales: "営業・紹介",
      explain: "説明・プレゼン",
      other: "その他",
    }[brief.type] || "その他";

  const userContent = [
    "次のブリーフに基づき、「デザインを当てる前」の構成・文案を日本語で作成してください。",
    "トーンは「外資系戦略コンサル・経営企画の提議資料」向け：理路整然・論点が明確・決裁者が判断・合意できる粒度。",
    "",
    `- 主目的（決裁で達成したいこと）: ${brief.purpose || "（未入力）"}`,
    `- 対象者（決裁者・ステークホルダー）: ${brief.audience || "（未入力）"}`,
    `- 種別: ${typeLabel}（${brief.type}）`,
    `- 枚数: ちょうど ${brief.pageCount} 枚（表紙を含む）`,
    "",
    "各スライドの body は必ず次のブロック順で書く（見出しは【】で固定）:",
    "【役割】表紙 / エグゼクティブサマリー / アジェンダ / 本論 / 対比・選択肢 / リスク / 推奨案 / 次の意思決定・承認事項 など",
    "【構成】当スライドの論理パターン（例: 課題→影響→原因、選択肢比較、ROI、実施計画、Q&A想定）",
    "【主メッセージ】1行（このスライドの結論・一言。断言調。曖昧語禁止）",
    "【根拠】（仮の数値・仮説・比較軸でよい。未確定は（要確認）と明記）。",
    "  - 行頭に - を付けた箇条書きでよい。",
    "【So What】決裁者への含意（なぜ今この判断が必要か）／次に取るべき行動（担当・期限は（要確認）可）",
    "",
    "全体のストーリーは、状況認識→論点定義→選択肢・評価→推奨→リスクと対策→意思決定の論点→ネクストステップ、を枚数に合わせて圧縮。",
    "避けること: モチベーション語句の羅列、一般論だけのスローガン、根拠のない形容詞の連発。",
    "",
    "情報量・ボリューム感: 法人向け提案・研修説明のピッチデック（OEM/サービス紹介資料）に近い密度。",
    "1スライドあたり【根拠】は箇条書きで4〜10点、または短い段落を2〜5個。数字・固有名詞・仮のKPI・（要確認）を適宜含める。",
    "",
    "【So What】の後に、必要に応じて次のレイアウト記法を使う（プレビューで整形される）:",
    "- 章・セクション見出し: 行頭の `### 01 セクション名` または `## サブキャプション`",
    "- 3カード横並び（3つの ### を並べる）:",
    ":::cards",
    "### カード1タイトル",
    "- 箇条書き",
    "### カード2タイトル",
    "- 箇条書き",
    "### カード3タイトル",
    "- 箇条書き",
    ":::",
    "- 対比（2カラム）:",
    ":::compare",
    "### 左",
    "- 左側の要点",
    "### 右",
    "- 右側の要点",
    ":::",
    " または 《左》ラベル改行本文《右》ラベル改行本文",
    "- 表:",
    ":::table",
    "| 列A | 列B |",
    "| --- | --- |",
    "| 値 | 値 |",
    ":::",
    "JSON 以外の文字は出力しないこと。",
  ].join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `あなたは戦略コンサル・経営企画のシニアコンサルタントです。プレゼンの「論理構成」と「決裁者向け文案」を作る。デザイン・配色は不要。
スタイル: ピラミッド原則（スライドごとに主メッセージ1つ、その下に根拠）。論点はMECEに近い形で整理。各スライドに「So What」を必ず書く。
情報量は「法人向け提案・研修説明ピッチ」に相当する密度（薄い1行スローガンだけにしない）。
必ず次のJSON形式のみを返すこと（キーは英語のまま）:
{"slides":[{"title":"スライド見出し（結論が伝わる短い主張）","body":"【役割】…\\n【構成】…\\n【主メッセージ】…\\n【根拠】\\n- …\\n【So What】…\\n（必要なら ### や :::cards / :::compare / :::table の記法）"}]}
slides の配列の長さはユーザー指定の枚数と一致させる。
title は「○○の検討」のような曖昧語を避け、可能なら結論寄りの言い切りにする。`,
        },
        { role: "user", content: userContent },
      ],
      temperature: 0.62,
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    let detail = raw;
    try {
      const j = JSON.parse(raw);
      detail = j.error?.message || raw;
    } catch {
      /* ignore */
    }
    const err = new Error(`OpenAI API エラー (${res.status}): ${detail}`);
    err.code = "OPENAI_HTTP";
    throw err;
  }

  const data = JSON.parse(raw);
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    const err = new Error("OpenAI から本文が返りませんでした");
    err.code = "EMPTY";
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const err = new Error("OpenAI の応答を JSON として解釈できませんでした");
    err.code = "PARSE";
    throw err;
  }

  const slides = Array.isArray(parsed.slides) ? parsed.slides : null;
  if (!slides || slides.length === 0) {
    const err = new Error('JSON に "slides" 配列がありません');
    err.code = "SHAPE";
    throw err;
  }

  return {
    slides: slides.map((s) => ({
      title: String(s.title ?? "").trim(),
      body: String(s.body ?? "").trim(),
    })),
    model,
  };
}
