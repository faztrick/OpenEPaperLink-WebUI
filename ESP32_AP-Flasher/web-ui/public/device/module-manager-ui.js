// module-manager-ui.js
// Small UI helper to list modules and toggle autoStart

async function initModuleManagerUI() {
    // Wait until DOM is ready and settings container exists
    const interval = setInterval(() => {
        const configTab = document.getElementById('configtab');
        if (configTab) {
            clearInterval(interval);
            renderModuleAutoStartSection(configTab);
        }
    }, 100);
}

function renderModuleAutoStartSection(container) {
    // Create section header
    const header = document.createElement('h3');
    header.textContent = 'Module AutoStart';
    container.appendChild(header);

    const infoP = document.createElement('p');
    infoP.innerHTML = '<label>Auto-start modules on boot</label><span style="flex:1">Toggle which modules should start automatically when the AP boots.</span>';
    container.appendChild(infoP);

    const listP = document.createElement('p');
    listP.id = 'module-autostart-list';
    container.appendChild(listP);

    const reloadP = document.createElement('p');
    const refreshBtn = document.createElement('button');
    refreshBtn.textContent = 'Refresh Module List';
    refreshBtn.addEventListener('click', loadModuleList);
    reloadP.appendChild(refreshBtn);
    container.appendChild(reloadP);

    loadModuleList();
}

// Wire export/import buttons if present in the DOM
document.addEventListener('DOMContentLoaded', () => {
    const exportBtn = document.getElementById('exportBtn');
    const importInput = document.getElementById('importInput');
    const importBtn = document.getElementById('importBtn');

    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            try {
                const r = await fetch('/api/modules/config');
                const j = await r.json();
                const blob = new Blob([JSON.stringify(j, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'modules_config.json';
                a.click();
                URL.revokeObjectURL(url);
            } catch (e) {
                console.error('Export failed', e);
                showNotification && showNotification('Failed to export modules: ' + e.message, 'error');
            }
        });
    }

    if (importBtn && importInput) {
        importBtn.addEventListener('click', async () => {
            const file = importInput.files && importInput.files[0];
            if (!file) {
                showNotification && showNotification('No file selected', 'error');
                return;
            }
            const text = await file.text();
            try {
                const r = await fetch('/api/modules/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: text
                });
                if (!r.ok) throw new Error('HTTP ' + r.status);
                showNotification && showNotification('Modules config imported', 'success');
                loadModuleList();
            } catch (e) {
                console.error('Import failed', e);
                showNotification && showNotification('Failed to import modules: ' + e.message, 'error');
            }
        });
    }
});

async function loadModuleList() {
    const listP = document.getElementById('module-autostart-list');
    if (!listP) return;
    listP.innerHTML = 'Loading modules...';

    try {
        const resp = await fetch('/api/modules');
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        // data expected: { modules: [ { name, autoStart, version, description } ] }
        listP.innerHTML = '';
        const ul = document.createElement('div');
        ul.style.display = 'flex';
        ul.style.flexDirection = 'column';
        ul.style.gap = '8px';

        const modules = data.modules || [];
        if (modules.length === 0) {
            listP.textContent = 'No modules registered.';
            return;
        }

        modules.forEach(m => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.gap = '12px';

            const label = document.createElement('div');
            label.style.minWidth = '220px';
            label.textContent = `${m.name} ${m.version ? 'v'+m.version : ''}`;

            const desc = document.createElement('div');
            desc.style.flex = '1';
            desc.style.opacity = '0.9';
            desc.textContent = m.description || '';

            const toggle = document.createElement('input');
            toggle.type = 'checkbox';
            toggle.checked = !!m.autoStart;
            toggle.dataset.module = m.name;
            toggle.addEventListener('change', onAutoStartToggle);

            row.appendChild(label);
            row.appendChild(desc);
            row.appendChild(toggle);
            ul.appendChild(row);
        });

        listP.appendChild(ul);
    } catch (err) {
        console.error('Failed to load modules:', err);
        listP.textContent = 'Failed to load modules: ' + err.message;
    }
}

async function onAutoStartToggle(ev) {
    const el = ev.target;
    const moduleName = el.dataset.module;
    const autoStart = el.checked ? 1 : 0;

    try {
        const resp = await fetch('/api/modules/autoStart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `module=${encodeURIComponent(moduleName)}&autoStart=${autoStart}`
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const result = await resp.json().catch(() => ({}));
        // Optional: show a transient status
        showNotification && showNotification(`Module ${moduleName} autoStart set to ${autoStart}`, 'success');
    } catch (err) {
        console.error('Failed to set autoStart for', moduleName, err);
        showNotification && showNotification(`Failed to set autoStart: ${err.message}`, 'error');
        // revert checkbox
        el.checked = !el.checked;
    }
}

// Initialize when DOM ready
document.addEventListener('DOMContentLoaded', initModuleManagerUI);
