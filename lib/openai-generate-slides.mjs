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

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
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
    "次のブリーフに基づき、「デザインを当てる前」の構成・文案ドラフトを日本語で作成してください。",
    "淡白な一般論だけにせず、主目的と対象者に刺さる具体語・仮の数字・仮の固有名詞を入れてよい（未確定は（要確認）と明記）。",
    "",
    `- 主目的: ${brief.purpose || "（未入力）"}`,
    `- 対象者: ${brief.audience || "（未入力）"}`,
    `- 種別: ${typeLabel}（${brief.type}）`,
    `- 枚数: ちょうど ${brief.pageCount} 枚（表紙を含む）`,
    "",
    "各スライドの body では次を満たすこと:",
    "- 先頭に【役割】1行（例: 表紙 / アジェンダ / 本論 / 対比 / まとめ / 次アクション）。",
    "- 続けて【構成】1行（例: 箇条書き / 左右対比 / ビフォーアフター / 時系列 / 問題→原因→対策 など）。",
    "- 本文は空行で段落分け。箇条書きは行頭に -。対比は《左》《右》または Before/After の見出しでブロックを分ける。",
    "- 枚数の都合で本論を前後に入れ替えてよいが、ストーリー（共感→論点→根拠→提案→次の一歩）が通る順に並べる。",
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
          content: `あなたはプレゼン資料の「構成・文案」のプロです。見出しデザインや配色は不要。中身の情報設計と文章の厚みを作る。
必ず次のJSON形式のみを返すこと（キーは英語のまま）:
{"slides":[{"title":"見出し（短く具体的に）","body":"【役割】…\\n【構成】…\\n\\n本文。箇条書きは行頭に -。\\nで改行。"}]}
slides の配列の長さはユーザー指定の枚数と一致させる。
各スライドで「役割」と「構成パターン」を変え、単調な列挙を避ける。`,
        },
        { role: "user", content: userContent },
      ],
      temperature: 0.78,
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
