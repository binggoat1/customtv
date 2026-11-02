// Older TV browsers. Samsung's 2020 TVs (Tizen 5.5) run a Chrome 69 engine and the 2021 ones
// (Tizen 6.0) Chrome 76; `gap` between flex items only arrived in Chrome 84. Without it every row
// in app.css (the quick buttons, the shelf, the settings lists, the smart home) loses its spacing.
// On a browser that has flex gap this file does nothing. On one that does not, it gives the items
// of each flex row (or column) the gap as a margin instead, and keeps doing so as app.js changes
// the page. Plain ES5 on purpose: no arrows, no let/const.
(function () {
  "use strict";

  function hasFlexGap() {
    var d = document.createElement("div");
    d.style.cssText = "display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden";
    d.appendChild(document.createElement("div"));
    d.appendChild(document.createElement("div"));
    document.body.appendChild(d);
    var ok = d.scrollHeight === 1;
    document.body.removeChild(d);
    return ok;
  }

  // the selectors in app.css that set a gap; only their elements are looked at
  function gapSelectors() {
    var out = [];
    for (var i = 0; i < document.styleSheets.length; i++) {
      var rules;
      try { rules = document.styleSheets[i].cssRules; } catch (e) { continue; }
      collect(rules, out);
    }
    return out;
  }
  function collect(rules, out) {
    for (var j = 0; rules && j < rules.length; j++) {
      var r = rules[j];
      if (r.cssRules && !r.selectorText) { collect(r.cssRules, out); continue; }   // @media
      if (r.style && r.selectorText && (r.style.columnGap || r.style.rowGap || r.style.getPropertyValue("gap"))) {
        out.push(r.selectorText);
      }
    }
  }

  // getComputedStyle turns margin: auto into pixels; the typed style map (Chrome 66+) keeps "auto"
  function isAuto(el, side) {
    try { return String(el.computedStyleMap().get("margin-" + side.toLowerCase())) === "auto"; } catch (e) { return false; }
  }
  function px(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

  // Each touched side remembers its margin from app.css, so a new gap (or a class that moves the
  // item) is worked out from that and not stacked on top of the last pass.
  function setSide(el, side, gap) {
    var key = "fg" + side;
    var prop = "margin" + side;
    if (!(key in el.dataset)) {
      el.style[prop] = "";
      el.dataset[key] = isAuto(el, side) ? "auto" : getComputedStyle(el)[prop];
    }
    if (el.dataset[key] === "auto") return;   // margin: auto pushes the item along; leave it
    var want = gap ? (px(el.dataset[key]) + gap) + "px" : "";
    if (el.style[prop] !== want) el.style[prop] = want;
  }

  function fix(box) {
    var cs = getComputedStyle(box);
    if (cs.display !== "flex" && cs.display !== "inline-flex") return;
    var cg = px(cs.columnGap), rg = px(cs.rowGap);
    if (!cg && !rg) return;
    var dir = cs.flexDirection, wrap = cs.flexWrap !== "nowrap";
    var column = dir.indexOf("column") === 0, reverse = dir.indexOf("reverse") > 0;
    var first = true;
    for (var k = 0; k < box.children.length; k++) {
      var c = box.children[k];
      var ccs = getComputedStyle(c);
      if (ccs.display === "none" || ccs.position === "absolute" || ccs.position === "fixed") continue;
      if (wrap) {
        // a wrapping row: space after every item, both ways (the row's own edge gets it too)
        setSide(c, column ? "Bottom" : "Right", column ? rg : cg);
        setSide(c, column ? "Right" : "Bottom", column ? cg : rg);
      } else if (column) {
        setSide(c, reverse ? "Bottom" : "Top", first ? 0 : rg);
      } else {
        setSide(c, reverse ? "Right" : "Left", first ? 0 : cg);
      }
      first = false;
    }
  }

  function start() {
    if (hasFlexGap()) return;
    document.documentElement.classList.add("no-flex-gap");
    var sels = gapSelectors().join(",");
    if (!sels) return;
    // Each change only looks at the gap rows it can affect: the changed element itself, its parent,
    // and any gap rows inside what was added. A full pass over the page on every key press made
    // moving around slow on older TVs.
    var all = true, dirty = [], queued = false;
    function isBox(el) { try { return el && el.nodeType === 1 && el.matches(sels); } catch (e) { return false; } }
    function mark(el) { if (isBox(el) && dirty.indexOf(el) < 0) dirty.push(el); }
    function run() {
      queued = false;
      var boxes = dirty;
      dirty = [];
      if (all) {
        all = false;
        try { boxes = document.querySelectorAll(sels); } catch (e) { return; }
      }
      for (var i = 0; i < boxes.length; i++) if (boxes[i].isConnected !== false) fix(boxes[i]);
    }
    function sameBut(a, b) {
      var skip = /^(scene|mine)-/;
      var x = String(a || "").split(/\s+/).filter(function (k) { return k && !skip.test(k); }).sort().join(" ");
      var y = String(b || "").split(/\s+/).filter(function (k) { return k && !skip.test(k); }).sort().join(" ");
      return x === y;
    }
    function later() { if (!queued) { queued = true; setTimeout(run, 0); } }
    run();
    // app.js builds the shelves and lists after this and changes classes as focus moves
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var m = list[i], el = m.target;
        mark(el);
        mark(el.parentNode);
        // the page's own class changes with every scene (scene-*, mine-*), which moves the clock and
        // date but no gap: re-checking every row then made the scene change stutter on older TVs
        if (m.type === "attributes" && el === document.documentElement && sameBut(m.oldValue, el.className)) continue;
        // a new class can show or hide what is inside; added nodes bring their own rows
        var roots = m.type === "childList" ? m.addedNodes : [el];
        for (var j = 0; j < roots.length; j++) {
          var n = roots[j];
          if (n.nodeType !== 1) continue;
          mark(n);
          var inner = n.querySelectorAll(sels);
          for (var k = 0; k < inner.length; k++) mark(inner[k]);
        }
      }
      // right away, not on a timer: this runs after app.js's change and before the TV draws it,
      // so a list never shows for a frame without its spacing and then jumps
      if (dirty.length) run();
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ["class"] });
    window.addEventListener("resize", function () { all = true; later(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
