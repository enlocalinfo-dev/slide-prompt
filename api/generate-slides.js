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

  // 品質優先なら環境変数 OPENAI_MODEL=gpt-4o（コストは増える）
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
    "JSON 以外の文字は出力しないこと。",
  ].join("\n");

  const payload = JSON.stringify({
    model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `あなたは戦略コンサル・経営企画のシニアコンサルタントです。プレゼンの「論理構成」と「決裁者向け文案」を作る。デザイン・配色は不要。
スタイル: ピラミッド原則（スライドごとに主メッセージ1つ、その下に根拠）。論点はMECEに近い形で整理。各スライドに「So What」を必ず書く。
必ず次のJSON形式のみを返すこと（キーは英語のまま）:
{"slides":[{"title":"スライド見出し（結論が伝わる短い主張）","body":"【役割】…\\n【構成】…\\n【主メッセージ】…\\n【根拠】\\n- …\\n【So What】…"}]}
slides の配列の長さはユーザー指定の枚数と一致させる。
title は「○○の検討」のような曖昧語を避け、可能なら結論寄りの言い切りにする。`,
      },
      { role: "user", content: userContent },
    ],
    temperature: 0.62,
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
