// VPS 멀티플레이 서버 (Render Web Service용)
// - public/ 폴더의 정적 파일 제공
// - /ws 로 WebSocket 접속: 위치(presence) 동기화 + 이벤트(hit/kill/duel/ut/png) 중계
const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = +process.env.MAX_PLAYERS || 40;
const PUBLIC = path.join(__dirname, "public");
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav",
};

/* ---------- 정적 파일 ---------- */
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  if (url === "/healthz") { res.writeHead(200, { "Content-Type": "text/plain" }); return res.end("ok"); }
  let file = path.normalize(path.join(PUBLIC, url === "/" ? "index.html" : url));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
    });
    res.end(data);
  });
});

/* ---------- WebSocket ---------- */
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 16 * 1024 });
const clients = new Map(); // id -> { ws, pres, has, alive, tokens, last }
const dirty = new Set();
let seq = 0;
const newId = () => Math.random().toString(36).slice(2, 7) + (seq++).toString(36);
const EVENTS = new Set(["hit", "kill", "duel", "ut", "png"]);

const num = (v, lo, hi) => { v = +v; return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : 0; };
const str = (v, n) => String(v == null ? "" : v).slice(0, n);

// 클라이언트가 보낸 presence에서 허용된 항목만 받아 정리
function clean(d, out) {
  if (!d || typeof d !== "object") return;
  if ("n" in d) out.n = str(d.n, 12);
  if ("c" in d) out.c = str(d.c, 16);
  if ("m" in d) out.m = str(d.m, 8);
  if ("t" in d) out.t = num(d.t, 0, 2) | 0;
  for (const k of ["x", "z"]) if (k in d) out[k] = num(d[k], -5000, 5000);
  if ("y" in d) out.y = num(d.y, -200, 500);
  if ("yw" in d) out.yw = num(d.yw, -20, 20);
  if ("hp" in d) out.hp = num(d.hp, 0, 100);
  if ("cr" in d) out.cr = num(d.cr, 0, 1);
  if ("k" in d) out.k = num(d.k, 0, 9999) | 0;
  if ("d" in d) out.d = num(d.d, 0, 9999) | 0;
  if ("dl" in d) out.dl = d.dl ? 1 : 0;
}

function send(c, obj) {
  if (c.ws.readyState === 1 && c.ws.bufferedAmount < 1e6) c.ws.send(typeof obj === "string" ? obj : JSON.stringify(obj));
}

wss.on("connection", (ws) => {
  if (clients.size >= MAX_PLAYERS) { ws.close(1013, "full"); return; }
  const id = newId();
  const c = { ws, pres: {}, has: false, alive: true, tokens: 60, last: Date.now() };
  clients.set(id, c);
  const peers = [];
  clients.forEach((o, oid) => { if (oid !== id && o.has) peers.push({ id: oid, d: o.pres }); });
  send(c, { t: "hello", id, peers });

  ws.on("pong", () => { c.alive = true; });
  ws.on("message", (raw) => {
    c.alive = true;
    // 초당 약 60개까지만 허용 (도배 방지)
    const now = Date.now();
    c.tokens = Math.min(60, c.tokens + (now - c.last) / 1000 * 60); c.last = now;
    if (c.tokens < 1) return; c.tokens--;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== "object") return;

    if (m.t === "p") {
      clean(m.d, c.pres); c.has = true; dirty.add(id);
    } else if (m.t === "e" && EVENTS.has(m.k)) {
      const d = m.d && typeof m.d === "object" ? m.d : {};
      if (d.d !== undefined) d.d = num(d.d, 0, 100);
      if (m.k === "png") return send(c, { t: "e", k: "png", id, d }); // 핑: 보낸 사람에게만 되돌림
      const msg = JSON.stringify({ t: "e", k: m.k, id, d });
      const target = m.k === "kill" ? d.k : d.to;
      if (target !== undefined && target !== null) { const o = clients.get(String(target)); if (o) send(o, msg); }
      else clients.forEach((o) => send(o, msg));
    }
  });
  ws.on("close", () => {
    clients.delete(id); dirty.delete(id);
    const msg = JSON.stringify({ t: "l", id });
    clients.forEach((o) => send(o, msg));
  });
  ws.on("error", () => {});
});

// 위치 정보는 20Hz로 모아서 한 번에 전송 (플레이어 수가 많아도 부담이 적음)
setInterval(() => {
  if (!dirty.size) return;
  const parts = new Map();
  dirty.forEach((id) => { const c = clients.get(id); if (c) parts.set(id, JSON.stringify([id, c.pres])); });
  dirty.clear();
  clients.forEach((c, cid) => {
    const arr = [];
    parts.forEach((p, id) => { if (id !== cid) arr.push(p); });
    if (arr.length) send(c, '{"t":"pb","u":[' + arr.join(",") + "]}");
  });
}, 50);

// 연결 끊긴 접속자 정리 (Render의 유휴 연결 종료 방지 겸용)
setInterval(() => {
  clients.forEach((c) => {
    if (!c.alive) return c.ws.terminate();
    c.alive = false;
    try { c.ws.ping(); } catch (e) {}
  });
}, 25000);

server.listen(PORT, () => console.log("VPS server listening on :" + PORT));
