/**
 * 診断用: GET /api/ping — サーバレスが動いていれば JSON が返る（OpenAI は呼ばない）
 */
module.exports = function handler(req, res) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(
    JSON.stringify({
      ok: true,
      node: process.version,
      time: new Date().toISOString(),
    })
  );
};
