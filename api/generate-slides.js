/**
 * Vercel Serverless: POST /api/generate-slides
 * CommonJS（module.exports）
 *
 * 注意: Vercel 上でリクエストボディのストリームが既に消費されていると
 * data/end が来ずハングし、既定の関数タイムアウトで FUNCTION_INVOCATION_FAILED になる。
 * readableEnded チェック・短いタイムアウトで回避する。
 *
 * OpenAI 呼び出しは fetch ではなく node:https で行い、ランタイム差を避ける。
 */

const https = require("node:https");

function sendJson(res, statusCode, obj) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let settled = false;
    let timer;

    const finish = (err, val) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (err) reject(err);
      else resolve(val);
    };

    if (req.readableEnded) {
      finish(null, "");
      return;
    }

    timer = setTimeout(() => {
      if (settled) return;
      if (chunks.length === 0) {
        finish(null, "");
      } else {
        try {
          finish(null, Buffer.concat(chunks).toString("utf8"));
        } catch (e) {
          finish(e);
        }
      }
    }, 3000);

    req.on("data", (chunk) => {
      if (settled) return;
      total += chunk.length;
      if (total > 200_000) {
        settled = true;
        if (timer) clearTimeout(timer);
        req.destroy();
        reject(Object.assign(new Error("Body too large"), { code: "BODY_LIMIT" }));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        finish(null, Buffer.concat(chunks).toString("utf8"));
      } catch (e) {
        finish(e);
      }
    });
    req.on("error", (err) => finish(err));
  });
}

function postJsonHttps(urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const opts = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: "POST",
      headers: {
        ...headers,
        "Content-Length": Buffer.byteLength(body, "utf8"),
      },
    };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        resolve({
          status: res.statusCode || 0,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function parseBrief(req) {
  const b = req.body;
  if (b != null) {
    if (typeof b === "string") {
      try {
        return JSON.parse(b || "{}");
      } catch {
        throw Object.assign(new Error("invalid json"), { code: "BAD_JSON" });
      }
    }
    if (Buffer.isBuffer(b)) {
      try {
        return JSON.parse(b.toString("utf8") || "{}");
      } catch {
        throw Object.assign(new Error("invalid json"), { code: "BAD_JSON" });
      }
    }
    if (typeof b === "object") {
      return b;
    }
  }
  const raw = await readBody(req);
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw Object.assign(new Error("invalid json"), { code: "BAD_JSON" });
  }
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

  const payload = JSON.stringify({
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
  });

  const ores = await postJsonHttps("https://api.openai.com/v1/chat/completions", {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  }, payload);

  const raw = ores.body;
  if (ores.status < 200 || ores.status >= 300) {
    let detail = raw;
    try {
      const j = JSON.parse(raw);
      detail = j.error && j.error.message ? j.error.message : raw;
    } catch {
      /* ignore */
    }
    const err = new Error(`OpenAI API エラー (${ores.status}): ${detail}`);
    err.code = "OPENAI_HTTP";
    throw err;
  }

  const data = JSON.parse(raw);
  const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
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
      title: String(s.title != null ? s.title : "").trim(),
      body: String(s.body != null ? s.body : "").trim(),
    })),
    model,
  };
}

module.exports = async function handler(req, res) {
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
      purpose: String(brief.purpose != null ? brief.purpose : ""),
      audience: String(brief.audience != null ? brief.audience : ""),
      type: String(brief.type != null ? brief.type : "explain"),
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
};
