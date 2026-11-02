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
  function pickSource() {
    var x = srcItems[srcI];
    if (!x) return;
    if (x.kind === "tv") { closeSources(); hideApp(); return; }
    try {
      var fail = function (e) { send("log", "tvwindow: " + (e && e.name)); srcMsg(said("src_failed") + (e && e.name ? " (" + e.name + ")" : "")); };
      tizen.tvwindow.setSource({ type: x.type, number: x.number }, function () {
        tizen.tvwindow.show(function () {
          closeSources(); winOn = true; document.documentElement.classList.add("tvwin");
        }, fail, ["0px", "0px", innerWidth + "px", innerHeight + "px"], "MAIN");
      }, fail, "MAIN");
    } catch (e) { send("log", "tvwindow threw " + e); srcMsg(said("src_reinstall")); }
  }
  function closeWindow() {
    winOn = false; document.documentElement.classList.remove("tvwin");
    try { tizen.tvwindow.hide(function () {}, function () {}, "MAIN"); } catch (e) {}
  }
  // While our menu or an input is up, the remote's keys are ours, before app.js sees them.
  function isBackKey(e) { return e.keyCode === 10009 || e.keyCode === 27 || e.keyCode === 8; }
  function grab(e) {
    if (!srcOn && !winOn) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.type !== "keydown") return;
    if (winOn) { if (isBackKey(e)) closeWindow(); return; }
    if (e.keyCode === 38) { srcI = Math.max(0, srcI - 1); drawSources(); }
    else if (e.keyCode === 40) { srcI = Math.min(srcItems.length - 1, srcI + 1); drawSources(); }
    else if (e.keyCode === 13) pickSource();
    else if (isBackKey(e)) closeSources();
  }
  window.addEventListener("keydown", grab, true);
  window.addEventListener("keyup", grab, true);

  function launch(pkg) {
    if (pkg === "samsung.livetv") { hideApp(); return true; }
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
  document.addEventListener("keydown", function (e) {
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
