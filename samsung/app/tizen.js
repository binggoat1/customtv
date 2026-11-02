// The Samsung side of the TV home. On Android the launcher app gives the page window.TVOS (the
// apps on the TV, open an app, a place to keep things); on a Samsung this file does the same job
// with Tizen's own calls, so tv-home/web/app.js runs unchanged.
//
// Apps keep their Android names inside the page (Netflix is "com.netflix.ninja"), so the order
// arranged on the phone works on every TV. COUCH_TIZEN_APPS (tizen-apps.js, made by build.py from
// bridge/apps.py) says which Samsung app each one is.
(function () {
  "use strict";
  var S = window.COUCH_TIZEN || {};
  var MAP = window.COUCH_TIZEN_APPS || {};
  var SELF = "CouchTVApp.Home";
  var BRIDGE = ((location.search.match(/[?&]api=([^&]+)/) || [])[1] || "");
  BRIDGE = decodeURIComponent(BRIDGE);
  var TV_ID = (location.search.match(/[?&]tv=([a-z0-9-]+)/) || [])[1] || "";

  // ---------- optional debug log (build.py --log-url), for testing without a screenshot ----------
  var LOG = S.log || "";
  function send(kind, data) {
    if (!LOG) return;
    try {
      var x = new XMLHttpRequest();
      x.open("POST", LOG + "/" + kind);
      x.setRequestHeader("Content-Type", "text/plain");
      x.send(typeof data === "string" ? data : JSON.stringify(data));
    } catch (e) {}
  }
  if (LOG) {
    window.addEventListener("error", function (e) { send("log", "error: " + e.message + " at " + e.filename + ":" + e.lineno); });
    ["log", "warn", "error"].forEach(function (k) {
      var orig = console[k];
      console[k] = function () {
        send("log", k + ": " + Array.prototype.slice.call(arguments).join(" "));
        if (orig) orig.apply(console, arguments);
      };
    });
    window.addEventListener("load", function () {
      setTimeout(function () {
        send("dom", "<!-- " + location.href + " -->\n" + document.documentElement.outerHTML);
      }, 9000);
    });
    document.addEventListener("keydown", function (e) { send("log", "key " + e.keyCode + " " + e.key); }, true);
  }

  // ---------- the apps on this TV ----------
  var tizenApps = [];
  try { tizenApps = JSON.parse(localStorage.getItem("couch.tizen.apps") || "[]"); } catch (e) {}
  var byTizen = {};   // Tizen id or package id -> Android-style package
  Object.keys(MAP).forEach(function (pkg) {
    var m = MAP[pkg];
    (m.ids || []).forEach(function (id) { byTizen[id] = pkg; });
    if (m.app) byTizen[m.app] = pkg;
  });
  // Tizen lists hundreds of system parts as apps (a 2021 TV: 437). Apps from Samsung's store have a
  // 10 character package id (Tubi is 3KA0pm7a7V); system ones are org.tizen.* or com.samsung.*.
  // A few store-installed extras are Samsung's own and stay hidden.
  var STORE = /^[A-Za-z0-9]{10}$/;
  var HIDE = /^(e-Manual|Security Center|Samsung Promotion|Smarthub Connection Test)$/i;
  var byPkg = {}, shown = [];
  tizenApps.forEach(function (a) {
    if (a.id === SELF || a.packageId === SELF.split(".")[0]) return;
    var pkg = byTizen[a.id] || byTizen[a.packageId];
    if (pkg && !byPkg[pkg]) {
      byPkg[pkg] = a;
      shown.push({ package: pkg, label: MAP[pkg].name || a.name });
    } else if (!pkg && a.show && STORE.test(a.packageId || "") && !HIDE.test(a.name || "") && !byPkg[a.id]) {
      byPkg[a.id] = a;
      shown.push({ package: a.id, label: a.name });
    }
  });
  // Samsung's own live TV, inputs and guide as tiles at the front of the row. Their ids, newest
  // first, as a 2020 TV (Tizen 5.5) lists them in Home settings, About, System apps.
  var tvIcon = function (path) {
    return "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
      'stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + path + "</svg>");
  };
  var SYSTEM = [
    { package: "samsung.livetv", key: "live_tv", ids: ["com.samsung.tv.coba.livetv", "org.tizen.tv-viewer"],
      icon: tvIcon('<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4M9 2l3 3 3-3"/>') },
    { package: "samsung.source", key: "sources", ids: ["com.samsung.tv.coba.source", "org.tizen.SMSourceAPP"],
      icon: tvIcon('<path d="M4 8h10M4 16h10"/><path d="M17 5l3 3-3 3M17 13l3 3-3 3"/>') },
    { package: "samsung.guide", key: "tv_guide", ids: ["org.tizen.epg"],
      icon: tvIcon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v16"/>') }
  ];
  var sysById = {};
  tizenApps.forEach(function (a) { sysById[a.id] = a; });
  var said = function (k) { return window.I18N ? window.I18N.t(k) : k; };
  SYSTEM.slice().reverse().forEach(function (x) {
    var have = x.ids.filter(function (id) { return sysById[id]; });
    if (!have.length) return;
    x.have = have;
    byPkg[x.package] = sysById[have[0]];
    shown.unshift({ package: x.package, label: said(x.key) });
  });
  function systemTile(pkg) { return SYSTEM.filter(function (x) { return x.package === pkg; })[0] || null; }

  send("log", "apps on this TV: " + tizenApps.length + ", shown: " + shown.map(function (a) { return a.label; }).join(", "));

  function bridgeLaunch(pkg) {
    if (!BRIDGE) return;
    var x = new XMLHttpRequest();
    x.open("POST", BRIDGE + "/api/launch");
    x.setRequestHeader("Content-Type", "application/json");
    x.send(JSON.stringify(TV_ID ? { app: pkg, tv: TV_ID } : { app: pkg }));
  }

  // ---------- Live TV and our own Sources menu ----------
  // Samsung lets this app open its guide but not its live TV or input list (a 2020 TV takes the
  // launch and shows nothing). So Live TV puts Couch TV in the background: the TV goes back to
  // the channel or input it showed before. Sources is our own list of the TV's inputs
  // (systeminfo VIDEOSOURCE), and an input picked there is shown full screen through the TV
  // window (privilege tv.window, in config.xml since this change: older installs need a reinstall).
  function hideApp() {
    try { tizen.application.getCurrentApplication().hide(); return; } catch (e) {}
    try { tizen.application.getCurrentApplication().exit(); } catch (e) {}
  }
  var SRC_NAMES = { HDMI: "HDMI", AV: "AV", COMP: "Component", PC: "PC", SCART: "SCART", DVI: "DVI", SVIDEO: "S-Video" };
  var srcBox = null, srcItems = [], srcI = 0, srcOn = false, winOn = false;
  function srcLabel(x) { return (SRC_NAMES[x.type] || x.type) + (x.number ? " " + x.number : ""); }
  function readSources(cb) {
    var out = [{ kind: "tv", label: said("live_tv") }];
    try {
      tizen.systeminfo.getPropertyValue("VIDEOSOURCE", function (v) {
        var add = function (list, on) {
          (list || []).forEach(function (x) {
            if (x.type === "TV" || x.type === "MEDIA") return;
            out.push({ kind: "src", type: x.type, number: x.number, label: srcLabel(x), on: on });
          });
        };
        add(v.connected, true); add(v.disconnected, false);
        cb(out);
      }, function (e) { send("log", "VIDEOSOURCE: " + (e && e.name)); cb(out); });
    } catch (e) { send("log", "VIDEOSOURCE threw " + e); cb(out); }
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function drawSources() {
    srcBox.innerHTML = '<div class="box"><h2>' + esc(said("sources")) + "</h2>" + srcItems.map(function (x, i) {
      return '<div class="it' + (i === srcI ? " focus" : "") + (x.kind === "src" && !x.on ? " off" : "") + '"><span>' + esc(x.label) + "</span>" +
        (x.kind === "src" ? "<small>" + esc(said(x.on ? "src_connected" : "src_empty")) + "</small>" : "") + "</div>";
    }).join("") + '<p class="msg"></p><p class="shint">' + esc(said("src_hint")) + "</p></div>";
  }
  function srcMsg(t) { var m = srcBox && srcBox.querySelector(".msg"); if (m) m.textContent = t; }
  function openSources() {
    readSources(function (list) {
      srcItems = list; srcI = 0;
      for (var i = 0; i < list.length; i++) if (list[i].kind === "src" && list[i].on) { srcI = i; break; }
      if (!srcBox) { srcBox = document.createElement("div"); srcBox.className = "srcs"; document.body.appendChild(srcBox); }
      srcOn = true; srcBox.style.display = "flex";
      drawSources();
    });
    return true;
  }
  function closeSources() { srcOn = false; if (srcBox) srcBox.style.display = "none"; }
  // ---------- watching inside Couch TV: live TV and inputs, with our own on-screen bits ----------
  // The picture comes through the TV window (tizen.tvwindow, privilege tv.window) under a
  // transparent page, so the channel banner, channel list and volume are ours, not Samsung's.
  // Channels: tizen.tvchannel (tv.channel). Volume: tizen.tvaudiocontrol (tv.audio). The remote's
  // Home button still opens Samsung's Smart Hub: no app may take it.
  var watch = null, listOn = false;
  var RECT = ["0px", "0px", innerWidth + "px", innerHeight + "px"];
  function layer(cls) {
    var d = document.createElement("div");
    d.className = "osd " + cls; d.style.display = "none";
    document.body.appendChild(d);
    return d;
  }
  var bannerEl = null, listEl = null, volEl = null, bannerTimer = null, volTimer = null;
  function pickSource() {
    var x = srcItems[srcI];
    if (!x) return;
    if (x.kind === "tv") { openLive(); return; }
    showSource({ type: x.type, number: x.number }, function (e, threw, detail) {
      srcMsg((threw ? said("src_reinstall") : said("src_failed")) + (detail ? " (" + detail + ")" : ""));
    });
  }
  // Show an input (or live TV) through the TV window. Tries, in order: switch the window to the
  // source then show it; show it as it is (the window may already be on live TV); the same with the
  // size as percentages. fail(error, threw, detail) when none works; detail says which step said what.
  function showSource(src, fail) {
    var tried = [];
    var ok = function () {
      closeSources(); closeList();
      watch = src; winOn = true;
      document.documentElement.classList.add("tvwin");
      if (src.type === "TV") banner();
    };
    var why = function (step, e) {
      var t = step + ": " + ((e && (e.name || "")) + (e && e.message ? " " + e.message : "") || String(e));
      tried.push(t); send("log", "tvwindow " + t);
      return e;
    };
    var steps = [
      function (next) {
        tizen.tvwindow.setSource(src, function () {
          tizen.tvwindow.show(ok, function (e) { why("show", e); next(e); }, RECT, "MAIN");
        }, function (e) { why("setSource", e); next(e); }, "MAIN");
      },
      function (next) { tizen.tvwindow.show(ok, function (e) { why("show as is", e); next(e); }, RECT, "MAIN"); },
      function (next) { tizen.tvwindow.show(ok, function (e) { why("show %", e); next(e); }, ["0%", "0%", "100%", "100%"], "MAIN"); }
    ];
    var threw = false;
    (function run(i, last) {
      if (i >= steps.length) return fail(last, threw, tried.join(" / "));
      try { steps[i](function (e) { run(i + 1, e); }); }
      catch (e) { threw = threw || i === 0; why("threw", e); run(i + 1, e); }
    })(0, null);
  }
  // Live TV inside Couch TV; where the TV will not show it, say why on screen for a few seconds,
  // then go to the TV's own live TV
  function openLive() {
    if (watch && watch.type === "TV") { banner(); return true; }
    showSource(tvSrc, function (e, threw, detail) {
      closeSources();
      flash(said("live_failed") + (detail ? " (" + detail + ")" : ""));
      setTimeout(hideApp, 6000);
    });
    return true;
  }
  var flashEl = null, flashTimer = null;
  function flash(text) {
    if (!flashEl) flashEl = layer("osd-flash");
    flashEl.textContent = text; flashEl.style.display = "block";
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { hide(flashEl); }, 6000);
  }
  var tvSrc = { type: "TV", number: 1 };
  try {
    tizen.systeminfo.getPropertyValue("VIDEOSOURCE", function (v) {
      (v.connected || []).concat(v.disconnected || []).forEach(function (x) { if (x.type === "TV") tvSrc = { type: "TV", number: x.number }; });
    }, function () {});
  } catch (e) {}
  function closeWindow() {
    winOn = false; watch = null; digits = ""; clearTimeout(digitTimer);
    closeList(); hide(bannerEl);
    document.documentElement.classList.remove("tvwin");
    try { tizen.tvwindow.hide(function () {}, function () {}, "MAIN"); } catch (e) {}
  }
  function hide(el) { if (el) el.style.display = "none"; }

  // channels
  var chList = null;
  function channels(cb) {
    if (chList) return cb(chList);
    try {
      tizen.tvchannel.getChannelList(function (l) { chList = l || []; cb(chList); },
        function (e) { send("log", "channels: " + (e && e.name)); cb([]); }, "ALL", 0, 3000);
    } catch (e) { cb([]); }
  }
  function currentCh() { try { return tizen.tvchannel.getCurrentChannel("MAIN"); } catch (e) { return null; } }
  function currentProg() { try { return tizen.tvchannel.getCurrentProgram("MAIN"); } catch (e) { return null; } }
  function chNum(c) { return c ? c.major + (c.minor > 0 ? "-" + c.minor : "") : ""; }
  var tuned = { onsuccess: function () { banner(); }, onnosignal: function () { banner(said("ch_nosignal")); },
    onprograminforeceived: function () { if (bannerEl && bannerEl.style.display !== "none") banner(); } };
  function stepCh(d) {
    try { tizen.tvchannel[d > 0 ? "tuneUp" : "tuneDown"](tuned, function () { banner(said("ch_failed")); }, "ALL", "MAIN"); }
    catch (e) { banner(said("ch_failed")); }
  }
  function tuneTo(c) {
    try { tizen.tvchannel.tune({ major: c.major, minor: c.minor }, tuned, function () { banner(said("ch_failed")); }, "MAIN"); }
    catch (e) { banner(said("ch_failed")); }
  }
  function time(d) { try { return (d.getHours() < 10 ? "0" : "") + d.getHours() + ":" + (d.getMinutes() < 10 ? "0" : "") + d.getMinutes(); } catch (e) { return ""; } }
  function banner(note) {
    if (!bannerEl) bannerEl = layer("osd-ch");
    var c = currentCh(), p = currentProg(), when = "";
    if (p && p.startTime) {
      var st = p.startTime.getHours ? p.startTime : new Date(p.startTime);
      when = time(st) + (p.duration ? "–" + time(new Date(st.getTime() + p.duration * 1000)) : "");
    }
    bannerEl.innerHTML = '<div class="num">' + esc(digits || chNum(c)) + "</div>" +
      '<div class="txt"><b>' + esc(digits ? said("ch_typing") : (c && c.channelName) || said("live_tv")) + "</b>" +
      (note ? "<small>" + esc(note) + "</small>" : p && p.title ? "<small>" + esc(p.title) + (when ? " · " + when : "") + "</small>" : "") + "</div>";
    bannerEl.style.display = "flex";
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { if (!digits) hide(bannerEl); }, 5000);
  }
  // typing a channel number on the remote's digits
  var digits = "", digitTimer = null;
  function digit(n) {
    if (digits.length >= 4) digits = "";
    digits += n; banner();
    clearTimeout(digitTimer);
    digitTimer = setTimeout(function () {
      var want = parseInt(digits, 10); digits = "";
      channels(function (l) {
        var hit = l.filter(function (c) { return c.major === want; })[0];
        if (hit) tuneTo(hit); else banner(said("ch_none"));
      });
    }, 1500);
  }
  // the channel list
  var listI = 0;
  function openList() {
    channels(function (l) {
      if (!l.length) { banner(said("ch_empty")); return; }
      var c = currentCh();
      listI = 0;
      for (var i = 0; c && i < l.length; i++) if (l[i].major === c.major && l[i].minor === c.minor) { listI = i; break; }
      listOn = true; hide(bannerEl); clearTimeout(bannerTimer); drawList();
    });
  }
  function drawList() {
    if (!listEl) listEl = layer("osd-list");
    var l = chList || [], from = Math.max(0, Math.min(listI - 4, l.length - 9)), cur = currentCh(), html = "";
    for (var i = from; i < Math.min(l.length, from + 9); i++) {
      var c = l[i], on = cur && c.major === cur.major && c.minor === cur.minor;
      html += '<div class="it' + (i === listI ? " focus" : "") + (on ? " on" : "") + '"><span class="n">' + esc(chNum(c)) + '</span><span class="nm">' + esc(c.channelName || "") + "</span></div>";
    }
    listEl.innerHTML = "<h2>" + esc(said("ch_list")) + "</h2>" + html + '<p class="shint">' + esc(said("ch_list_hint")) + "</p>";
    listEl.style.display = "block";
  }
  function closeList() { listOn = false; hide(listEl); }

  // volume: our own indicator, where the TV lets an app set the volume
  var audioOk = false;
  try { tizen.tvaudiocontrol.getVolume(); audioOk = true; } catch (e) { send("log", "tvaudiocontrol: " + e); }
  function volShow() {
    if (!volEl) volEl = layer("osd-vol");
    var v = 0, mute = false;
    try { v = tizen.tvaudiocontrol.getVolume(); mute = tizen.tvaudiocontrol.isMute(); } catch (e) {}
    var spk = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/>' + (mute ? '<path d="M16 9l5 6M21 9l-5 6"/>' : '<path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/>') + "</svg>";
    volEl.innerHTML = '<span class="ic">' + spk + '</span><span class="bar"><i style="width:' + (mute ? 0 : v) + '%"></i></span><span class="v">' + (mute ? "" : v) + "</span>";
    volEl.style.display = "flex";
    clearTimeout(volTimer);
    volTimer = setTimeout(function () { hide(volEl); }, 2500);
  }
  var VOL = {};
  if (audioOk) [["VolumeUp", function () { tizen.tvaudiocontrol.setVolumeUp(); }],
    ["VolumeDown", function () { tizen.tvaudiocontrol.setVolumeDown(); }],
    ["VolumeMute", function () { tizen.tvaudiocontrol.setMute(!tizen.tvaudiocontrol.isMute()); }]].forEach(function (k) {
    try { tizen.tvinputdevice.registerKey(k[0]); VOL[tizen.tvinputdevice.getKey(k[0]).code] = k[1]; } catch (e) {}
  });
  var DIG = {}, INFO = null;
  "0123456789".split("").forEach(function (n) {
    try { tizen.tvinputdevice.registerKey(n); DIG[tizen.tvinputdevice.getKey(n).code] = n; } catch (e) {}
  });
  try { tizen.tvinputdevice.registerKey("Info"); INFO = tizen.tvinputdevice.getKey("Info").code; } catch (e) {}
  function keyName(code) { for (var k in KEYS) if (KEYS[k] === code) return k; return ""; }
  var KEYS = {};
  ["Source", "ChannelUp", "ChannelDown", "ChannelList", "Guide"].forEach(function (k) {
    try { KEYS[k] = tizen.tvinputdevice.getKey(k).code; } catch (e) {}
  });

  // While our menus or a picture are up, the remote's keys are ours, before app.js sees them.
  // Volume is ours everywhere in Couch TV.
  function isBackKey(e) { return e.keyCode === 10009 || e.keyCode === 27 || e.keyCode === 8; }
  function grab(e) {
    var code = e.keyCode;
    if (VOL[code]) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.type === "keydown") { try { VOL[code](); } catch (x) {} volShow(); }
      return;
    }
    if (!srcOn && !winOn && !listOn) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.type !== "keydown") return;
    var k = keyName(code);
    if (listOn) {
      var n = (chList || []).length;
      if (code === 38) { listI = (listI - 1 + n) % n; drawList(); }
      else if (code === 40) { listI = (listI + 1) % n; drawList(); }
      else if (code === 13) { var c = chList[listI]; closeList(); if (c) tuneTo(c); }
      else if (isBackKey(e) || k === "ChannelList") closeList();
      return;
    }
    if (winOn) {
      var tv = watch && watch.type === "TV";
      if (isBackKey(e)) { if (digits) { digits = ""; clearTimeout(digitTimer); hide(bannerEl); } else closeWindow(); }
      else if (k === "Source") { closeWindow(); openSources(); }
      else if (tv && (k === "ChannelUp" || code === 38)) stepCh(1);
      else if (tv && (k === "ChannelDown" || code === 40)) stepCh(-1);
      else if (tv && (k === "ChannelList" || code === 13)) openList();
      else if (tv && DIG[code] !== undefined) digit(DIG[code]);
      else if (tv && code === INFO) banner();
      else if (k === "ChannelUp" || k === "ChannelDown" || k === "ChannelList") { closeWindow(); openLive(); }
      else if (k === "Guide") { closeWindow(); launch("samsung.guide"); }
      return;
    }
    if (code === 38) { srcI = Math.max(0, srcI - 1); drawSources(); }
    else if (code === 40) { srcI = Math.min(srcItems.length - 1, srcI + 1); drawSources(); }
    else if (code === 13) pickSource();
    else if (isBackKey(e) || k === "Source") closeSources();
  }
  window.addEventListener("keydown", grab, true);
  window.addEventListener("keyup", grab, true);

  function launch(pkg) {
    if (pkg === "samsung.livetv") return openLive();
    if (pkg === "samsung.source") return openSources();
    var a = byPkg[pkg], m = MAP[pkg], sys = systemTile(pkg);
    var ids = sys ? sys.have.slice() : a ? [a.id] : [];
    if (m) (m.ids || []).concat(m.app ? [m.app] : []).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
    if (!ids.length && /\./.test(pkg)) ids.push(pkg);
    if (!ids.length) return false;
    var lastErr = "";
    (function attempt(i) {
      if (i >= ids.length) {
        send("log", "launch failed for " + pkg + ", asking the bridge");
        if (sys) return systemFallback(sys, lastErr);
        bridgeLaunch(pkg);
        return;
      }
      var next = function (err) {
        lastErr = (err && (err.name || err.message)) || String(err || "");
        send("log", "launch " + ids[i] + ": " + lastErr);
        // Samsung's own parts sometimes refuse a plain launch but take an app control
        if (sys && !next.tried) { next.tried = true; return byControl(ids[i], function () { attempt(i + 1); }); }
        attempt(i + 1);
      };
      try { tizen.application.launch(ids[i], function () { send("log", "launched " + ids[i]); }, next); }
      catch (e) { next(e); }
    })(0);
    return true;
  }

  function byControl(id, fail) {
    try {
      var ctl = new tizen.ApplicationControl("http://tizen.org/appcontrol/operation/default", null, null, null, null);
      tizen.application.launchAppControl(ctl, id, function () { send("log", "app control launched " + id); }, function (e) {
        send("log", "app control " + id + ": " + (e && e.name)); fail();
      });
    } catch (e) { fail(); }
  }
  // Live TV that will not open: leave Couch TV, and the TV goes back to what it showed before,
  // the channel or the HDMI input. Sources and the guide: say so on screen.
  function systemFallback(sys, err) {
    if (sys.package === "samsung.livetv") {
      try { tizen.application.getCurrentApplication().exit(); return; } catch (e) {}
    }
    if (window.COUCH_NOTE) window.COUCH_NOTE(said(sys.package === "samsung.source" ? "sources_blocked" : "app_blocked") + (err ? " (" + err + ")" : ""));
  }

  function iconUrl(pkg) {
    var sys = systemTile(pkg);
    if (sys) return sys.icon;
    var m = MAP[pkg];
    if (m && m.logo) return "logos/" + pkg + ".png";
    var a = byPkg[pkg];
    if (a && a.iconPath) return /^[a-z]+:/.test(a.iconPath) ? a.iconPath : "file://" + a.iconPath;
    return null;
  }

  window.TVOS = {
    // Home settings, About: the app's own version, and the GitHub commit it runs when it updated itself (ota.js)
    version: function () {
      var v = "";
      try { v = tizen.application.getCurrentApplication().appInfo.version; } catch (e) {}
      var ota = window.COUCH_OTA && window.COUCH_OTA.on ? window.COUCH_OTA.version() : "";
      return "Samsung " + (v || "?") + (ota ? " · " + ota : "");
    },
    // the live TV, sources and guide tiles take their names in the language picked now
    apps: function () {
      return JSON.stringify(shown.map(function (a) { var x = systemTile(a.package); return x ? { package: a.package, label: said(x.key) } : a; }));
    },
    // Home settings, About, System apps: Samsung's own parts that look like live TV or the input
    // list, with their ids, so a tile can open them (the ids change between TV years)
    systemApps: function () {
      var want = /tv|source|surs|input|hdmi|viewer|live|channel|canal|tuner|epg|guide|ghid|program/i;
      return JSON.stringify(tizenApps.filter(function (a) {
        return !STORE.test(a.packageId || "") && (want.test(a.name || "") || want.test(a.id || ""));
      }).map(function (a) { return { name: a.name || "", id: a.id, show: !!a.show }; }));
    },
    // a file from the GitHub commit this app updated itself to (ota.js), for pictures that came after
    // this TV's install; null when the app does not update itself
    assetUrl: function (path) {
      var m = /^([\w.-]+)\/([\w.-]+)@(.+)$/.exec(S.update || "");
      if (!m) return null;
      var sha = "";
      try { sha = localStorage.getItem("couch.ota.sha") || ""; } catch (e) {}
      return "https://raw.githubusercontent.com/" + m[1] + "/" + m[2] + "/" + (sha || m[3]) + "/" + path;
    },
    // the remote's keys this TV lets an app take (for remapping, e.g. Source), Home settings, About, System apps
    keyNames: function () {
      try { return tizen.tvinputdevice.getSupportedKeys().map(function (k) { return k.name; }).join(", "); } catch (e) { return ""; }
    },
    openApp: function (id) {
      try { tizen.application.launch(id, null, function (err) { send("log", "launch " + id + ": " + (err && err.name)); }); return true; }
      catch (e) { return false; }
    },
    launch: launch,
    iconUrl: iconUrl,
    bannerUrl: function () { return null; },
    kept: function (k) { try { return localStorage.getItem("tvos." + k); } catch (e) { return null; } },
    keep: function (k, v) { try { localStorage.setItem("tvos." + k, v); } catch (e) {} },
    // the input button: Samsung's own input list, where this TV has it (the Sources tile)
    canOpenInputs: function () { return true; },
    openInputs: function () { return openSources(); }
  };

  // ---------- the remote ----------
  // Arrows, OK (Enter) and Back (10009) reach the page by themselves. Tools (the remote's menu key)
  // has to be asked for: it picks an app up, like holding OK.
  var TOOLS = null;
  try {
    tizen.tvinputdevice.registerKey("Tools");
    TOOLS = tizen.tvinputdevice.getKey("Tools").code;
  } catch (e) {}
  // The remote's own buttons, remapped while Couch TV is on screen (Samsung lets an app take these,
  // a 2020 TV lists them under System apps): Source opens our Sources menu, the channel buttons
  // and the channel list go back to live TV, Guide opens Samsung's guide. Anywhere else (live TV,
  // an input, another app) they do what Samsung made them do.
  var REMAP = {};
  [["Source", function () { if (!srcOn && !winOn) openSources(); }],
   ["ChannelUp", openLive], ["ChannelDown", openLive], ["ChannelList", function () { openLive(); }],
   ["Guide", function () { launch("samsung.guide"); }]].forEach(function (k) {
    try { tizen.tvinputdevice.registerKey(k[0]); REMAP[tizen.tvinputdevice.getKey(k[0]).code] = k[1]; }
    catch (e) { send("log", "registerKey " + k[0] + ": " + e); }
  });
  document.addEventListener("keydown", function (e) {
    var act = REMAP[e.keyCode];
    if (act && !winOn) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) act();
      return;
    }
    if (TOOLS !== null && e.keyCode === TOOLS) {
      e.preventDefault();
      e.stopImmediatePropagation();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true }));
    }
  }, true);

  // ---------- jobs only an app on the TV may do (bridge/samsung.py open_title) ----------
  // The bridge cannot open a title in Prime, Stan and the rest itself: a Samsung app passes the
  // title on with launchAppControl (operation eden_resume, PAYLOAD {"values": <JustWatch's
  // action_data>}). This asks the bridge for jobs while couch-tv is on screen.
  var polling = false;
  function answer(id, ok, error) {
    try {
      var x = new XMLHttpRequest();
      x.open("POST", BRIDGE + "/api/tizen/answer");
      x.setRequestHeader("Content-Type", "application/json");
      x.send(JSON.stringify({ tv: TV_ID || undefined, id: id, ok: ok, error: error || null }));
    } catch (e) {}
  }
  function run(job) {
    send("log", "job " + JSON.stringify(job));
    if (job.do !== "appcontrol") { answer(job.id, false, "unknown job " + job.do); return; }
    try {
      var data = [new tizen.ApplicationControlData("PAYLOAD", [JSON.stringify({ values: job.data })])];
      var ctl = new tizen.ApplicationControl("http://samsung.com/appcontrol/operation/eden_resume", null, null, null, data);
      tizen.application.launchAppControl(ctl, job.app,
        function () { answer(job.id, true); },
        function (e) { answer(job.id, false, (e && e.name) + ": " + (e && e.message)); });
    } catch (e) { answer(job.id, false, String(e)); }
  }
  function jobs() {
    if (!BRIDGE || document.hidden) { polling = false; return; }
    polling = true;
    var x = new XMLHttpRequest();
    x.open("GET", BRIDGE + "/api/tizen/next" + (TV_ID ? "?tv=" + TV_ID : ""));
    x.timeout = 35000;
    x.onload = function () {
      var job = null;
      try { job = JSON.parse(x.responseText).job; } catch (e) {}
      if (job) run(job);
      setTimeout(jobs, 50);
    };
    x.onerror = x.ontimeout = function () { setTimeout(jobs, 3000); };
    x.send();
  }
  jobs();

  // coming back to the app (after Netflix, say): read the lists again
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && window.tv && window.tv.resume) window.tv.resume();
    if (!document.hidden && !polling) jobs();
  });
})();
