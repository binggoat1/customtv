// Updates over the air for the Samsung app. Built in only with `samsung/build.py --update
// owner/repo@branch`, which sets COUCH_TIZEN.update. Each time the app opens, boot.html asks
// GitHub for the branch's latest commit. When it is new, the TV home's code (the files in FILES,
// from that commit) is downloaded and kept on the TV, and index.html runs the kept copy instead of
// the one inside the app. So a push to the branch reaches the TV the next time Couch TV opens
// (or the time after, if the download was slow), with no computer.
//
// What updates: the code and words (FILES). What does not: pictures, fonts, index.html itself,
// new files, and config.xml. Those still need a reinstall.
// Safe by default: a kept copy that fails to start twice in a row is thrown away and the copy
// inside the app runs again. The repository has to be public (raw.githubusercontent.com).
// Plain ES5 on purpose: older Samsungs run a Chrome 69 engine.
(function () {
  "use strict";
  var S = window.COUCH_TIZEN || {};
  var M = /^([\w.-]+)\/([\w.-]+)@(.+)$/.exec(S.update || "");
  var P = "couch.ota.";
  var FILES = {
    "app.css": "tv-home/web/app.css",
    "compat.js": "tv-home/web/compat.js",
    "i18n.js": "tv-home/web/i18n.js",
    "smarthome.js": "tv-home/web/smarthome.js",
    "app.js": "tv-home/web/app.js",
    "tizen.js": "samsung/app/tizen.js"
  };

  function get(k) { try { return localStorage.getItem(P + k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(P + k, v); return true; } catch (e) { return false; } }
  function drop() {
    for (var f in FILES) try { localStorage.removeItem(P + "file." + f); } catch (e) {}
    try { localStorage.removeItem(P + "sha"); } catch (e) {}
  }

  function fetchText(url, cb, accept) {
    var x = new XMLHttpRequest();
    x.open("GET", url);
    if (accept) x.setRequestHeader("Accept", accept);
    x.timeout = 15000;
    x.onload = function () { cb(x.status === 200 ? x.responseText : null); };
    x.onerror = x.ontimeout = function () { cb(null); };
    x.send();
  }

  // boot.html: count this start as a try; check for a new commit; done() is called within `wait` ms
  // (sooner when there is nothing new), whatever happens.
  function check(wait, done) {
    var called = false;
    function finish() { if (!called) { called = true; done(); } }
    if (!M) return finish();
    var fails = parseInt(get("fails") || "0", 10);
    if (get("sha") && fails >= 2) { put("skip", get("sha")); drop(); }   // the kept copy did not start: back to the built-in one, and never that commit again
    put("fails", String(get("sha") ? fails + 1 : 0));
    setTimeout(finish, wait);
    var api = "https://api.github.com/repos/" + M[1] + "/" + M[2] + "/commits/" + encodeURIComponent(M[3]);
    fetchText(api, function (sha) {
      sha = (sha || "").replace(/\s+/g, "");
      if (!/^[0-9a-f]{40}$/.test(sha) || sha === get("sha") || sha === get("skip")) return finish();
      var names = Object.keys(FILES), got = {}, left = names.length, failed = false;
      names.forEach(function (n) {
        fetchText("https://raw.githubusercontent.com/" + M[1] + "/" + M[2] + "/" + sha + "/" + FILES[n], function (t) {
          if (t == null) failed = true; else got[n] = t;
          if (--left) return;
          if (failed) return finish();   // try again next time
          var ok = true;
          names.forEach(function (k) { ok = ok && put("file." + k, got[k]); });
          if (!ok) { drop(); put("skip", sha); return finish(); }   // too big for this TV's storage
          put("sha", sha); put("fails", "1");
          finish();
        });
      });
    }, "application/vnd.github.sha");
  }

  // index.html: write the kept copy of a file inline, else load the built-in one
  function js(name) {
    var t = get("sha") ? get("file." + name) : null;
    if (t) document.write("<script>" + t.replace(/<\/script/gi, "<\\/script") + "\n//# sourceURL=ota/" + name + "</scr" + "ipt>");
    else document.write('<script src="' + name + '"></scr' + "ipt>");
  }
  function css(name) {
    var t = get("sha") ? get("file." + name) : null;
    if (t) document.write("<style>" + t.replace(/<\/style/gi, "<\\/style") + "</style>");
    else document.write('<link rel="stylesheet" href="' + name + '">');
  }
  // index.html, once the page has run for a while with no error: this copy works
  function settle() {
    var broke = false;
    window.addEventListener("error", function () { broke = true; });
    window.addEventListener("load", function () {
      setTimeout(function () { if (!broke) put("fails", "0"); }, 8000);
    });
  }

  window.COUCH_OTA = { on: !!M, check: check, js: js, css: css, settle: settle,
    version: function () { return (get("sha") || "").slice(0, 7) || "built-in"; } };
})();
