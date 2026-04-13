/**
 * OpenAI でスライド構成を生成（server.mjs / Vercel api 共通）
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { SYSTEM_PROMPT, buildUserPrompt } = require("./slide-generation-prompt.cjs");

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
  const userContent = buildUserPrompt(brief);

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
          content: SYSTEM_PROMPT,
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
