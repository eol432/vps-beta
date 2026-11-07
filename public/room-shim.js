/* claude.ai의 claude.use("room") 대신 쓰는 WebSocket 호환 레이어.
   게임 코드가 쓰는 room.peers / presence / emit / on / connected 를 그대로 제공합니다. */
(function () {
  if (window.claude && window.claude.use) return; // claude.ai 안에서는 원래 런타임 사용
  var ws = null, myId = null, peers = {}, mine = null, handlers = {};

  function url() {
    return (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws";
  }
  function raw(o) {
    if (ws && ws.readyState === 1) { ws.send(JSON.stringify(o)); return true; }
    return false;
  }
  function connect() {
    try { ws = new WebSocket(url()); } catch (e) { setTimeout(connect, 2000); return; }
    ws.onmessage = function (ev) {
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === "hello") {
        myId = m.id; peers = {};
        for (var k in m.peers) peers[k] = m.peers[k];
        if (mine) raw({ t: "p", p: mine });
      } else if (m.t === "p") {
        peers[m.id] = m.p;
      } else if (m.t === "l") {
        delete peers[m.id];
      } else if (m.t === "e") {
        var hs = handlers[m.ty];
        if (hs) hs.slice().forEach(function (f) {
          try { f({ data: m.d, isMe: m.id === myId, peer: m.id, type: m.ty }); } catch (e) { console.error(e); }
        });
      }
    };
    ws.onclose = function () { myId = null; peers = {}; setTimeout(connect, 1500); };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }

  var room = {
    peers: function () {
      var a = [];
      if (myId) a.push({ peer: myId, isMe: true, sameTab: true, kind: "viewer", presence: mine });
      for (var k in peers) a.push({ peer: k, isMe: false, sameTab: false, kind: "viewer", presence: peers[k] });
      return a;
    },
    presence: function (p) { mine = p; raw({ t: "p", p: p }); return Promise.resolve(); },
    emit: function (ty, d) { raw({ t: "e", ty: ty, d: d }); return Promise.resolve(); },
    on: function (ty, f) { (handlers[ty] = handlers[ty] || []).push(f); },
    connected: function () { return !!(ws && ws.readyState === 1 && myId); }
  };

  window.claude = { use: function (n) { return Promise.resolve(n === "room" ? room : null); } };
  connect();
})();
