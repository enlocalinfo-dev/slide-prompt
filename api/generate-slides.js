/**
 * Vercel Serverless: POST /api/generate-slides
 * 環境変数: OPENAI_API_KEY（必須）, OPENAI_MODEL（任意）
 *
 * 注意: Vercel 上では for-await で req を読むとクラッシュすることがあるため、
 * req.on("data") で読む。
 */

function sendJson(res, statusCode, obj) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

/** @param {import("http").IncomingMessage} req */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let settled = false;
    req.on("data", (chunk) => {
      if (settled) return;
      total += chunk.length;
      if (total > 200_000) {
        settled = true;
        req.destroy();
        reject(Object.assign(new Error("Body too large"), { code: "BODY_LIMIT" }));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      try {
        resolve(Buffer.concat(chunks).toString("utf8"));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

async function parseBrief(req) {
  if (req.body != null && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  const raw = await readBody(req);
  return JSON.parse(raw || "{}");
}

async function generateSlidesFromBrief(brief) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !String(apiKey).startsWith("sk-")) {
    const err = new Error(
      "OPENAI_API_KEY が設定されていません（sk- で始まるキー）。Vercel → Settings → Environment Variables へ。"
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
    "次のブリーフに基づき、スライド構成を日本語で作成してください。",
    "",
    `- 主目的: ${brief.purpose || "（未入力）"}`,
    `- 対象者: ${brief.audience || "（未入力）"}`,
    `- 種別: ${typeLabel}（${brief.type}）`,
    `- 枚数: ちょうど ${brief.pageCount} 枚（表紙を含む）`,
    "",
    "各スライドの本文は、箇条書き中心で、空行で段落を分けてよい。",
    "JSON 以外の文字は出力しないこと。",
  ].join("\n");

  const ores = await fetch("https://api.openai.com/v1/chat/completions", {
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
          content: `あなたはプレゼン資料の構成案を作るアシスタントです。
必ず次のJSON形式のみを返すこと（キーは英語のまま）:
{"slides":[{"title":"スライドの見出し","body":"本文。箇条書きは行頭に - を使う。\\nで改行。"}]}
slides の配列の長さはユーザー指定の枚数と一致させる。`,
        },
        { role: "user", content: userContent },
      ],
      temperature: 0.7,
    }),
  });

  const raw = await ores.text();
  if (!ores.ok) {
    let detail = raw;
    try {
      const j = JSON.parse(raw);
      detail = j.error?.message || raw;
    } catch {
      /* ignore */
    }
    const err = new Error(`OpenAI API エラー (${ores.status}): ${detail}`);
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

export default async function handler(req, res) {
  try {
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.end();
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, { ok: false, error: "Method Not Allowed", code: "METHOD" });
      return;
    }

    let brief;
    try {
      brief = await parseBrief(req);
    } catch (e) {
      if (e && e.code === "BODY_LIMIT") {
        sendJson(res, 413, { ok: false, error: "Request body too large", code: "BODY_LIMIT" });
        return;
      }
      sendJson(res, 400, { ok: false, error: "JSON が不正です", code: "BAD_JSON" });
      return;
    }

    const pageCount = Math.min(50, Math.max(1, parseInt(String(brief.pageCount), 10) || 5));
    const result = await generateSlidesFromBrief({
      purpose: String(brief.purpose ?? ""),
      audience: String(brief.audience ?? ""),
      type: String(brief.type ?? "explain"),
      pageCount,
    });
    sendJson(res, 200, { ok: true, slides: result.slides, model: result.model });
  } catch (e) {
    const code = e && e.code ? e.code : "ERROR";
    const status = code === "NO_KEY" ? 503 : 500;
    try {
      sendJson(res, status, { ok: false, error: e.message || String(e), code });
    } catch {
      res.statusCode = 500;
      res.end();
    }
  }
}
