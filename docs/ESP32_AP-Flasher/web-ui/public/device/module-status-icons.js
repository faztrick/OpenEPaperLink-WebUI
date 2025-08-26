// module-status-icons.js
// Small widget to show modules availability and active status as compact icons

async function fetchModulesStatus() {
    try {
        const resp = await fetch('/api/modules');
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const json = await resp.json();
        return json.modules || [];
    } catch (e) {
        console.warn('Failed to fetch modules:', e);
        return [];
    }
}

function makeStatusDot(state) {
    const dot = document.createElement('span');
    dot.className = 'module-status-dot';
    dot.title = state.title || '';
    if (state.available && state.active) {
        dot.classList.add('module-active');
    } else if (state.available) {
        dot.classList.add('module-available');
    } else {
        dot.classList.add('module-missing');
    }
    return dot;
}

async function renderModuleIcons() {
    const container = document.querySelector('.header-right .compact-status');
    if (!container) return;

    // create holder if not present
    let holder = document.getElementById('moduleStatusIcons');
    if (!holder) {
        holder = document.createElement('div');
        holder.id = 'moduleStatusIcons';
        holder.style.display = 'flex';
        holder.style.gap = '6px';
        holder.style.marginLeft = '12px';
        holder.style.alignItems = 'center';
        container.appendChild(holder);
    }

    const modules = await fetchModulesStatus();
    holder.innerHTML = '';

    modules.forEach(m => {
        // Expect module object to have name, autoStart, running (or active/available)
        const state = {
            available: !!m.available || !!m.present || (m.running !== undefined),
            active: !!m.running || !!m.active || !!m.enabled || !!m.autoStart,
            title: `${m.name}${m.version ? ' v'+m.version : ''} - ${m.description || ''}`
        };
        const dot = makeStatusDot(state);
        holder.appendChild(dot);
    });
}

// refresh periodically
setInterval(renderModuleIcons, 5000);
// initial render
document.addEventListener('DOMContentLoaded', renderModuleIcons);
