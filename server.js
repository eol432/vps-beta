// RIVALS 온라인 서버 — 외부 패키지 없이 Node 내장 모듈만 사용합니다.
// 정적 파일(public/) + WebSocket(/ws) 릴레이 서버
const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");
const MAX_CLIENTS = 200;
const MAX_FRAME = 16 * 1024;

/* ---------------- 정적 파일 ---------------- */
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav",
  ".txt": "text/plain; charset=utf-8"
};
const gzCache = new Map();

const server = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || "/").split("?")[0]);
  if (url === "/healthz") { res.writeHead(200, { "Content-Type": "text/plain" }); return res.end("ok"); }
  if (url === "/") url = "/index.html";
  const file = path.normalize(path.join(PUBLIC, url));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("404 Not Found"); }
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    const headers = { "Content-Type": type, "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600" };
    const wantGz = /\bgzip\b/.test(req.headers["accept-encoding"] || "") && /^(\.html|\.js|\.css|\.json|\.svg|\.txt)$/.test(ext);
    if (wantGz) {
      const key = file + ":" + st.mtimeMs;
      let buf = gzCache.get(key);
      if (!buf) {
        buf = zlib.gzipSync(fs.readFileSync(file), { level: 9 });
        gzCache.clear(); gzCache.set(key, buf);
      }
      headers["Content-Encoding"] = "gzip"; headers["Vary"] = "Accept-Encoding";
      headers["Content-Length"] = buf.length;
      res.writeHead(200, headers);
      return req.method === "HEAD" ? res.end() : res.end(buf);
    }
    headers["Content-Length"] = st.size;
    res.writeHead(200, headers);
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
});

/* ---------------- 최소 WebSocket 구현 (RFC 6455) ---------------- */
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function frame(opcode, payload) {
  const len = payload.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | opcode, len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | opcode; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | opcode; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, payload]);
}

class Conn {
  constructor(socket, onMessage, onClose) {
    this.socket = socket; this.buf = Buffer.alloc(0); this.frags = []; this.fragOp = 0; this.fragLen = 0;
    this.alive = true; this.closed = false; this.onMessage = onMessage; this.onClose = onClose;
    socket.setNoDelay(true);
    socket.on("data", (d) => this._data(d));
    socket.on("close", () => this._end());
    socket.on("error", () => this._end());
  }
  send(str) {
    if (this.closed) return;
    // 느린 클라이언트가 서버 메모리를 먹지 않도록 버퍼가 크면 위치 갱신은 버림
    if (this.socket.writableLength > 512 * 1024) return;
    try { this.socket.write(frame(1, Buffer.from(str))); } catch (e) {}
  }
  ping() { if (!this.closed) try { this.socket.write(frame(9, Buffer.alloc(0))); } catch (e) {} }
  close(code) {
    if (this.closed) return;
    try { const p = Buffer.alloc(2); p.writeUInt16BE(code || 1000); this.socket.write(frame(8, p)); } catch (e) {}
    try { this.socket.end(); } catch (e) {}
    setTimeout(() => { try { this.socket.destroy(); } catch (e) {} }, 500);
    this._end();
  }
  _end() { if (this.closed) return; this.closed = true; this.onClose(); }
  _data(d) {
    if (this.closed) return;
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0, op = b[0] & 0x0f, masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) {
        if (b.length < 10) return;
        const big = b.readBigUInt64BE(2);
        if (big > BigInt(MAX_FRAME)) return this.close(1009);
        len = Number(big); off = 10;
      }
      if (!masked) return this.close(1002);
      if (len > MAX_FRAME) return this.close(1009);
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4);
      const payload = Buffer.from(b.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buf = b.subarray(off + 4 + len);

      if (op === 8) return this.close(1000);
      if (op === 9) { try { this.socket.write(frame(10, payload)); } catch (e) {} continue; }
      if (op === 10) { this.alive = true; continue; }
      if (op === 0 || op === 1 || op === 2) {
        if (op !== 0) { this.fragOp = op; this.frags = []; this.fragLen = 0; }
        this.frags.push(payload); this.fragLen += payload.length;
        if (this.fragLen > MAX_FRAME) return this.close(1009);
        if (fin) {
          const msg = Buffer.concat(this.frags); this.frags = []; this.fragLen = 0;
          if (this.fragOp === 1) this.onMessage(msg.toString("utf8"));
        }
      }
    }
  }
}

/* ---------------- 방(room) 로직 ---------------- */
const clients = new Map(); // peerId -> { conn, presence, tokens, last }
const PRES_STR = { n: 16, c: 9, m: 12 };
const PRES_NUM = ["w", "t", "x", "y", "z", "yw", "hp", "cr", "k", "d", "dl"];
const TARGETED = new Set(["hit", "duel", "whisper"]);

function cleanPresence(p) {
  const out = {};
  if (!p || typeof p !== "object") return out;
  for (const k in PRES_STR) if (typeof p[k] === "string") out[k] = p[k].replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, PRES_STR[k]);
  for (const k of PRES_NUM) if (typeof p[k] === "number" && isFinite(p[k])) out[k] = Math.max(-1e6, Math.min(1e6, p[k]));
  return out;
}

function broadcast(obj, exceptId) {
  const s = JSON.stringify(obj);
  for (const [id, c] of clients) if (id !== exceptId) c.conn.send(s);
}

function onConnect(socket) {
  if (clients.size >= MAX_CLIENTS) { socket.destroy(); return; }
  const id = "p" + crypto.randomBytes(4).toString("hex");
  const state = { conn: null, presence: {}, tokens: 120, last: Date.now() };
  state.conn = new Conn(socket, (text) => onMessage(id, state, text), () => {
    if (clients.delete(id)) broadcast({ t: "leave", peer: id });
  });
  const list = [];
  for (const [pid, c] of clients) list.push({ peer: pid, presence: c.presence });
  clients.set(id, state);
  state.conn.send(JSON.stringify({ t: "hello", peer: id, peers: list }));
  broadcast({ t: "join", peer: id }, id);
}

function onMessage(id, st, text) {
  // 초당 약 100개까지 허용 (토큰 버킷)
  const now = Date.now();
  st.tokens = Math.min(120, st.tokens + (now - st.last) * 0.1); st.last = now;
  if (st.tokens < 1) return;
  st.tokens -= 1;
  let m; try { m = JSON.parse(text); } catch (e) { return; }
  if (!m || typeof m !== "object") return;
  if (m.t === "pres") {
    const p = cleanPresence(m.d);
    Object.assign(st.presence, p);
    broadcast({ t: "pres", peer: id, d: p }, id);
  } else if (m.t === "ev") {
    if (typeof m.e !== "string" || m.e.length > 16) return;
    let d = m.d;
    if (d && typeof d === "object" && m.e === "hit" && typeof d.d === "number") d.d = Math.max(0, Math.min(100, d.d));
    const s = JSON.stringify({ t: "ev", e: m.e, d: d === undefined ? null : d, peer: id });
    if (TARGETED.has(m.e) && d && typeof d.to === "string") {
      const target = clients.get(d.to);
      if (target) target.conn.send(s);
    } else {
      for (const [, c] of clients) c.conn.send(s); // 보낸 사람 포함 (핑 측정에 필요)
    }
  }
}

server.on("upgrade", (req, socket) => {
  const url = (req.url || "").split("?")[0];
  const key = req.headers["sec-websocket-key"];
  if (url !== "/ws" || !key || (req.headers.upgrade || "").toLowerCase() !== "websocket") {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n"); return socket.destroy();
  }
  const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
  socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n");
  onConnect(socket);
});

// 연결 유지 (Render 프록시의 유휴 연결 종료 방지) + 죽은 연결 정리
setInterval(() => {
  for (const [, c] of clients) {
    if (!c.conn.alive) { c.conn.close(1001); continue; }
    c.conn.alive = false; c.conn.ping();
  }
}, 25000);

server.listen(PORT, () => console.log("RIVALS server listening on :" + PORT));
