/* 멀티플레이 연결 모듈
 * 게임 코드가 사용하는 claude.use("room") 형태의 인터페이스를
 * Socket.IO 서버(server.js)로 연결해 줍니다. */
(function () {
  var socket = null, meId = null, room = null;
  var others = new Map();
  var self = { peer: null, isMe: true, sameTab: true, kind: "viewer", presence: {} };
  var cache = null, handlers = {}, pendingPres = null;

  function dispatch(type, msg) {
    var hs = handlers[type];
    if (!hs) return;
    hs.slice().forEach(function (h) { try { h(msg); } catch (e) { console.error(e); } });
  }
  function addPeer(id, presence) {
    others.set(id, { peer: id, isMe: false, sameTab: false, kind: "viewer", presence: presence || {} });
    cache = null;
  }

  function connect() {
    if (socket || typeof io === "undefined") return;
    socket = io({ transports: ["websocket", "polling"] });

    socket.on("init", function (d) {
      meId = d.me; self.peer = meId;
      others.clear();
      (d.peers || []).forEach(function (p) { addPeer(p.peer, p.presence); });
      cache = null;
      if (pendingPres) socket.emit("presence", pendingPres);
    });
    socket.on("join", function (d) { if (d && d.peer) addPeer(d.peer, {}); });
    socket.on("presence", function (d) {
      if (!d) return;
      var p = others.get(d.peer);
      if (p) p.presence = d.presence || {}; else addPeer(d.peer, d.presence);
    });
    socket.on("leave", function (d) { if (d && others.delete(d.peer)) cache = null; });
    socket.on("msg", function (m) {
      if (!m) return;
      dispatch(m.type, { type: m.type, peer: m.peer, isMe: m.peer === meId, data: m.data });
    });
    socket.on("disconnect", function () { others.clear(); cache = null; meId = null; self.peer = null; });
  }

  room = {
    peers: function () {
      if (cache) return cache;
      var a = [];
      if (meId) a.push(self);
      others.forEach(function (p) { a.push(p); });
      return (cache = a);
    },
    presence: function (obj) {
      pendingPres = obj; self.presence = obj || {};
      if (socket && socket.connected) socket.volatile.emit("presence", obj);
      return Promise.resolve();
    },
    emit: function (type, data) {
      if (socket && socket.connected) socket.emit("msg", { type: type, data: data });
      return Promise.resolve();
    },
    on: function (type, cb) {
      (handlers[type] = handlers[type] || []).push(cb);
      return function () {
        var i = (handlers[type] || []).indexOf(cb);
        if (i >= 0) handlers[type].splice(i, 1);
      };
    },
    connected: function () { return !!(socket && socket.connected); }
  };

  window.claude = {
    use: function (name) {
      if (name !== "room") return Promise.resolve(null);
      connect();
      return Promise.resolve(room);
    }
  };
})();
