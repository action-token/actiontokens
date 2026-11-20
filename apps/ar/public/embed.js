// @ts-nocheck — plain browser script served as-is to third-party sites.
/*!
 * Bandcoin map embed loader.
 *
 *   <div data-bandcoin-embed="EMBED_ID" style="height:520px"></div>
 *   <script async src="https://ar.action-tokens.com/embed.js"></script>
 *
 * Turns every [data-bandcoin-embed] element into the embed's iframe, sized to
 * fill the element. Several maps per page are fine, and elements added later
 * (page builders, SPAs) are picked up too. Give the element a height with CSS;
 * without one it falls back to a 16:9 box.
 */
(function () {
  "use strict";
  if (window.BandcoinEmbed) {
    window.BandcoinEmbed.scan();
    return;
  }

  var script =
    document.currentScript ||
    (function () {
      var all = document.querySelectorAll('script[src*="embed.js"]');
      return all[all.length - 1];
    })();
  var origin = new URL(script && script.src ? script.src : window.location.href).origin;

  function mount(el) {
    if (el.getAttribute("data-bandcoin-mounted")) return;
    var id = (el.getAttribute("data-bandcoin-embed") || "").trim();
    if (!id) return;
    el.setAttribute("data-bandcoin-mounted", "1");

    // No height from the page's CSS → a sensible box instead of a 0px map.
    if (el.clientHeight < 40) {
      el.style.aspectRatio = el.style.aspectRatio || "16 / 9";
      el.style.minHeight = el.style.minHeight || "360px";
    }
    if (getComputedStyle(el).position === "static") el.style.position = "relative";

    var iframe = document.createElement("iframe");
    iframe.src = origin + "/embed/" + encodeURIComponent(id);
    iframe.title = el.getAttribute("data-title") || "Bandcoin map";
    iframe.loading = "lazy";
    // "Near me" needs this; the browser still asks the visitor first.
    iframe.allow = "geolocation";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;border:0;display:block;" +
      "border-radius:" + (el.getAttribute("data-radius") || "0") + ";";
    el.appendChild(iframe);
  }

  function scan() {
    var nodes = document.querySelectorAll("[data-bandcoin-embed]");
    for (var i = 0; i < nodes.length; i++) mount(nodes[i]);
  }

  window.BandcoinEmbed = { scan: scan };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan);
  else scan();

  if (window.MutationObserver) {
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        if (records[i].addedNodes.length) return scan();
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
})();
