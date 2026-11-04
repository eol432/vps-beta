/* RIVALS 멀티플레이 서버 (정적 파일 + WebSocket 방) */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");
const MAX_PER_ROOM = 40;        // 방 하나당 최대 인원
const MAX_MSG_BYTES = 8 * 1024; // 메시지 최대 크기
const RATE_PER_SEC = 240;       // 초당 허용 메시지 수 (넘으면 무시)

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
};

/* ---------- 정적 파일 ---------- */
const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  } catch (e) {
    res.writeHead(400);
    return res.end("bad request");
  }
  if (pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    return res.end("ok");
  }
  if (pathname === "/") pathname = "/index.html";
  const file = path.normalize(path.join(PUBLIC, pathname));
  if (file !== PUBLIC && !file.startsWith(PUBLIC + path.sep)) {
    res.writeHead(403);
    return res.end("forbidden");
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("404 Not Found");
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600",
    });
    res.end(data);
  });
});

/* ---------- 방 / 접속자 ---------- */
const rooms = new Map(); // roomName -> Map(id -> { ws, presence })

function send(ws, obj) {
  if (ws.readyState !== 1) return;
  if (ws.bufferedAmount > 1024 * 1024) return; // 느린 연결은 건너뜀
  ws.send(JSON.stringify(obj));
}
function broadcast(room, obj, exceptId) {
  const s = JSON.stringify(obj);
  for (const [id, c] of room) {
    if (id === exceptId) continue;
    if (c.ws.readyState !== 1 || c.ws.bufferedAmount > 1024 * 1024) continue;
    c.ws.send(s);
  }
}

const wss = new WebSocketServer({ server, path: "/ws", maxPayload: MAX_MSG_BYTES });

wss.on("connection", (ws, req) => {
  let name = "main";
  try {
    const q = new URL(req.url, "http://x").searchParams.get("room");
    if (q && /^[\w-]{1,32}$/.test(q)) name = q;
  } catch (e) {}

  let room = rooms.get(name);
  if (!room) {
    room = new Map();
    rooms.set(name, room);
  }
  if (room.size >= MAX_PER_ROOM) {
    send(ws, { t: "full" });
    return ws.close(1013, "room full");
  }

  const id = crypto.randomBytes(6).toString("hex");
  const me = { ws, presence: {} };
  room.set(id, me);

  const snapshot = {};
  for (const [pid, c] of room) if (pid !== id) snapshot[pid] = c.presence;
  send(ws, { t: "hello", id, peers: snapshot });

  ws.isAlive = true;
  ws.on("pong", () => (ws.isAlive = true));

  let tokens = RATE_PER_SEC;
  let last = Date.now();

  ws.on("message", (raw) => {
    const now = Date.now();
    tokens = Math.min(RATE_PER_SEC, tokens + ((now - last) / 1000) * RATE_PER_SEC);
    last = now;
    if (tokens < 1) return;
    tokens -= 1;

    let m;
    try {
      m = JSON.parse(raw.toString());
    } catch (e) {
      return;
    }
    if (!m || typeof m !== "object") return;

    if (m.t === "p" && m.d && typeof m.d === "object" && !Array.isArray(m.d)) {
      Object.assign(me.presence, m.d);
      broadcast(room, { t: "p", id, d: m.d }, id);
    } else if (m.t === "e" && typeof m.k === "string" && m.k.length <= 24) {
      // 보낸 사람에게도 되돌려 보냄 (핑 측정 등에서 사용)
      broadcast(room, { t: "e", k: m.k, d: m.d, id });
    }
  });

  ws.on("close", () => {
    room.delete(id);
    if (room.size === 0) rooms.delete(name);
    else broadcast(room, { t: "l", id });
  });
  ws.on("error", () => {});
});

/* 끊어진 연결 정리 (30초마다) */
const hb = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch (e) {}
  }
}, 30000);

server.listen(PORT, () => console.log("RIVALS 서버 실행 중: 포트 " + PORT));

function shutdown() {
  clearInterval(hb);
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
