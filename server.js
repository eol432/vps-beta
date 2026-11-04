// RIVALS 멀티플레이 서버 (Express + Socket.IO)
// - public/ 폴더의 게임을 정적 파일로 제공
// - 접속한 플레이어끼리 위치(presence)와 이벤트(총 맞음, 킬, 채팅 등)를 중계
const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = parseInt(process.env.MAX_PLAYERS || "60", 10);

const app = express();
app.disable("x-powered-by");
app.get("/healthz", (req, res) => res.type("text").send("ok"));
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e5,
  cors: { origin: false },
});

// peerId(socket.id) -> presence
const peers = new Map();

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const smallEnough = (v, n) => {
  try { return JSON.stringify(v).length <= n; } catch (e) { return false; }
};

io.on("connection", (socket) => {
  if (peers.size >= MAX_PLAYERS) {
    socket.emit("full");
    socket.disconnect(true);
    return;
  }

  const id = socket.id;
  peers.set(id, {});

  // 접속 직후: 내 ID + 현재 접속자 목록 전달
  const others = [];
  peers.forEach((presence, peer) => {
    if (peer !== id) others.push({ peer, presence });
  });
  socket.emit("init", { me: id, peers: others });
  socket.broadcast.emit("join", { peer: id });

  // 간단한 과다 전송 방지 (초당 150개 초과 시 무시)
  let tokens = 150, last = Date.now();
  const allow = () => {
    const now = Date.now();
    tokens = Math.min(150, tokens + ((now - last) / 1000) * 150);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };

  // 내 상태(위치, 체력, 킬/데스 등) 갱신 -> 다른 사람에게 전달
  socket.on("presence", (presence) => {
    if (!allow() || !isObj(presence) || !smallEnough(presence, 600)) return;
    peers.set(id, presence);
    socket.broadcast.emit("presence", { peer: id, presence });
  });

  // 이벤트 전달 (hit, kill, duel, chat, whisper, announce, ut, png ...)
  socket.on("msg", (msg) => {
    if (!allow() || !isObj(msg)) return;
    const type = msg.type;
    const data = msg.data;
    if (typeof type !== "string" || type.length > 20) return;
    if (data !== undefined && !smallEnough(data, 1000)) return;

    const out = { type, peer: id, data };
    if (type === "png") {                 // 핑 측정: 보낸 사람에게만 되돌려줌
      socket.emit("msg", out);
    } else if (isObj(data) && typeof data.to === "string") {
      io.to(data.to).emit("msg", out);    // 특정 플레이어에게만
    } else {
      socket.broadcast.emit("msg", out);  // 전체에게
    }
  });

  socket.on("disconnect", () => {
    peers.delete(id);
    io.emit("leave", { peer: id });
  });
});

server.listen(PORT, () => {
  console.log("RIVALS server running on port " + PORT);
});
