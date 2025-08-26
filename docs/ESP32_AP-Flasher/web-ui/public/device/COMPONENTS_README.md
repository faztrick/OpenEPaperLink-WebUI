# Web UI Component System

This folder now supports a lightweight component/page split for the dashboard UI without introducing a heavy framework.

## How it works

1. In `index.html` (or any page) add placeholders: `<div data-component="system-overview"></div>`.
2. `component-loader.js` runs after DOM ready, finds all `[data-component]` nodes, and fetches `components/<name>.html`.
3. If a matching `components/<name>.js` exists it is loaded (after the HTML) and can run local initialization code.
4. Once all components finish loading a `componentsLoaded` event is dispatched on `document`.

## Conventions

- HTML partials live in `components/` and contain only the markup for the card/section (no `<script>` tags inside ideally).
- Optional logic per component goes into a same-named JS file (e.g. `components/quick-actions.js`). Keep scripts small.
- Use globally exposed utilities (existing app functions) rather than re‑implementing logic inside components.
- Add new components by creating `components/<name>.html` and inserting `<div data-component="<name>"></div>` into a page.

## Error Handling

If a component fails to load its container receives `data-component-error="1"` and a simple error message is shown.

## Future Enhancements (ideas)

- Caching fetched HTML in `sessionStorage` for faster navigation.
- Lazy loading components only when scrolled into view (IntersectionObserver).
- Parameterized components via `data-props` JSON attribute.

## Events

- `componentsLoaded` (document): fired after all placeholders processed.
- You may define `window.__onComponentLoaded(name, el)` to receive callbacks for each JS-enabled component once its script loads.

## Unified Boot Loader

To eliminate duplicated `<script>` tags across pages a lightweight boot system was added in `core/`:

Files:

- `core/page-manifest.js`: Declares a versioned list of shared scripts (core array) plus per‑page additions keyed by page id (filename without `.html`).
- `core/boot.js`: Determines the page id from `<html data-page="...">` (falls back to filename) and loads scripts sequentially preserving order.

Usage in a page head:

```html
<html data-page="index">
 ...
 <script src="core/page-manifest.js"></script>
 <script src="core/boot.js" defer></script>
</html>
```

Add page specific scripts by editing `PageManifest.pages` in `page-manifest.js`.

Boot emits `boot:ready` (detail: `{ page, scripts }`) after all scripts are loaded.

`component-loader.js` is included in the shared core list so components work on every page automatically.

---
Lightweight by design to avoid build steps while still enabling gradual refactor into modular sections.
