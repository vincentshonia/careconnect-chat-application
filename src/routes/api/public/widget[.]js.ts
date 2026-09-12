import { createFileRoute } from "@tanstack/react-router";

/**
 * Embeddable loader script.
 *   <script src="https://<app>/api/public/widget.js" data-website-id="..."></script>
 * Creates an iframe that hosts the chat widget and resizes it on demand.
 */
export const Route = createFileRoute("/api/public/widget.js")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // The canonical origin is the one that actually served this script.
        // Embeds that point at an address which redirects here would otherwise
        // make every follow-up request cross-origin-redirected, which strips the
        // Origin header and breaks the embedding-origin proof.
        const canonicalOrigin = new URL(request.url).origin;
        const js = `(function(){
  var cur = document.currentScript || document.querySelector('script[data-website-id]');
  var id = cur && cur.getAttribute('data-website-id');
  if (!id) { console.error('[chat-widget] data-website-id is required'); return; }
  if (window.__lovableChatWidget) return;
  window.__lovableChatWidget = true;
  var widgetOrigin = ${JSON.stringify(canonicalOrigin)};


  var host = encodeURIComponent(window.location.origin);
  var page = encodeURIComponent(window.location.pathname);
  var originProof = '';
  function mount() {
  var frame = document.createElement('iframe');
  frame.title = 'Customer support chat';
  frame.src = widgetOrigin + '/widget?w=' + encodeURIComponent(id) + '&h=' + host + '&p=' + page +
    '&op=' + encodeURIComponent(originProof) +
    '&r=' + encodeURIComponent(document.referrer || '') + '&q=' + encodeURIComponent(window.location.search || '');
  frame.setAttribute('allowtransparency', 'true');
  frame.style.cssText = 'position:fixed;bottom:16px;right:16px;width:88px;height:88px;border:0;z-index:2147483000;background:transparent;color-scheme:normal;transition:width .18s ease,height .18s ease;';
  document.body.appendChild(frame);

  window.addEventListener('message', function (e) {
    if (e.origin !== widgetOrigin || !e.data || e.data.source !== 'lovable-chat-widget') return;
    var d = e.data;
    if (d.type === 'resize') {
      var mobile = window.innerWidth < 480;
      if (d.open) {
        frame.style.width = mobile ? (window.innerWidth - 16) + 'px' : '400px';
        frame.style.height = mobile ? (window.innerHeight - 32) + 'px' : Math.min(640, window.innerHeight - 40) + 'px';
      } else {
        frame.style.width = d.bubble ? '320px' : '88px';
        frame.style.height = d.bubble ? '190px' : '88px';
      }
    }
    if (d.type === 'position') {
      if (d.value === 'bottom-left') { frame.style.right = 'auto'; frame.style.left = '16px'; }
      else { frame.style.left = 'auto'; frame.style.right = '16px'; }
    }
    if (d.type === 'hide') { frame.style.display = 'none'; }
  });
  }
  // This request is cross-origin, so the browser attaches a trustworthy Origin
  // header. The signed proof it returns is what authorizes the chat session.
  function start() {
    fetch(widgetOrigin + '/api/public/chat/origin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ websiteId: id })
    }).then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.proof) originProof = j.proof; })
      .catch(function () {})
      .then(function () { mount(); });
  }
  if (document.body) { start(); }
  else { document.addEventListener('DOMContentLoaded', start); }
})();`;
        return new Response(js, {
          headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            "Cache-Control": "no-cache, no-store, max-age=0, must-revalidate",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
