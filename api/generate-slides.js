/**
 * Vercel Serverless: POST /api/generate-slides
 * 環境変数: OPENAI_API_KEY（必須）, OPENAI_MODEL（任意）
 */
import { generateSlidesFromBrief } from "../lib/openai-generate-slides.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method Not Allowed", code: "METHOD" });
    return;
  }

  let buf = "";
  try {
    for await (const chunk of req) {
      buf += chunk;
      if (buf.length > 200_000) break;
    }
    const brief = JSON.parse(buf || "{}");
    const pageCount = Math.min(50, Math.max(1, parseInt(String(brief.pageCount), 10) || 5));
    const result = await generateSlidesFromBrief({
      purpose: String(brief.purpose ?? ""),
      audience: String(brief.audience ?? ""),
      type: String(brief.type ?? "explain"),
      pageCount,
    });
    res.status(200).json({ ok: true, slides: result.slides, model: result.model });
  } catch (e) {
    const code = e.code || "ERROR";
    const status = code === "NO_KEY" ? 503 : 500;
    res.status(status).json({ ok: false, error: e.message || String(e), code });
  }
}
