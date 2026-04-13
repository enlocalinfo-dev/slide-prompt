/**
 * ローカル専用: 静的ファイル配信 + OpenAI でスライド構成を生成
 * 起動: npm run dev
 * 要: .env に OPENAI_API_KEY（.env.example を参照）
 */
import "dotenv/config";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateSlidesFromBrief } from "./lib/openai-generate-slides.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8787;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const joined = path.join(ROOT, decoded);
  if (!joined.startsWith(ROOT)) return null;
  return joined;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Cache-Control": "no-store", ...headers });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (req.method === "POST" && url.pathname === "/api/generate-slides") {
    let buf = "";
    req.on("data", (c) => {
      buf += c;
      if (buf.length > 200_000) req.destroy();
    });
    req.on("end", async () => {
      try {
        const brief = JSON.parse(buf || "{}");
        const pageCount = Math.min(50, Math.max(1, parseInt(String(brief.pageCount), 10) || 5));
        const deckTitle =
          String(brief.deckTitle != null ? brief.deckTitle : brief.purpose != null ? brief.purpose : "").trim();
        const result = await generateSlidesFromBrief({
          deckTitle,
          pageCount,
        });
        send(
          res,
          200,
          JSON.stringify({ ok: true, slides: result.slides, model: result.model }),
          { "Content-Type": "application/json; charset=utf-8" }
        );
      } catch (e) {
        const code = e.code || "ERROR";
        const status = code === "NO_KEY" ? 503 : 500;
        send(
          res,
          status,
          JSON.stringify({ ok: false, error: e.message || String(e), code }),
          { "Content-Type": "application/json; charset=utf-8" }
        );
      }
    });
    return;
  }

  if (req.method !== "GET") {
    send(res, 405, "Method Not Allowed");
    return;
  }

  let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
  if (filePath.endsWith("/")) {
    filePath = `${filePath}index.html`;
  }
  let resolved = safePath(filePath);
  if (!resolved) {
    send(res, 403, "Forbidden");
    return;
  }

  fs.stat(resolved, (err, st) => {
    if (!err && st.isFile()) {
      serveFile(res, resolved);
      return;
    }
    const dirIndex = safePath(`${filePath.replace(/\/?$/, "/")}index.html`);
    if (dirIndex) {
      fs.stat(dirIndex, (e2, st2) => {
        if (!e2 && st2.isFile()) serveFile(res, dirIndex);
        else send(res, 404, "Not Found");
      });
      return;
    }
    send(res, 404, "Not Found");
  });
});

function serveFile(res, resolved) {
  const ext = path.extname(resolved);
  const type = MIME[ext] || "application/octet-stream";
  fs.readFile(resolved, (e, data) => {
    if (e) {
      send(res, 500, "Error");
      return;
    }
    send(res, 200, data, { "Content-Type": type });
  });
}

server.listen(PORT, () => {
  console.log(`ローカルサーバ: http://localhost:${PORT}/`);
  console.log(`OpenAI 用: .env に OPENAI_API_KEY を設定してください`);
});
