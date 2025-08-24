// Page Manifest: declares shared core scripts and per-page extras to avoid duplication.
// Modify arrays as new modules/components are added.
window.PageManifest = (function(){
  const version = '3.2';
  const core = [
    `core/head-loader.js?${version}`,
    `constants.js?${version}`,
    `utils.js?${version}`,
    `app-core.js?${version}`,
    `performance.js?${version}`,
    `ui-components.js?${version}`,
    `tag-manager.js?${version}`,
    `canvas-renderer.js?${version}`,
    `feature-manager.js?${version}`,
    `api-manager-enhanced.js?${version}`,
    `debug-system.js?${version}`,
    `openai-agent-enhanced.js?${version}`,
    `compact-ui.js?${version}`,
    `g5decoder.js?${version}`,
    `module-manager-ui.js?${version}`,
  `module-status-icons.js`,
    `shared-nav.js`,
    `component-loader.js` // ensure components available everywhere
  ];
  // Page specific additions keyed by simple page id (filename without .html)
  const pages = {
    index: [ 'main.js?'+version ],
    dashboard: [ 'main.js?'+version ],
    logs: [ 'logs-page.js?v=1' ],
    flasher: [ 'flash.js?2.74' ],
    edit: [],
    updates: [],
  settings: [ 'main.js?'+version, 'settings-page.js' ],
  tags: [ 'main.js?'+version, 'tags-page.js' ],
  status: [ 'status-page.js' ],
  setup: [ 'main.js?'+version, 'setup-page.js' ],
  c6_module: [ 'main.js?'+version, 'c6_module.js' ],
  c6_function_test: [ 'main.js?'+version, 'c6_function_test.js' ],
  c6_diagnostic: [ 'main.js?'+version ],
    'ai-agent': [ 'openai-agent-enhanced.js?'+version ],
    'ai-tools': [],
    'debug_monitor': [],
    'ir_remote': [ 'ir-remote-page.js' ]
  };
  function getScripts(pageId){
    return [...core, ...(pages[pageId]||[])];
  }
  return { version, core, pages, getScripts };
})();
