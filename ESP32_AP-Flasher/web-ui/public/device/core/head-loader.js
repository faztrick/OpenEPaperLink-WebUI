// head-loader.js
// Dynamically injects a shared <head> partial (shared-head.html) so that meta tags, fonts,
// stylesheet links and favicons are centrally maintained. Must run before other page scripts.
// Usage: include this script as the very first <script> in the <head> (or right after opening <head>)
// OR ensure page-manifest core loads it first (it has no dependencies).

(function(){
  const HEAD_PARTIAL = 'shared-head.html';
  const markerId = 'shared-head-injected';
  if (document.getElementById(markerId)) return; // already injected

  function inject(html){
    // Parse returned partial and move its children into current <head> if not already present
    const temp = document.createElement('div');
    temp.innerHTML = html; // Expect only head child elements (no <head> wrapper required)
    const head = document.head;
    Array.from(temp.children).forEach(node => {
      if (node.tagName === 'TITLE') {
        // Do not overwrite an existing explicit page title if present
        if (!head.querySelector('title[data-page-title]')) {
          // Mark injected title so future pages can override by providing their own <title data-page-title>
          if (!head.querySelector('title')) head.appendChild(node.cloneNode(true));
        }
        return;
      }
      // Avoid duplicate inclusion based on rel+href or src
      if (node.tagName === 'LINK') {
        const rel = node.getAttribute('rel');
        const href = node.getAttribute('href');
        if (rel && href && head.querySelector(`link[rel="${rel}"][href="${href}"]`)) return;
      }
      if (node.tagName === 'SCRIPT') {
        const src = node.getAttribute('src');
        if (src && head.querySelector(`script[src="${src}"]`)) return;
      }
      head.appendChild(node.cloneNode(true));
    });
    const flag = document.createElement('meta');
    flag.id = markerId;
    head.appendChild(flag);
  }

  fetch(HEAD_PARTIAL, { cache: 'no-store' })
    .then(r => r.ok ? r.text() : '')
    .then(txt => { if (txt) inject(txt); })
    .catch(()=>{/*silent*/});
})();
