const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, "public");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json"
};

const server = http.createServer((req, res) => {
  let u;
  try { u = decodeURIComponent((req.url || "/").split("?")[0]); } catch (e) { res.writeHead(400); return res.end(); }
  if (u === "/healthz") { res.writeHead(200); return res.end("ok"); }
  if (u === "/") u = "/index.html";
  const f = path.normalize(path.join(PUB, u));
  if (f !== PUB && !f.startsWith(PUB + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(f)] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(data);
  });
});

/* ---- 실시간 룸 (모든 접속자가 하나의 룸을 공유) ---- */
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 16 * 1024 });
const clients = new Map();
let seq = 1;

function bcast(obj, except) {
  const s = JSON.stringify(obj);
  for (const c of clients.values()) if (c !== except && c.readyState === 1) c.send(s);
}

wss.on("connection", (ws) => {
  const id = "p" + (seq++).toString(36) + Math.random().toString(36).slice(2, 6);
  ws.id = id; ws.presence = null; ws.alive = true;
  ws.tokens = 160; ws.tl = Date.now();
  clients.set(id, ws);

  const snap = {};
  clients.forEach((c, k) => { if (c !== ws && c.presence) snap[k] = c.presence; });
  ws.send(JSON.stringify({ t: "hello", id, peers: snap }));

  ws.on("pong", () => { ws.alive = true; });
  ws.on("message", (raw) => {
    ws.alive = true;
    const now = Date.now();
    ws.tokens = Math.min(160, ws.tokens + ((now - ws.tl) / 1000) * 80);
    ws.tl = now;
    if (ws.tokens < 1) return; // 과도한 전송 차단
    ws.tokens--;
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m) return;
    if (m.t === "p" && m.p && typeof m.p === "object") {
      ws.presence = m.p;
      bcast({ t: "p", id, p: m.p }, ws);
    } else if (m.t === "e" && typeof m.ty === "string" && m.ty.length <= 20) {
      bcast({ t: "e", id, ty: m.ty, d: m.d }, null); // 보낸 사람에게도 echo (핑 측정용)
    }
  });
  ws.on("close", () => {
    clients.delete(id);
    bcast({ t: "l", id }, null);
  });
  ws.on("error", () => {});
});

// Render 프록시가 유휴 연결을 끊지 않도록 ping + 죽은 연결 정리
setInterval(() => {
  for (const ws of clients.values()) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    try { ws.ping(); } catch (e) {}
  }
}, 25000);

server.listen(PORT, () => console.log("RIVALS server on :" + PORT));
