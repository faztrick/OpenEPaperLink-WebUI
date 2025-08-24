# Dev Components System

This folder contains reusable HTML fragment components for the development Web UI.

## Components

- header.html: Top header with logo and status indicators / serial controls.
- nav.html: Main navigation bar links.
- sidebar.html: Project info + advanced pages + settings quick link.
- modals.html: Shared modals (progress + AI assistant shells).

## Loader

`components.js` scans for elements with `data-include="<name>"` and replaces them with the fetched HTML from this folder. Results are cached in-memory for performance.

Lifecycle:

1. DOMContentLoaded -> loadAll() injects placeholders.
2. After injection, an event `components:loaded` is dispatched on `document`.
3. SPA navigation (`spa.js`) triggers reload on `spa:navigated`.

## Adding a New Component

1. Create an HTML file in this folder, e.g. `footer.html`.
2. Add `<div data-include="footer"></div>` to any page.
3. (Optional) Listen for `components:loaded` in scripts if you need to wire behavior.

## Script Order / Dependencies

Include `components/components.js` early (head with `defer`) so that other scripts which rely on injected markup and also use `defer` can listen for `components:loaded`.

Example usage in a page-specific script:

```js
function initMyPage(){ /* query injected elements now */ }
if(document.readyState !== 'loading') initMyPage();
document.addEventListener('components:loaded', initMyPage);
```

## Migration Notes

Some legacy modals or unique sections (e.g. device edit modal) still reside in individual pages. They can be consolidated into `modals.html` later once their JS initializers are unified.

## Active Nav Highlight

The loader marks the current page's nav link with `active` class after each load.
