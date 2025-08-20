// development.js
// Manage devices using NVS-style direct storage (no JSON serialization)

/*
  development.js - manage saved devices and selected device using NVS-style localStorage
  - Saved devices: individual keys per device property (e.g., 'oepl_devices_0_name', 'oepl_devices_0_ip')
  - Selected device: individual keys per property (e.g., 'oepl_selected_device_name', 'oepl_selected_device_ip')
  - Benefits: faster access, no JSON parsing overhead, more ESP32 NVS-like storage pattern
*/
(function () {
    const DEVICES_KEY = 'oepl_devices';
    const SELECTED_KEY = 'oepl_selected_device';

    function $id(id) { return document.getElementById(id); }

    // Device storage using NVS-style direct storage (no JSON)
    function loadDevices() {
        try {
            const devices = [];
            let index = 0;
            while (true) {
                const name = localStorage.getItem(`${DEVICES_KEY}_${index}_name`);
                if (!name) break;

                const device = {
                    id: localStorage.getItem(`${DEVICES_KEY}_${index}_id`) || `device_${index}_${Date.now()}`,
                    name: name,
                    ip: localStorage.getItem(`${DEVICES_KEY}_${index}_ip`) || '',
                    port: localStorage.getItem(`${DEVICES_KEY}_${index}_port`) || '',
                    description: localStorage.getItem(`${DEVICES_KEY}_${index}_description`) || ''
                };
                devices.push(device);
                index++;
            }
            return devices;
        } catch (e) {
            console.warn('Failed to load devices', e);
            return [];
        }
    }

    function saveDevices(list) {
        try {
            // Clear existing devices
            clearDeviceStorage();

            const clean = (list || []).filter(d => d && d.name && d.ip);
            clean.forEach((dev, idx) => {
                dev.id = dev.id || `device_${idx}_${Date.now()}`;
                localStorage.setItem(`${DEVICES_KEY}_${idx}_id`, dev.id);
                localStorage.setItem(`${DEVICES_KEY}_${idx}_name`, dev.name);
                localStorage.setItem(`${DEVICES_KEY}_${idx}_ip`, dev.ip);
                localStorage.setItem(`${DEVICES_KEY}_${idx}_port`, dev.port || '');
                localStorage.setItem(`${DEVICES_KEY}_${idx}_description`, dev.description || '');
            });
        } catch(e) {
            console.error('Failed to save devices:', e);
        }
    }

    function clearDeviceStorage() {
        // Remove all device entries
        let index = 0;
        while (localStorage.getItem(`${DEVICES_KEY}_${index}_name`)) {
            localStorage.removeItem(`${DEVICES_KEY}_${index}_id`);
            localStorage.removeItem(`${DEVICES_KEY}_${index}_name`);
            localStorage.removeItem(`${DEVICES_KEY}_${index}_ip`);
            localStorage.removeItem(`${DEVICES_KEY}_${index}_port`);
            localStorage.removeItem(`${DEVICES_KEY}_${index}_description`);
            index++;
        }
    }

    function loadSelected() {
        try {
            const name = localStorage.getItem(`${SELECTED_KEY}_name`);
            if (!name) return null;

            return {
                id: localStorage.getItem(`${SELECTED_KEY}_id`) || '',
                name: name,
                ip: localStorage.getItem(`${SELECTED_KEY}_ip`) || '',
                port: localStorage.getItem(`${SELECTED_KEY}_port`) || '',
                description: localStorage.getItem(`${SELECTED_KEY}_description`) || ''
            };
        }
        catch (e) { return null; }
    }

    function saveSelected(dev) {
        if (!dev) {
            localStorage.removeItem(`${SELECTED_KEY}_id`);
            localStorage.removeItem(`${SELECTED_KEY}_name`);
            localStorage.removeItem(`${SELECTED_KEY}_ip`);
            localStorage.removeItem(`${SELECTED_KEY}_port`);
            localStorage.removeItem(`${SELECTED_KEY}_description`);
        } else {
            localStorage.setItem(`${SELECTED_KEY}_id`, dev.id || '');
            localStorage.setItem(`${SELECTED_KEY}_name`, dev.name || '');
            localStorage.setItem(`${SELECTED_KEY}_ip`, dev.ip || '');
            localStorage.setItem(`${SELECTED_KEY}_port`, dev.port || '');
            localStorage.setItem(`${SELECTED_KEY}_description`, dev.description || '');
        }
        window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: dev }));
    }

    function renderSavedDevices() {
        const container = $id('saved-devices');
        if (!container) return;
        const list = loadDevices();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<div style="color:var(--muted)">No saved devices.</div>';
            return;
        }

        list.forEach((d, idx) => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.marginBottom = '8px';
            // attach data attributes so other UI code can find and highlight cards
            const ipVal = (d.ip || d.host || '').trim();
            if (ipVal) card.setAttribute('data-ip', ipVal);
            if (d.com) card.setAttribute('data-com', String(d.com));
            // Device status indicator
            let statusHtml = '<span class="status-dot status-offline" id="device-status-' + idx + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#cbd5e1;margin-right:6px"></span>';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        ${statusHtml}
                        <strong>${escapeHtml(d.name || d.label || 'Device')}</strong>
                        <div style="font-size:12px;color:#6b7280">${escapeHtml(ipVal)}${d.com? ' • ' + escapeHtml(d.com) : ''}</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" data-idx="${idx}" data-action="select">Select</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="edit">Edit</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="delete">Delete</button>
                    </div>
                </div>`;
            container.appendChild(card);
        });

        // Ensure the selection/highlight UI updates after rendering
        try { if (window.updateDeviceCardSelectionUI) setTimeout(() => window.updateDeviceCardSelectionUI(), 20); } catch (_) {}
        // After rendering, fetch and update device status
        updateAllDeviceStatuses();
    }

    // Fetch and update status for all devices
    function updateAllDeviceStatuses() {
        const list = loadDevices();
        list.forEach((d, idx) => {
            let ip = d.ip || d.host;
            if (!ip) return;
            let url = ip.startsWith('http') ? ip : `http://${ip}`;
            fetch(url + '/api/features', { method: 'GET' })
                .then(r => r.json())
                .then(j => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (!statusDot) return;
                    if (j && j.mode) {
                        if (j.mode === 'AP') {
                            statusDot.style.background = '#2563eb'; // blue
                            statusDot.title = 'AP Mode';
                        } else if (j.mode === 'STA') {
                            statusDot.style.background = '#fbbf24'; // yellow
                            statusDot.title = 'STA Mode';
                        } else if (j.mode === 'USB' || j.mode === 'serial') {
                            statusDot.style.background = '#16a34a'; // green
                            statusDot.title = 'USB/Serial';
                        } else {
                            statusDot.style.background = '#cbd5e1';
                            statusDot.title = 'Unknown';
                        }
                    } else {
                        statusDot.style.background = '#cbd5e1';
                        statusDot.title = 'Offline/Unknown';
                    }
                })
                .catch(_ => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (statusDot) {
                        statusDot.style.background = '#ef4444'; // red
                        statusDot.title = 'Error/Offline';
                    }
                });
        });
    }

    function loadSelected() {
        try {
            const name = localStorage.getItem(`${SELECTED_KEY}_name`);
            if (!name) return null;

            return {
                id: localStorage.getItem(`${SELECTED_KEY}_id`) || '',
                name: name,
                ip: localStorage.getItem(`${SELECTED_KEY}_ip`) || '',
                port: localStorage.getItem(`${SELECTED_KEY}_port`) || '',
                description: localStorage.getItem(`${SELECTED_KEY}_description`) || ''
            };
        }
        catch (e) { return null; }
    }

    function saveSelected(dev) {
        if (!dev) {
            localStorage.removeItem(`${SELECTED_KEY}_id`);
            localStorage.removeItem(`${SELECTED_KEY}_name`);
            localStorage.removeItem(`${SELECTED_KEY}_ip`);
            localStorage.removeItem(`${SELECTED_KEY}_port`);
            localStorage.removeItem(`${SELECTED_KEY}_description`);
        } else {
            localStorage.setItem(`${SELECTED_KEY}_id`, dev.id || '');
            localStorage.setItem(`${SELECTED_KEY}_name`, dev.name || '');
            localStorage.setItem(`${SELECTED_KEY}_ip`, dev.ip || '');
            localStorage.setItem(`${SELECTED_KEY}_port`, dev.port || '');
            localStorage.setItem(`${SELECTED_KEY}_description`, dev.description || '');
        }
        window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: dev }));
    }

    function renderSavedDevices() {
        const container = $id('saved-devices');
        if (!container) return;
        const list = loadDevices();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<div style="color:var(--muted)">No saved devices.</div>';
            return;
        }

        list.forEach((d, idx) => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.marginBottom = '8px';
            // attach data attributes so other UI code can find and highlight cards
            const ipVal = (d.ip || d.host || '').trim();
            if (ipVal) card.setAttribute('data-ip', ipVal);
            if (d.com) card.setAttribute('data-com', String(d.com));
            // Device status indicator
            let statusHtml = '<span class="status-dot status-offline" id="device-status-' + idx + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#cbd5e1;margin-right:6px"></span>';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        ${statusHtml}
                        <strong>${escapeHtml(d.name || d.label || 'Device')}</strong>
                        <div style="font-size:12px;color:#6b7280">${escapeHtml(ipVal)}${d.com? ' • ' + escapeHtml(d.com) : ''}</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" data-idx="${idx}" data-action="select">Select</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="edit">Edit</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="delete">Delete</button>
                    </div>
                </div>`;
            container.appendChild(card);
        });

        // Ensure the selection/highlight UI updates after rendering
        try { if (window.updateDeviceCardSelectionUI) setTimeout(() => window.updateDeviceCardSelectionUI(), 20); } catch (_) {}
        // After rendering, fetch and update device status
        updateAllDeviceStatuses();
    }

    // Fetch and update status for all devices
    function updateAllDeviceStatuses() {
        const list = loadDevices();
        list.forEach((d, idx) => {
            let ip = d.ip || d.host;
            if (!ip) return;
            let url = ip.startsWith('http') ? ip : `http://${ip}`;
            fetch(url + '/api/features', { method: 'GET' })
                .then(r => r.json())
                .then(j => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (!statusDot) return;
                    if (j && j.mode) {
                        if (j.mode === 'AP') {
                            statusDot.style.background = '#2563eb'; // blue
                            statusDot.title = 'AP Mode';
                        } else if (j.mode === 'STA') {
                            statusDot.style.background = '#fbbf24'; // yellow
                            statusDot.title = 'STA Mode';
                        } else if (j.mode === 'USB' || j.mode === 'serial') {
                            statusDot.style.background = '#16a34a'; // green
                            statusDot.title = 'USB/Serial';
                        } else {
                            statusDot.style.background = '#cbd5e1';
                            statusDot.title = 'Unknown';
                        }
                    } else {
                        statusDot.style.background = '#cbd5e1';
                        statusDot.title = 'Offline/Unknown';
                    }
                })
                .catch(_ => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (statusDot) {
                        statusDot.style.background = '#ef4444'; // red
                        statusDot.title = 'Error/Offline';
                    }
                });
        });
    }

    function loadSelected() {
        try {
            const name = localStorage.getItem(`${SELECTED_KEY}_name`);
            if (!name) return null;

            return {
                id: localStorage.getItem(`${SELECTED_KEY}_id`) || '',
                name: name,
                ip: localStorage.getItem(`${SELECTED_KEY}_ip`) || '',
                port: localStorage.getItem(`${SELECTED_KEY}_port`) || '',
                description: localStorage.getItem(`${SELECTED_KEY}_description`) || ''
            };
        }
        catch (e) { return null; }
    }

    function saveSelected(dev) {
        if (!dev) {
            localStorage.removeItem(`${SELECTED_KEY}_id`);
            localStorage.removeItem(`${SELECTED_KEY}_name`);
            localStorage.removeItem(`${SELECTED_KEY}_ip`);
            localStorage.removeItem(`${SELECTED_KEY}_port`);
            localStorage.removeItem(`${SELECTED_KEY}_description`);
        } else {
            localStorage.setItem(`${SELECTED_KEY}_id`, dev.id || '');
            localStorage.setItem(`${SELECTED_KEY}_name`, dev.name || '');
            localStorage.setItem(`${SELECTED_KEY}_ip`, dev.ip || '');
            localStorage.setItem(`${SELECTED_KEY}_port`, dev.port || '');
            localStorage.setItem(`${SELECTED_KEY}_description`, dev.description || '');
        }
        window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: dev }));
    }

    function renderSavedDevices() {
        const container = $id('saved-devices');
        if (!container) return;
        const list = loadDevices();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<div style="color:var(--muted)">No saved devices.</div>';
            return;
        }

        list.forEach((d, idx) => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.marginBottom = '8px';
            // attach data attributes so other UI code can find and highlight cards
            const ipVal = (d.ip || d.host || '').trim();
            if (ipVal) card.setAttribute('data-ip', ipVal);
            if (d.com) card.setAttribute('data-com', String(d.com));
            // Device status indicator
            let statusHtml = '<span class="status-dot status-offline" id="device-status-' + idx + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#cbd5e1;margin-right:6px"></span>';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        ${statusHtml}
                        <strong>${escapeHtml(d.name || d.label || 'Device')}</strong>
                        <div style="font-size:12px;color:#6b7280">${escapeHtml(ipVal)}${d.com? ' • ' + escapeHtml(d.com) : ''}</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" data-idx="${idx}" data-action="select">Select</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="edit">Edit</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="delete">Delete</button>
                    </div>
                </div>`;
            container.appendChild(card);
        });

        // Ensure the selection/highlight UI updates after rendering
        try { if (window.updateDeviceCardSelectionUI) setTimeout(() => window.updateDeviceCardSelectionUI(), 20); } catch (_) {}
        // After rendering, fetch and update device status
        updateAllDeviceStatuses();
    }

    // Fetch and update status for all devices
    function updateAllDeviceStatuses() {
        const list = loadDevices();
        list.forEach((d, idx) => {
            let ip = d.ip || d.host;
            if (!ip) return;
            let url = ip.startsWith('http') ? ip : `http://${ip}`;
            fetch(url + '/api/features', { method: 'GET' })
                .then(r => r.json())
                .then(j => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (!statusDot) return;
                    if (j && j.mode) {
                        if (j.mode === 'AP') {
                            statusDot.style.background = '#2563eb'; // blue
                            statusDot.title = 'AP Mode';
                        } else if (j.mode === 'STA') {
                            statusDot.style.background = '#fbbf24'; // yellow
                            statusDot.title = 'STA Mode';
                        } else if (j.mode === 'USB' || j.mode === 'serial') {
                            statusDot.style.background = '#16a34a'; // green
                            statusDot.title = 'USB/Serial';
                        } else {
                            statusDot.style.background = '#cbd5e1';
                            statusDot.title = 'Unknown';
                        }
                    } else {
                        statusDot.style.background = '#cbd5e1';
                        statusDot.title = 'Offline/Unknown';
                    }
                })
                .catch(_ => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (statusDot) {
                        statusDot.style.background = '#ef4444'; // red
                        statusDot.title = 'Error/Offline';
                    }
                });
        });
    }

    function loadSelected() {
        try {
            const name = localStorage.getItem(`${SELECTED_KEY}_name`);
            if (!name) return null;

            return {
                id: localStorage.getItem(`${SELECTED_KEY}_id`) || '',
                name: name,
                ip: localStorage.getItem(`${SELECTED_KEY}_ip`) || '',
                port: localStorage.getItem(`${SELECTED_KEY}_port`) || '',
                description: localStorage.getItem(`${SELECTED_KEY}_description`) || ''
            };
        }
        catch (e) { return null; }
    }

    function saveSelected(dev) {
        if (!dev) {
            localStorage.removeItem(`${SELECTED_KEY}_id`);
            localStorage.removeItem(`${SELECTED_KEY}_name`);
            localStorage.removeItem(`${SELECTED_KEY}_ip`);
            localStorage.removeItem(`${SELECTED_KEY}_port`);
            localStorage.removeItem(`${SELECTED_KEY}_description`);
        } else {
            localStorage.setItem(`${SELECTED_KEY}_id`, dev.id || '');
            localStorage.setItem(`${SELECTED_KEY}_name`, dev.name || '');
            localStorage.setItem(`${SELECTED_KEY}_ip`, dev.ip || '');
            localStorage.setItem(`${SELECTED_KEY}_port`, dev.port || '');
            localStorage.setItem(`${SELECTED_KEY}_description`, dev.description || '');
        }
        window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: dev }));
    }

    function renderSavedDevices() {
        const container = $id('saved-devices');
        if (!container) return;
        const list = loadDevices();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<div style="color:var(--muted)">No saved devices.</div>';
            return;
        }

        list.forEach((d, idx) => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.marginBottom = '8px';
            // attach data attributes so other UI code can find and highlight cards
            const ipVal = (d.ip || d.host || '').trim();
            if (ipVal) card.setAttribute('data-ip', ipVal);
            if (d.com) card.setAttribute('data-com', String(d.com));
            // Device status indicator
            let statusHtml = '<span class="status-dot status-offline" id="device-status-' + idx + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#cbd5e1;margin-right:6px"></span>';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        ${statusHtml}
                        <strong>${escapeHtml(d.name || d.label || 'Device')}</strong>
                        <div style="font-size:12px;color:#6b7280">${escapeHtml(ipVal)}${d.com? ' • ' + escapeHtml(d.com) : ''}</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" data-idx="${idx}" data-action="select">Select</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="edit">Edit</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="delete">Delete</button>
                    </div>
                </div>`;
            container.appendChild(card);
        });

        // Ensure the selection/highlight UI updates after rendering
        try { if (window.updateDeviceCardSelectionUI) setTimeout(() => window.updateDeviceCardSelectionUI(), 20); } catch (_) {}
        // After rendering, fetch and update device status
        updateAllDeviceStatuses();
    }

    // Fetch and update status for all devices
    function updateAllDeviceStatuses() {
        const list = loadDevices();
        list.forEach((d, idx) => {
            let ip = d.ip || d.host;
            if (!ip) return;
            let url = ip.startsWith('http') ? ip : `http://${ip}`;
            fetch(url + '/api/features', { method: 'GET' })
                .then(r => r.json())
                .then(j => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (!statusDot) return;
                    if (j && j.mode) {
                        if (j.mode === 'AP') {
                            statusDot.style.background = '#2563eb'; // blue
                            statusDot.title = 'AP Mode';
                        } else if (j.mode === 'STA') {
                            statusDot.style.background = '#fbbf24'; // yellow
                            statusDot.title = 'STA Mode';
                        } else if (j.mode === 'USB' || j.mode === 'serial') {
                            statusDot.style.background = '#16a34a'; // green
                            statusDot.title = 'USB/Serial';
                        } else {
                            statusDot.style.background = '#cbd5e1';
                            statusDot.title = 'Unknown';
                        }
                    } else {
                        statusDot.style.background = '#cbd5e1';
                        statusDot.title = 'Offline/Unknown';
                    }
                })
                .catch(_ => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (statusDot) {
                        statusDot.style.background = '#ef4444'; // red
                        statusDot.title = 'Error/Offline';
                    }
                });
        });
    }

    function loadSelected() {
        try {
            const name = localStorage.getItem(`${SELECTED_KEY}_name`);
            if (!name) return null;

            return {
                id: localStorage.getItem(`${SELECTED_KEY}_id`) || '',
                name: name,
                ip: localStorage.getItem(`${SELECTED_KEY}_ip`) || '',
                port: localStorage.getItem(`${SELECTED_KEY}_port`) || '',
                description: localStorage.getItem(`${SELECTED_KEY}_description`) || ''
            };
        }
        catch (e) { return null; }
    }

    function saveSelected(dev) {
        if (!dev) {
            localStorage.removeItem(`${SELECTED_KEY}_id`);
            localStorage.removeItem(`${SELECTED_KEY}_name`);
            localStorage.removeItem(`${SELECTED_KEY}_ip`);
            localStorage.removeItem(`${SELECTED_KEY}_port`);
            localStorage.removeItem(`${SELECTED_KEY}_description`);
        } else {
            localStorage.setItem(`${SELECTED_KEY}_id`, dev.id || '');
            localStorage.setItem(`${SELECTED_KEY}_name`, dev.name || '');
            localStorage.setItem(`${SELECTED_KEY}_ip`, dev.ip || '');
            localStorage.setItem(`${SELECTED_KEY}_port`, dev.port || '');
            localStorage.setItem(`${SELECTED_KEY}_description`, dev.description || '');
        }
        window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: dev }));
    }

    function renderSavedDevices() {
        const container = $id('saved-devices');
        if (!container) return;
        const list = loadDevices();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<div style="color:var(--muted)">No saved devices.</div>';
            return;
        }

        list.forEach((d, idx) => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.marginBottom = '8px';
            // attach data attributes so other UI code can find and highlight cards
            const ipVal = (d.ip || d.host || '').trim();
            if (ipVal) card.setAttribute('data-ip', ipVal);
            if (d.com) card.setAttribute('data-com', String(d.com));
            // Device status indicator
            let statusHtml = '<span class="status-dot status-offline" id="device-status-' + idx + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#cbd5e1;margin-right:6px"></span>';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        ${statusHtml}
                        <strong>${escapeHtml(d.name || d.label || 'Device')}</strong>
                        <div style="font-size:12px;color:#6b7280">${escapeHtml(ipVal)}${d.com? ' • ' + escapeHtml(d.com) : ''}</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" data-idx="${idx}" data-action="select">Select</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="edit">Edit</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="delete">Delete</button>
                    </div>
                </div>`;
            container.appendChild(card);
        });

        // Ensure the selection/highlight UI updates after rendering
        try { if (window.updateDeviceCardSelectionUI) setTimeout(() => window.updateDeviceCardSelectionUI(), 20); } catch (_) {}
        // After rendering, fetch and update device status
        updateAllDeviceStatuses();
    }

    // Fetch and update status for all devices
    function updateAllDeviceStatuses() {
        const list = loadDevices();
        list.forEach((d, idx) => {
            let ip = d.ip || d.host;
            if (!ip) return;
            let url = ip.startsWith('http') ? ip : `http://${ip}`;
            fetch(url + '/api/features', { method: 'GET' })
                .then(r => r.json())
                .then(j => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (!statusDot) return;
                    if (j && j.mode) {
                        if (j.mode === 'AP') {
                            statusDot.style.background = '#2563eb'; // blue
                            statusDot.title = 'AP Mode';
                        } else if (j.mode === 'STA') {
                            statusDot.style.background = '#fbbf24'; // yellow
                            statusDot.title = 'STA Mode';
                        } else if (j.mode === 'USB' || j.mode === 'serial') {
                            statusDot.style.background = '#16a34a'; // green
                            statusDot.title = 'USB/Serial';
                        } else {
                            statusDot.style.background = '#cbd5e1';
                            statusDot.title = 'Unknown';
                        }
                    } else {
                        statusDot.style.background = '#cbd5e1';
                        statusDot.title = 'Offline/Unknown';
                    }
                })
                .catch(_ => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (statusDot) {
                        statusDot.style.background = '#ef4444'; // red
                        statusDot.title = 'Error/Offline';
                    }
                });
        });
    }

    function loadSelected() {
        try {
            const name = localStorage.getItem(`${SELECTED_KEY}_name`);
            if (!name) return null;

            return {
                id: localStorage.getItem(`${SELECTED_KEY}_id`) || '',
                name: name,
                ip: localStorage.getItem(`${SELECTED_KEY}_ip`) || '',
                port: localStorage.getItem(`${SELECTED_KEY}_port`) || '',
                description: localStorage.getItem(`${SELECTED_KEY}_description`) || ''
            };
        }
        catch (e) { return null; }
    }

    function saveSelected(dev) {
        if (!dev) {
            localStorage.removeItem(`${SELECTED_KEY}_id`);
            localStorage.removeItem(`${SELECTED_KEY}_name`);
            localStorage.removeItem(`${SELECTED_KEY}_ip`);
            localStorage.removeItem(`${SELECTED_KEY}_port`);
            localStorage.removeItem(`${SELECTED_KEY}_description`);
        } else {
            localStorage.setItem(`${SELECTED_KEY}_id`, dev.id || '');
            localStorage.setItem(`${SELECTED_KEY}_name`, dev.name || '');
            localStorage.setItem(`${SELECTED_KEY}_ip`, dev.ip || '');
            localStorage.setItem(`${SELECTED_KEY}_port`, dev.port || '');
            localStorage.setItem(`${SELECTED_KEY}_description`, dev.description || '');
        }
        window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: dev }));
    }

    function renderSavedDevices() {
        const container = $id('saved-devices');
        if (!container) return;
        const list = loadDevices();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<div style="color:var(--muted)">No saved devices.</div>';
            return;
        }

        list.forEach((d, idx) => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.marginBottom = '8px';
            // attach data attributes so other UI code can find and highlight cards
            const ipVal = (d.ip || d.host || '').trim();
            if (ipVal) card.setAttribute('data-ip', ipVal);
            if (d.com) card.setAttribute('data-com', String(d.com));
            // Device status indicator
            let statusHtml = '<span class="status-dot status-offline" id="device-status-' + idx + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#cbd5e1;margin-right:6px"></span>';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        ${statusHtml}
                        <strong>${escapeHtml(d.name || d.label || 'Device')}</strong>
                        <div style="font-size:12px;color:#6b7280">${escapeHtml(ipVal)}${d.com? ' • ' + escapeHtml(d.com) : ''}</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" data-idx="${idx}" data-action="select">Select</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="edit">Edit</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="delete">Delete</button>
                    </div>
                </div>`;
            container.appendChild(card);
        });

        // Ensure the selection/highlight UI updates after rendering
        try { if (window.updateDeviceCardSelectionUI) setTimeout(() => window.updateDeviceCardSelectionUI(), 20); } catch (_) {}
        // After rendering, fetch and update device status
        updateAllDeviceStatuses();
    }

    // Fetch and update status for all devices
    function updateAllDeviceStatuses() {
        const list = loadDevices();
        list.forEach((d, idx) => {
            let ip = d.ip || d.host;
            if (!ip) return;
            let url = ip.startsWith('http') ? ip : `http://${ip}`;
            fetch(url + '/api/features', { method: 'GET' })
                .then(r => r.json())
                .then(j => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (!statusDot) return;
                    if (j && j.mode) {
                        if (j.mode === 'AP') {
                            statusDot.style.background = '#2563eb'; // blue
                            statusDot.title = 'AP Mode';
                        } else if (j.mode === 'STA') {
                            statusDot.style.background = '#fbbf24'; // yellow
                            statusDot.title = 'STA Mode';
                        } else if (j.mode === 'USB' || j.mode === 'serial') {
                            statusDot.style.background = '#16a34a'; // green
                            statusDot.title = 'USB/Serial';
                        } else {
                            statusDot.style.background = '#cbd5e1';
                            statusDot.title = 'Unknown';
                        }
                    } else {
                        statusDot.style.background = '#cbd5e1';
                        statusDot.title = 'Offline/Unknown';
                    }
                })
                .catch(_ => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (statusDot) {
                        statusDot.style.background = '#ef4444'; // red
                        statusDot.title = 'Error/Offline';
                    }
                });
        });
    }

    function loadSelected() {
        try {
            const name = localStorage.getItem(`${SELECTED_KEY}_name`);
            if (!name) return null;

            return {
                id: localStorage.getItem(`${SELECTED_KEY}_id`) || '',
                name: name,
                ip: localStorage.getItem(`${SELECTED_KEY}_ip`) || '',
                port: localStorage.getItem(`${SELECTED_KEY}_port`) || '',
                description: localStorage.getItem(`${SELECTED_KEY}_description`) || ''
            };
        }
        catch (e) { return null; }
    }

    function saveSelected(dev) {
        if (!dev) {
            localStorage.removeItem(`${SELECTED_KEY}_id`);
            localStorage.removeItem(`${SELECTED_KEY}_name`);
            localStorage.removeItem(`${SELECTED_KEY}_ip`);
            localStorage.removeItem(`${SELECTED_KEY}_port`);
            localStorage.removeItem(`${SELECTED_KEY}_description`);
        } else {
            localStorage.setItem(`${SELECTED_KEY}_id`, dev.id || '');
            localStorage.setItem(`${SELECTED_KEY}_name`, dev.name || '');
            localStorage.setItem(`${SELECTED_KEY}_ip`, dev.ip || '');
            localStorage.setItem(`${SELECTED_KEY}_port`, dev.port || '');
            localStorage.setItem(`${SELECTED_KEY}_description`, dev.description || '');
        }
        window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: dev }));
    }

    function renderSavedDevices() {
        const container = $id('saved-devices');
        if (!container) return;
        const list = loadDevices();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<div style="color:var(--muted)">No saved devices.</div>';
            return;
        }

        list.forEach((d, idx) => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.marginBottom = '8px';
            // attach data attributes so other UI code can find and highlight cards
            const ipVal = (d.ip || d.host || '').trim();
            if (ipVal) card.setAttribute('data-ip', ipVal);
            if (d.com) card.setAttribute('data-com', String(d.com));
            // Device status indicator
            let statusHtml = '<span class="status-dot status-offline" id="device-status-' + idx + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#cbd5e1;margin-right:6px"></span>';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        ${statusHtml}
                        <strong>${escapeHtml(d.name || d.label || 'Device')}</strong>
                        <div style="font-size:12px;color:#6b7280">${escapeHtml(ipVal)}${d.com? ' • ' + escapeHtml(d.com) : ''}</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" data-idx="${idx}" data-action="select">Select</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="edit">Edit</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="delete">Delete</button>
                    </div>
                </div>`;
            container.appendChild(card);
        });

        // Ensure the selection/highlight UI updates after rendering
        try { if (window.updateDeviceCardSelectionUI) setTimeout(() => window.updateDeviceCardSelectionUI(), 20); } catch (_) {}
        // After rendering, fetch and update device status
        updateAllDeviceStatuses();
    }

    // Fetch and update status for all devices
    function updateAllDeviceStatuses() {
        const list = loadDevices();
        list.forEach((d, idx) => {
            let ip = d.ip || d.host;
            if (!ip) return;
            let url = ip.startsWith('http') ? ip : `http://${ip}`;
            fetch(url + '/api/features', { method: 'GET' })
                .then(r => r.json())
                .then(j => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (!statusDot) return;
                    if (j && j.mode) {
                        if (j.mode === 'AP') {
                            statusDot.style.background = '#2563eb'; // blue
                            statusDot.title = 'AP Mode';
                        } else if (j.mode === 'STA') {
                            statusDot.style.background = '#fbbf24'; // yellow
                            statusDot.title = 'STA Mode';
                        } else if (j.mode === 'USB' || j.mode === 'serial') {
                            statusDot.style.background = '#16a34a'; // green
                            statusDot.title = 'USB/Serial';
                        } else {
                            statusDot.style.background = '#cbd5e1';
                            statusDot.title = 'Unknown';
                        }
                    } else {
                        statusDot.style.background = '#cbd5e1';
                        statusDot.title = 'Offline/Unknown';
                    }
                })
                .catch(_ => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (statusDot) {
                        statusDot.style.background = '#ef4444'; // red
                        statusDot.title = 'Error/Offline';
                    }
                });
        });
    }

    function loadSelected() {
        try {
            const name = localStorage.getItem(`${SELECTED_KEY}_name`);
            if (!name) return null;

            return {
                id: localStorage.getItem(`${SELECTED_KEY}_id`) || '',
                name: name,
                ip: localStorage.getItem(`${SELECTED_KEY}_ip`) || '',
                port: localStorage.getItem(`${SELECTED_KEY}_port`) || '',
                description: localStorage.getItem(`${SELECTED_KEY}_description`) || ''
            };
        }
        catch (e) { return null; }
    }

    function saveSelected(dev) {
        if (!dev) {
            localStorage.removeItem(`${SELECTED_KEY}_id`);
            localStorage.removeItem(`${SELECTED_KEY}_name`);
            localStorage.removeItem(`${SELECTED_KEY}_ip`);
            localStorage.removeItem(`${SELECTED_KEY}_port`);
            localStorage.removeItem(`${SELECTED_KEY}_description`);
        } else {
            localStorage.setItem(`${SELECTED_KEY}_id`, dev.id || '');
            localStorage.setItem(`${SELECTED_KEY}_name`, dev.name || '');
            localStorage.setItem(`${SELECTED_KEY}_ip`, dev.ip || '');
            localStorage.setItem(`${SELECTED_KEY}_port`, dev.port || '');
            localStorage.setItem(`${SELECTED_KEY}_description`, dev.description || '');
        }
        window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: dev }));
    }

    function renderSavedDevices() {
        const container = $id('saved-devices');
        if (!container) return;
        const list = loadDevices();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<div style="color:var(--muted)">No saved devices.</div>';
            return;
        }

        list.forEach((d, idx) => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.marginBottom = '8px';
            // attach data attributes so other UI code can find and highlight cards
            const ipVal = (d.ip || d.host || '').trim();
            if (ipVal) card.setAttribute('data-ip', ipVal);
            if (d.com) card.setAttribute('data-com', String(d.com));
            // Device status indicator
            let statusHtml = '<span class="status-dot status-offline" id="device-status-' + idx + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#cbd5e1;margin-right:6px"></span>';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        ${statusHtml}
                        <strong>${escapeHtml(d.name || d.label || 'Device')}</strong>
                        <div style="font-size:12px;color:#6b7280">${escapeHtml(ipVal)}${d.com? ' • ' + escapeHtml(d.com) : ''}</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" data-idx="${idx}" data-action="select">Select</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="edit">Edit</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="delete">Delete</button>
                    </div>
                </div>`;
            container.appendChild(card);
        });

        // Ensure the selection/highlight UI updates after rendering
        try { if (window.updateDeviceCardSelectionUI) setTimeout(() => window.updateDeviceCardSelectionUI(), 20); } catch (_) {}
        // After rendering, fetch and update device status
        updateAllDeviceStatuses();
    }

    // Fetch and update status for all devices
    function updateAllDeviceStatuses() {
        const list = loadDevices();
        list.forEach((d, idx) => {
            let ip = d.ip || d.host;
            if (!ip) return;
            let url = ip.startsWith('http') ? ip : `http://${ip}`;
            fetch(url + '/api/features', { method: 'GET' })
                .then(r => r.json())
                .then(j => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (!statusDot) return;
                    if (j && j.mode) {
                        if (j.mode === 'AP') {
                            statusDot.style.background = '#2563eb'; // blue
                            statusDot.title = 'AP Mode';
                        } else if (j.mode === 'STA') {
                            statusDot.style.background = '#fbbf24'; // yellow
                            statusDot.title = 'STA Mode';
                        } else if (j.mode === 'USB' || j.mode === 'serial') {
                            statusDot.style.background = '#16a34a'; // green
                            statusDot.title = 'USB/Serial';
                        } else {
                            statusDot.style.background = '#cbd5e1';
                            statusDot.title = 'Unknown';
                        }
                    } else {
                        statusDot.style.background = '#cbd5e1';
                        statusDot.title = 'Offline/Unknown';
                    }
                })
                .catch(_ => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (statusDot) {
                        statusDot.style.background = '#ef4444'; // red
                        statusDot.title = 'Error/Offline';
                    }
                });
        });
    }

    function loadSelected() {
        try {
            const name = localStorage.getItem(`${SELECTED_KEY}_name`);
            if (!name) return null;

            return {
                id: localStorage.getItem(`${SELECTED_KEY}_id`) || '',
                name: name,
                ip: localStorage.getItem(`${SELECTED_KEY}_ip`) || '',
                port: localStorage.getItem(`${SELECTED_KEY}_port`) || '',
                description: localStorage.getItem(`${SELECTED_KEY}_description`) || ''
            };
        }
        catch (e) { return null; }
    }

    function saveSelected(dev) {
        if (!dev) {
            localStorage.removeItem(`${SELECTED_KEY}_id`);
            localStorage.removeItem(`${SELECTED_KEY}_name`);
            localStorage.removeItem(`${SELECTED_KEY}_ip`);
            localStorage.removeItem(`${SELECTED_KEY}_port`);
            localStorage.removeItem(`${SELECTED_KEY}_description`);
        } else {
            localStorage.setItem(`${SELECTED_KEY}_id`, dev.id || '');
            localStorage.setItem(`${SELECTED_KEY}_name`, dev.name || '');
            localStorage.setItem(`${SELECTED_KEY}_ip`, dev.ip || '');
            localStorage.setItem(`${SELECTED_KEY}_port`, dev.port || '');
            localStorage.setItem(`${SELECTED_KEY}_description`, dev.description || '');
        }
        window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: dev }));
    }

    function renderSavedDevices() {
        const container = $id('saved-devices');
        if (!container) return;
        const list = loadDevices();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<div style="color:var(--muted)">No saved devices.</div>';
            return;
        }

        list.forEach((d, idx) => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.marginBottom = '8px';
            // attach data attributes so other UI code can find and highlight cards
            const ipVal = (d.ip || d.host || '').trim();
            if (ipVal) card.setAttribute('data-ip', ipVal);
            if (d.com) card.setAttribute('data-com', String(d.com));
            // Device status indicator
            let statusHtml = '<span class="status-dot status-offline" id="device-status-' + idx + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#cbd5e1;margin-right:6px"></span>';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        ${statusHtml}
                        <strong>${escapeHtml(d.name || d.label || 'Device')}</strong>
                        <div style="font-size:12px;color:#6b7280">${escapeHtml(ipVal)}${d.com? ' • ' + escapeHtml(d.com) : ''}</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" data-idx="${idx}" data-action="select">Select</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="edit">Edit</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="delete">Delete</button>
                    </div>
                </div>`;
            container.appendChild(card);
        });

        // Ensure the selection/highlight UI updates after rendering
        try { if (window.updateDeviceCardSelectionUI) setTimeout(() => window.updateDeviceCardSelectionUI(), 20); } catch (_) {}
        // After rendering, fetch and update device status
        updateAllDeviceStatuses();
    }

    // Fetch and update status for all devices
    function updateAllDeviceStatuses() {
        const list = loadDevices();
        list.forEach((d, idx) => {
            let ip = d.ip || d.host;
            if (!ip) return;
            let url = ip.startsWith('http') ? ip : `http://${ip}`;
            fetch(url + '/api/features', { method: 'GET' })
                .then(r => r.json())
                .then(j => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (!statusDot) return;
                    if (j && j.mode) {
                        if (j.mode === 'AP') {
                            statusDot.style.background = '#2563eb'; // blue
                            statusDot.title = 'AP Mode';
                        } else if (j.mode === 'STA') {
                            statusDot.style.background = '#fbbf24'; // yellow
                            statusDot.title = 'STA Mode';
                        } else if (j.mode === 'USB' || j.mode === 'serial') {
                            statusDot.style.background = '#16a34a'; // green
                            statusDot.title = 'USB/Serial';
                        } else {
                            statusDot.style.background = '#cbd5e1';
                            statusDot.title = 'Unknown';
                        }
                    } else {
                        statusDot.style.background = '#cbd5e1';
                        statusDot.title = 'Offline/Unknown';
                    }
                })
                .catch(_ => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (statusDot) {
                        statusDot.style.background = '#ef4444'; // red
                        statusDot.title = 'Error/Offline';
                    }
                });
        });
    }

    function loadSelected() {
        try {
            const name = localStorage.getItem(`${SELECTED_KEY}_name`);
            if (!name) return null;

            return {
                id: localStorage.getItem(`${SELECTED_KEY}_id`) || '',
                name: name,
                ip: localStorage.getItem(`${SELECTED_KEY}_ip`) || '',
                port: localStorage.getItem(`${SELECTED_KEY}_port`) || '',
                description: localStorage.getItem(`${SELECTED_KEY}_description`) || ''
            };
        }
        catch (e) { return null; }
    }

    function saveSelected(dev) {
        if (!dev) {
            localStorage.removeItem(`${SELECTED_KEY}_id`);
            localStorage.removeItem(`${SELECTED_KEY}_name`);
            localStorage.removeItem(`${SELECTED_KEY}_ip`);
            localStorage.removeItem(`${SELECTED_KEY}_port`);
            localStorage.removeItem(`${SELECTED_KEY}_description`);
        } else {
            localStorage.setItem(`${SELECTED_KEY}_id`, dev.id || '');
            localStorage.setItem(`${SELECTED_KEY}_name`, dev.name || '');
            localStorage.setItem(`${SELECTED_KEY}_ip`, dev.ip || '');
            localStorage.setItem(`${SELECTED_KEY}_port`, dev.port || '');
            localStorage.setItem(`${SELECTED_KEY}_description`, dev.description || '');
        }
        window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: dev }));
    }

    function renderSavedDevices() {
        const container = $id('saved-devices');
        if (!container) return;
        const list = loadDevices();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<div style="color:var(--muted)">No saved devices.</div>';
            return;
        }

        list.forEach((d, idx) => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.marginBottom = '8px';
            // attach data attributes so other UI code can find and highlight cards
            const ipVal = (d.ip || d.host || '').trim();
            if (ipVal) card.setAttribute('data-ip', ipVal);
            if (d.com) card.setAttribute('data-com', String(d.com));
            // Device status indicator
            let statusHtml = '<span class="status-dot status-offline" id="device-status-' + idx + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#cbd5e1;margin-right:6px"></span>';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        ${statusHtml}
                        <strong>${escapeHtml(d.name || d.label || 'Device')}</strong>
                        <div style="font-size:12px;color:#6b7280">${escapeHtml(ipVal)}${d.com? ' • ' + escapeHtml(d.com) : ''}</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" data-idx="${idx}" data-action="select">Select</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="edit">Edit</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="delete">Delete</button>
                    </div>
                </div>`;
            container.appendChild(card);
        });

        // Ensure the selection/highlight UI updates after rendering
        try { if (window.updateDeviceCardSelectionUI) setTimeout(() => window.updateDeviceCardSelectionUI(), 20); } catch (_) {}
        // After rendering, fetch and update device status
        updateAllDeviceStatuses();
    }

    // Fetch and update status for all devices
    function updateAllDeviceStatuses() {
        const list = loadDevices();
        list.forEach((d, idx) => {
            let ip = d.ip || d.host;
            if (!ip) return;
            let url = ip.startsWith('http') ? ip : `http://${ip}`;
            fetch(url + '/api/features', { method: 'GET' })
                .then(r => r.json())
                .then(j => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (!statusDot) return;
                    if (j && j.mode) {
                        if (j.mode === 'AP') {
                            statusDot.style.background = '#2563eb'; // blue
                            statusDot.title = 'AP Mode';
                        } else if (j.mode === 'STA') {
                            statusDot.style.background = '#fbbf24'; // yellow
                            statusDot.title = 'STA Mode';
                        } else if (j.mode === 'USB' || j.mode === 'serial') {
                            statusDot.style.background = '#16a34a'; // green
                            statusDot.title = 'USB/Serial';
                        } else {
                            statusDot.style.background = '#cbd5e1';
                            statusDot.title = 'Unknown';
                        }
                    } else {
                        statusDot.style.background = '#cbd5e1';
                        statusDot.title = 'Offline/Unknown';
                    }
                })
                .catch(_ => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (statusDot) {
                        statusDot.style.background = '#ef4444'; // red
                        statusDot.title = 'Error/Offline';
                    }
                });
        });
    }

    function loadSelected() {
        try {
            const name = localStorage.getItem(`${SELECTED_KEY}_name`);
            if (!name) return null;

            return {
                id: localStorage.getItem(`${SELECTED_KEY}_id`) || '',
                name: name,
                ip: localStorage.getItem(`${SELECTED_KEY}_ip`) || '',
                port: localStorage.getItem(`${SELECTED_KEY}_port`) || '',
                description: localStorage.getItem(`${SELECTED_KEY}_description`) || ''
            };
        }
        catch (e) { return null; }
    }

    function saveSelected(dev) {
        if (!dev) {
            localStorage.removeItem(`${SELECTED_KEY}_id`);
            localStorage.removeItem(`${SELECTED_KEY}_name`);
            localStorage.removeItem(`${SELECTED_KEY}_ip`);
            localStorage.removeItem(`${SELECTED_KEY}_port`);
            localStorage.removeItem(`${SELECTED_KEY}_description`);
        } else {
            localStorage.setItem(`${SELECTED_KEY}_id`, dev.id || '');
            localStorage.setItem(`${SELECTED_KEY}_name`, dev.name || '');
            localStorage.setItem(`${SELECTED_KEY}_ip`, dev.ip || '');
            localStorage.setItem(`${SELECTED_KEY}_port`, dev.port || '');
            localStorage.setItem(`${SELECTED_KEY}_description`, dev.description || '');
        }
        window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: dev }));
    }

    function renderSavedDevices() {
        const container = $id('saved-devices');
        if (!container) return;
        const list = loadDevices();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<div style="color:var(--muted)">No saved devices.</div>';
            return;
        }

        list.forEach((d, idx) => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.marginBottom = '8px';
            // attach data attributes so other UI code can find and highlight cards
            const ipVal = (d.ip || d.host || '').trim();
            if (ipVal) card.setAttribute('data-ip', ipVal);
            if (d.com) card.setAttribute('data-com', String(d.com));
            // Device status indicator
            let statusHtml = '<span class="status-dot status-offline" id="device-status-' + idx + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#cbd5e1;margin-right:6px"></span>';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        ${statusHtml}
                        <strong>${escapeHtml(d.name || d.label || 'Device')}</strong>
                        <div style="font-size:12px;color:#6b7280">${escapeHtml(ipVal)}${d.com? ' • ' + escapeHtml(d.com) : ''}</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" data-idx="${idx}" data-action="select">Select</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="edit">Edit</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="delete">Delete</button>
                    </div>
                </div>`;
            container.appendChild(card);
        });

        // Ensure the selection/highlight UI updates after rendering
        try { if (window.updateDeviceCardSelectionUI) setTimeout(() => window.updateDeviceCardSelectionUI(), 20); } catch (_) {}
        // After rendering, fetch and update device status
        updateAllDeviceStatuses();
    }

    // Fetch and update status for all devices
    function updateAllDeviceStatuses() {
        const list = loadDevices();
        list.forEach((d, idx) => {
            let ip = d.ip || d.host;
            if (!ip) return;
            let url = ip.startsWith('http') ? ip : `http://${ip}`;
            fetch(url + '/api/features', { method: 'GET' })
                .then(r => r.json())
                .then(j => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (!statusDot) return;
                    if (j && j.mode) {
                        if (j.mode === 'AP') {
                            statusDot.style.background = '#2563eb'; // blue
                            statusDot.title = 'AP Mode';
                        } else if (j.mode === 'STA') {
                            statusDot.style.background = '#fbbf24'; // yellow
                            statusDot.title = 'STA Mode';
                        } else if (j.mode === 'USB' || j.mode === 'serial') {
                            statusDot.style.background = '#16a34a'; // green
                            statusDot.title = 'USB/Serial';
                        } else {
                            statusDot.style.background = '#cbd5e1';
                            statusDot.title = 'Unknown';
                        }
                    } else {
                        statusDot.style.background = '#cbd5e1';
                        statusDot.title = 'Offline/Unknown';
                    }
                })
                .catch(_ => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (statusDot) {
                        statusDot.style.background = '#ef4444'; // red
                        statusDot.title = 'Error/Offline';
                    }
                });
        });
    }

    function loadSelected() {
        try {
            const name = localStorage.getItem(`${SELECTED_KEY}_name`);
            if (!name) return null;

            return {
                id: localStorage.getItem(`${SELECTED_KEY}_id`) || '',
                name: name,
                ip: localStorage.getItem(`${SELECTED_KEY}_ip`) || '',
                port: localStorage.getItem(`${SELECTED_KEY}_port`) || '',
                description: localStorage.getItem(`${SELECTED_KEY}_description`) || ''
            };
        }
        catch (e) { return null; }
    }

    function saveSelected(dev) {
        if (!dev) {
            localStorage.removeItem(`${SELECTED_KEY}_id`);
            localStorage.removeItem(`${SELECTED_KEY}_name`);
            localStorage.removeItem(`${SELECTED_KEY}_ip`);
            localStorage.removeItem(`${SELECTED_KEY}_port`);
            localStorage.removeItem(`${SELECTED_KEY}_description`);
        } else {
            localStorage.setItem(`${SELECTED_KEY}_id`, dev.id || '');
            localStorage.setItem(`${SELECTED_KEY}_name`, dev.name || '');
            localStorage.setItem(`${SELECTED_KEY}_ip`, dev.ip || '');
            localStorage.setItem(`${SELECTED_KEY}_port`, dev.port || '');
            localStorage.setItem(`${SELECTED_KEY}_description`, dev.description || '');
        }
        window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: dev }));
    }

    function renderSavedDevices() {
        const container = $id('saved-devices');
        if (!container) return;
        const list = loadDevices();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<div style="color:var(--muted)">No saved devices.</div>';
            return;
        }

        list.forEach((d, idx) => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.marginBottom = '8px';
            // attach data attributes so other UI code can find and highlight cards
            const ipVal = (d.ip || d.host || '').trim();
            if (ipVal) card.setAttribute('data-ip', ipVal);
            if (d.com) card.setAttribute('data-com', String(d.com));
            // Device status indicator
            let statusHtml = '<span class="status-dot status-offline" id="device-status-' + idx + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#cbd5e1;margin-right:6px"></span>';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        ${statusHtml}
                        <strong>${escapeHtml(d.name || d.label || 'Device')}</strong>
                        <div style="font-size:12px;color:#6b7280">${escapeHtml(ipVal)}${d.com? ' • ' + escapeHtml(d.com) : ''}</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" data-idx="${idx}" data-action="select">Select</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="edit">Edit</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="delete">Delete</button>
                    </div>
                </div>`;
            container.appendChild(card);
        });

        // Ensure the selection/highlight UI updates after rendering
        try { if (window.updateDeviceCardSelectionUI) setTimeout(() => window.updateDeviceCardSelectionUI(), 20); } catch (_) {}
        // After rendering, fetch and update device status
        updateAllDeviceStatuses();
    }

    // Fetch and update status for all devices
    function updateAllDeviceStatuses() {
        const list = loadDevices();
        list.forEach((d, idx) => {
            let ip = d.ip || d.host;
            if (!ip) return;
            let url = ip.startsWith('http') ? ip : `http://${ip}`;
            fetch(url + '/api/features', { method: 'GET' })
                .then(r => r.json())
                .then(j => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (!statusDot) return;
                    if (j && j.mode) {
                        if (j.mode === 'AP') {
                            statusDot.style.background = '#2563eb'; // blue
                            statusDot.title = 'AP Mode';
                        } else if (j.mode === 'STA') {
                            statusDot.style.background = '#fbbf24'; // yellow
                            statusDot.title = 'STA Mode';
                        } else if (j.mode === 'USB' || j.mode === 'serial') {
                            statusDot.style.background = '#16a34a'; // green
                            statusDot.title = 'USB/Serial';
                        } else {
                            statusDot.style.background = '#cbd5e1';
                            statusDot.title = 'Unknown';
                        }
                    } else {
                        statusDot.style.background = '#cbd5e1';
                        statusDot.title = 'Offline/Unknown';
                    }
                })
                .catch(_ => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (statusDot) {
                        statusDot.style.background = '#ef4444'; // red
                        statusDot.title = 'Error/Offline';
                    }
                });
        });
    }

    function loadSelected() {
        try {
            const name = localStorage.getItem(`${SELECTED_KEY}_name`);
            if (!name) return null;

            return {
                id: localStorage.getItem(`${SELECTED_KEY}_id`) || '',
                name: name,
                ip: localStorage.getItem(`${SELECTED_KEY}_ip`) || '',
                port: localStorage.getItem(`${SELECTED_KEY}_port`) || '',
                description: localStorage.getItem(`${SELECTED_KEY}_description`) || ''
            };
        }
        catch (e) { return null; }
    }

    function saveSelected(dev) {
        if (!dev) {
            localStorage.removeItem(`${SELECTED_KEY}_id`);
            localStorage.removeItem(`${SELECTED_KEY}_name`);
            localStorage.removeItem(`${SELECTED_KEY}_ip`);
            localStorage.removeItem(`${SELECTED_KEY}_port`);
            localStorage.removeItem(`${SELECTED_KEY}_description`);
        } else {
            localStorage.setItem(`${SELECTED_KEY}_id`, dev.id || '');
            localStorage.setItem(`${SELECTED_KEY}_name`, dev.name || '');
            localStorage.setItem(`${SELECTED_KEY}_ip`, dev.ip || '');
            localStorage.setItem(`${SELECTED_KEY}_port`, dev.port || '');
            localStorage.setItem(`${SELECTED_KEY}_description`, dev.description || '');
        }
        window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: dev }));
    }

    function renderSavedDevices() {
        const container = $id('saved-devices');
        if (!container) return;
        const list = loadDevices();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<div style="color:var(--muted)">No saved devices.</div>';
            return;
        }

        list.forEach((d, idx) => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.marginBottom = '8px';
            // attach data attributes so other UI code can find and highlight cards
            const ipVal = (d.ip || d.host || '').trim();
            if (ipVal) card.setAttribute('data-ip', ipVal);
            if (d.com) card.setAttribute('data-com', String(d.com));
            // Device status indicator
            let statusHtml = '<span class="status-dot status-offline" id="device-status-' + idx + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#cbd5e1;margin-right:6px"></span>';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        ${statusHtml}
                        <strong>${escapeHtml(d.name || d.label || 'Device')}</strong>
                        <div style="font-size:12px;color:#6b7280">${escapeHtml(ipVal)}${d.com? ' • ' + escapeHtml(d.com) : ''}</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" data-idx="${idx}" data-action="select">Select</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="edit">Edit</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="delete">Delete</button>
                    </div>
                </div>`;
            container.appendChild(card);
        });

        // Ensure the selection/highlight UI updates after rendering
        try { if (window.updateDeviceCardSelectionUI) setTimeout(() => window.updateDeviceCardSelectionUI(), 20); } catch (_) {}
        // After rendering, fetch and update device status
        updateAllDeviceStatuses();
    }

    // Fetch and update status for all devices
    function updateAllDeviceStatuses() {
        const list = loadDevices();
        list.forEach((d, idx) => {
            let ip = d.ip || d.host;
            if (!ip) return;
            let url = ip.startsWith('http') ? ip : `http://${ip}`;
            fetch(url + '/api/features', { method: 'GET' })
                .then(r => r.json())
                .then(j => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (!statusDot) return;
                    if (j && j.mode) {
                        if (j.mode === 'AP') {
                            statusDot.style.background = '#2563eb'; // blue
                            statusDot.title = 'AP Mode';
                        } else if (j.mode === 'STA') {
                            statusDot.style.background = '#fbbf24'; // yellow
                            statusDot.title = 'STA Mode';
                        } else if (j.mode === 'USB' || j.mode === 'serial') {
                            statusDot.style.background = '#16a34a'; // green
                            statusDot.title = 'USB/Serial';
                        } else {
                            statusDot.style.background = '#cbd5e1';
                            statusDot.title = 'Unknown';
                        }
                    } else {
                        statusDot.style.background = '#cbd5e1';
                        statusDot.title = 'Offline/Unknown';
                    }
                })
                .catch(_ => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (statusDot) {
                        statusDot.style.background = '#ef4444'; // red
                        statusDot.title = 'Error/Offline';
                    }
                });
        });
    }

    function loadSelected() {
        try {
            const name = localStorage.getItem(`${SELECTED_KEY}_name`);
            if (!name) return null;

            return {
                id: localStorage.getItem(`${SELECTED_KEY}_id`) || '',
                name: name,
                ip: localStorage.getItem(`${SELECTED_KEY}_ip`) || '',
                port: localStorage.getItem(`${SELECTED_KEY}_port`) || '',
                description: localStorage.getItem(`${SELECTED_KEY}_description`) || ''
            };
        }
        catch (e) { return null; }
    }

    function saveSelected(dev) {
        if (!dev) {
            localStorage.removeItem(`${SELECTED_KEY}_id`);
            localStorage.removeItem(`${SELECTED_KEY}_name`);
            localStorage.removeItem(`${SELECTED_KEY}_ip`);
            localStorage.removeItem(`${SELECTED_KEY}_port`);
            localStorage.removeItem(`${SELECTED_KEY}_description`);
        } else {
            localStorage.setItem(`${SELECTED_KEY}_id`, dev.id || '');
            localStorage.setItem(`${SELECTED_KEY}_name`, dev.name || '');
            localStorage.setItem(`${SELECTED_KEY}_ip`, dev.ip || '');
            localStorage.setItem(`${SELECTED_KEY}_port`, dev.port || '');
            localStorage.setItem(`${SELECTED_KEY}_description`, dev.description || '');
        }
        window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: dev }));
    }

    function renderSavedDevices() {
        const container = $id('saved-devices');
        if (!container) return;
        const list = loadDevices();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<div style="color:var(--muted)">No saved devices.</div>';
            return;
        }

        list.forEach((d, idx) => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.marginBottom = '8px';
                       // attach data attributes so other UI code can find and highlight cards
            const ipVal = (d.ip || d.host || '').trim();
            if (ipVal) card.setAttribute('data-ip', ipVal);
            if (d.com) card.setAttribute('data-com', String(d.com));
            // Device status indicator
            let statusHtml = '<span class="status-dot status-offline" id="device-status-' + idx + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#cbd5e1;margin-right:6px"></span>';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        ${statusHtml}
                        <strong>${escapeHtml(d.name || d.label || 'Device')}</strong>
                        <div style="font-size:12px;color:#6b7280">${escapeHtml(ipVal)}${d.com? ' • ' + escapeHtml(d.com) : ''}</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" data-idx="${idx}" data-action="select">Select</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="edit">Edit</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="delete">Delete</button>
                    </div>
                </div>`;
            container.appendChild(card);
        });

        // Ensure the selection/highlight UI updates after rendering
        try { if (window.updateDeviceCardSelectionUI) setTimeout(() => window.updateDeviceCardSelectionUI(), 20); } catch (_) {}
        // After rendering, fetch and update device status
        updateAllDeviceStatuses();
    }

    // Fetch and update status for all devices
    function updateAllDeviceStatuses() {
        const list = loadDevices();
        list.forEach((d, idx) => {
            let ip = d.ip || d.host;
            if (!ip) return;
            let url = ip.startsWith('http') ? ip : `http://${ip}`;
            fetch(url + '/api/features', { method: 'GET' })
                .then(r => r.json())
                .then(j => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (!statusDot) return;
                    if (j && j.mode) {
                        if (j.mode === 'AP') {
                            statusDot.style.background = '#2563eb'; // blue
                            statusDot.title = 'AP Mode';
                        } else if (j.mode === 'STA') {
                            statusDot.style.background = '#fbbf24'; // yellow
                            statusDot.title = 'STA Mode';
                        } else if (j.mode === 'USB' || j.mode === 'serial') {
                            statusDot.style.background = '#16a34a'; // green
                            statusDot.title = 'USB/Serial';
                        } else {
                            statusDot.style.background = '#cbd5e1';
                            statusDot.title = 'Unknown';
                        }
                    } else {
                        statusDot.style.background = '#cbd5e1';
                        statusDot.title = 'Offline/Unknown';
                    }
                })
                .catch(_ => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (statusDot) {
                        statusDot.style.background = '#ef4444'; // red
                        statusDot.title = 'Error/Offline';
                    }
                });
        });
    }

    function loadSelected() {
        try {
            const name = localStorage.getItem(`${SELECTED_KEY}_name`);
            if (!name) return null;

            return {
                id: localStorage.getItem(`${SELECTED_KEY}_id`) || '',
                name: name,
                ip: localStorage.getItem(`${SELECTED_KEY}_ip`) || '',
                port: localStorage.getItem(`${SELECTED_KEY}_port`) || '',
                description: localStorage.getItem(`${SELECTED_KEY}_description`) || ''
            };
        }
        catch (e) { return null; }
    }

    function saveSelected(dev) {
        if (!dev) {
            localStorage.removeItem(`${SELECTED_KEY}_id`);
            localStorage.removeItem(`${SELECTED_KEY}_name`);
            localStorage.removeItem(`${SELECTED_KEY}_ip`);
            localStorage.removeItem(`${SELECTED_KEY}_port`);
            localStorage.removeItem(`${SELECTED_KEY}_description`);
        } else {
            localStorage.setItem(`${SELECTED_KEY}_id`, dev.id || '');
            localStorage.setItem(`${SELECTED_KEY}_name`, dev.name || '');
            localStorage.setItem(`${SELECTED_KEY}_ip`, dev.ip || '');
            localStorage.setItem(`${SELECTED_KEY}_port`, dev.port || '');
            localStorage.setItem(`${SELECTED_KEY}_description`, dev.description || '');
        }
        window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: dev }));
    }

    function renderSavedDevices() {
        const container = $id('saved-devices');
        if (!container) return;
        const list = loadDevices();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<div style="color:var(--muted)">No saved devices.</div>';
            return;
        }

        list.forEach((d, idx) => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.marginBottom = '8px';
            // attach data attributes so other UI code can find and highlight cards
            const ipVal = (d.ip || d.host || '').trim();
            if (ipVal) card.setAttribute('data-ip', ipVal);
            if (d.com) card.setAttribute('data-com', String(d.com));
            // Device status indicator
            let statusHtml = '<span class="status-dot status-offline" id="device-status-' + idx + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#cbd5e1;margin-right:6px"></span>';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        ${statusHtml}
                        <strong>${escapeHtml(d.name || d.label || 'Device')}</strong>
                        <div style="font-size:12px;color:#6b7280">${escapeHtml(ipVal)}${d.com? ' • ' + escapeHtml(d.com) : ''}</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" data-idx="${idx}" data-action="select">Select</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="edit">Edit</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="delete">Delete</button>
                    </div>
                </div>`;
            container.appendChild(card);
        });

        // Ensure the selection/highlight UI updates after rendering
        try { if (window.updateDeviceCardSelectionUI) setTimeout(() => window.updateDeviceCardSelectionUI(), 20); } catch (_) {}
        // After rendering, fetch and update device status
        updateAllDeviceStatuses();
    }

    // Fetch and update status for all devices
    function updateAllDeviceStatuses() {
        const list = loadDevices();
        list.forEach((d, idx) => {
            let ip = d.ip || d.host;
            if (!ip) return;
            let url = ip.startsWith('http') ? ip : `http://${ip}`;
            fetch(url + '/api/features', { method: 'GET' })
                .then(r => r.json())
                .then(j => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (!statusDot) return;
                    if (j && j.mode) {
                        if (j.mode === 'AP') {
                            statusDot.style.background = '#2563eb'; // blue
                            statusDot.title = 'AP Mode';
                        } else if (j.mode === 'STA') {
                            statusDot.style.background = '#fbbf24'; // yellow
                            statusDot.title = 'STA Mode';
                        } else if (j.mode === 'USB' || j.mode === 'serial') {
                            statusDot.style.background = '#16a34a'; // green
                            statusDot.title = 'USB/Serial';
                        } else {
                            statusDot.style.background = '#cbd5e1';
                            statusDot.title = 'Unknown';
                        }
                    } else {
                        statusDot.style.background = '#cbd5e1';
                        statusDot.title = 'Offline/Unknown';
                    }
                })
                .catch(_ => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (statusDot) {
                        statusDot.style.background = '#ef4444'; // red
                        statusDot.title = 'Error/Offline';
                    }
                });
        });
    }

    function loadSelected() {
        try {
            const name = localStorage.getItem(`${SELECTED_KEY}_name`);
            if (!name) return null;

            return {
                id: localStorage.getItem(`${SELECTED_KEY}_id`) || '',
                name: name,
                ip: localStorage.getItem(`${SELECTED_KEY}_ip`) || '',
                port: localStorage.getItem(`${SELECTED_KEY}_port`) || '',
                description: localStorage.getItem(`${SELECTED_KEY}_description`) || ''
            };
        }
        catch (e) { return null; }
    }

    function saveSelected(dev) {
        if (!dev) {
            localStorage.removeItem(`${SELECTED_KEY}_id`);
            localStorage.removeItem(`${SELECTED_KEY}_name`);
            localStorage.removeItem(`${SELECTED_KEY}_ip`);
            localStorage.removeItem(`${SELECTED_KEY}_port`);
            localStorage.removeItem(`${SELECTED_KEY}_description`);
        } else {
            localStorage.setItem(`${SELECTED_KEY}_id`, dev.id || '');
            localStorage.setItem(`${SELECTED_KEY}_name`, dev.name || '');
            localStorage.setItem(`${SELECTED_KEY}_ip`, dev.ip || '');
            localStorage.setItem(`${SELECTED_KEY}_port`, dev.port || '');
            localStorage.setItem(`${SELECTED_KEY}_description`, dev.description || '');
        }
        window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: dev }));
    }

    function renderSavedDevices() {
        const container = $id('saved-devices');
        if (!container) return;
        const list = loadDevices();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<div style="color:var(--muted)">No saved devices.</div>';
            return;
        }

        list.forEach((d, idx) => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.marginBottom = '8px';
            // attach data attributes so other UI code can find and highlight cards
            const ipVal = (d.ip || d.host || '').trim();
            if (ipVal) card.setAttribute('data-ip', ipVal);
            if (d.com) card.setAttribute('data-com', String(d.com));
            // Device status indicator
            let statusHtml = '<span class="status-dot status-offline" id="device-status-' + idx + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#cbd5e1;margin-right:6px"></span>';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        ${statusHtml}
                        <strong>${escapeHtml(d.name || d.label || 'Device')}</strong>
                        <div style="font-size:12px;color:#6b7280">${escapeHtml(ipVal)}${d.com? ' • ' + escapeHtml(d.com) : ''}</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" data-idx="${idx}" data-action="select">Select</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="edit">Edit</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="delete">Delete</button>
                    </div>
                </div>`;
            container.appendChild(card);
        });

        // Ensure the selection/highlight UI updates after rendering
        try { if (window.updateDeviceCardSelectionUI) setTimeout(() => window.updateDeviceCardSelectionUI(), 20); } catch (_) {}
        // After rendering, fetch and update device status
        updateAllDeviceStatuses();
    }

    // Fetch and update status for all devices
    function updateAllDeviceStatuses() {
        const list = loadDevices();
        list.forEach((d, idx) => {
            let ip = d.ip || d.host;
            if (!ip) return;
            let url = ip.startsWith('http') ? ip : `http://${ip}`;
            fetch(url + '/api/features', { method: 'GET' })
                .then(r => r.json())
                .then(j => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (!statusDot) return;
                    if (j && j.mode) {
                        if (j.mode === 'AP') {
                            statusDot.style.background = '#2563eb'; // blue
                            statusDot.title = 'AP Mode';
                        } else if (j.mode === 'STA') {
                            statusDot.style.background = '#fbbf24'; // yellow
                            statusDot.title = 'STA Mode';
                        } else if (j.mode === 'USB' || j.mode === 'serial') {
                            statusDot.style.background = '#16a34a'; // green
                            statusDot.title = 'USB/Serial';
                        } else {
                            statusDot.style.background = '#cbd5e1';
                            statusDot.title = 'Unknown';
                        }
                    } else {
                        statusDot.style.background = '#cbd5e1';
                        statusDot.title = 'Offline/Unknown';
                    }
                })
                .catch(_ => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (statusDot) {
                        statusDot.style.background = '#ef4444'; // red
                        statusDot.title = 'Error/Offline';
                    }
                });
        });
    }

    function loadSelected() {
        try {
            const name = localStorage.getItem(`${SELECTED_KEY}_name`);
            if (!name) return null;

            return {
                id: localStorage.getItem(`${SELECTED_KEY}_id`) || '',
                name: name,
                ip: localStorage.getItem(`${SELECTED_KEY}_ip`) || '',
                port: localStorage.getItem(`${SELECTED_KEY}_port`) || '',
                description: localStorage.getItem(`${SELECTED_KEY}_description`) || ''
            };
        }
        catch (e) { return null; }
    }

    function saveSelected(dev) {
        if (!dev) {
            localStorage.removeItem(`${SELECTED_KEY}_id`);
            localStorage.removeItem(`${SELECTED_KEY}_name`);
            localStorage.removeItem(`${SELECTED_KEY}_ip`);
            localStorage.removeItem(`${SELECTED_KEY}_port`);
            localStorage.removeItem(`${SELECTED_KEY}_description`);
        } else {
            localStorage.setItem(`${SELECTED_KEY}_id`, dev.id || '');
            localStorage.setItem(`${SELECTED_KEY}_name`, dev.name || '');
            localStorage.setItem(`${SELECTED_KEY}_ip`, dev.ip || '');
            localStorage.setItem(`${SELECTED_KEY}_port`, dev.port || '');
            localStorage.setItem(`${SELECTED_KEY}_description`, dev.description || '');
        }
        window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: dev }));
    }

    function renderSavedDevices() {
        const container = $id('saved-devices');
        if (!container) return;
        const list = loadDevices();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<div style="color:var(--muted)">No saved devices.</div>';
            return;
        }

        list.forEach((d, idx) => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.marginBottom = '8px';
            // attach data attributes so other UI code can find and highlight cards
            const ipVal = (d.ip || d.host || '').trim();
            if (ipVal) card.setAttribute('data-ip', ipVal);
            if (d.com) card.setAttribute('data-com', String(d.com));
            // Device status indicator
            let statusHtml = '<span class="status-dot status-offline" id="device-status-' + idx + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#cbd5e1;margin-right:6px"></span>';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        ${statusHtml}
                        <strong>${escapeHtml(d.name || d.label || 'Device')}</strong>
                        <div style="font-size:12px;color:#6b7280">${escapeHtml(ipVal)}${d.com? ' • ' + escapeHtml(d.com) : ''}</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" data-idx="${idx}" data-action="select">Select</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="edit">Edit</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="delete">Delete</button>
                    </div>
                </div>`;
            container.appendChild(card);
        });

        // Ensure the selection/highlight UI updates after rendering
        try { if (window.updateDeviceCardSelectionUI) setTimeout(() => window.updateDeviceCardSelectionUI(), 20); } catch (_) {}
        // After rendering, fetch and update device status
        updateAllDeviceStatuses();
    }

    // Fetch and update status for all devices
    function updateAllDeviceStatuses() {
        const list = loadDevices();
        list.forEach((d, idx) => {
            let ip = d.ip || d.host;
            if (!ip) return;
            let url = ip.startsWith('http') ? ip : `http://${ip}`;
            fetch(url + '/api/features', { method: 'GET' })
                .then(r => r.json())
                .then(j => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (!statusDot) return;
                    if (j && j.mode) {
                        if (j.mode === 'AP') {
                            statusDot.style.background = '#2563eb'; // blue
                            statusDot.title = 'AP Mode';
                        } else if (j.mode === 'STA') {
                            statusDot.style.background = '#fbbf24'; // yellow
                            statusDot.title = 'STA Mode';
                        } else if (j.mode === 'USB' || j.mode === 'serial') {
                            statusDot.style.background = '#16a34a'; // green
                            statusDot.title = 'USB/Serial';
                        } else {
                            statusDot.style.background = '#cbd5e1';
                            statusDot.title = 'Unknown';
                        }
                    } else {
                        statusDot.style.background = '#cbd5e1';
                        statusDot.title = 'Offline/Unknown';
                    }
                })
                .catch(_ => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (statusDot) {
                        statusDot.style.background = '#ef4444'; // red
                        statusDot.title = 'Error/Offline';
                    }
                });
        });
    }

    function loadSelected() {
        try {
            const name = localStorage.getItem(`${SELECTED_KEY}_name`);
            if (!name) return null;

            return {
                id: localStorage.getItem(`${SELECTED_KEY}_id`) || '',
                name: name,
                ip: localStorage.getItem(`${SELECTED_KEY}_ip`) || '',
                port: localStorage.getItem(`${SELECTED_KEY}_port`) || '',
                description: localStorage.getItem(`${SELECTED_KEY}_description`) || ''
            };
        }
        catch (e) { return null; }
    }

    function saveSelected(dev) {
        if (!dev) {
            localStorage.removeItem(`${SELECTED_KEY}_id`);
            localStorage.removeItem(`${SELECTED_KEY}_name`);
            localStorage.removeItem(`${SELECTED_KEY}_ip`);
            localStorage.removeItem(`${SELECTED_KEY}_port`);
            localStorage.removeItem(`${SELECTED_KEY}_description`);
        } else {
            localStorage.setItem(`${SELECTED_KEY}_id`, dev.id || '');
            localStorage.setItem(`${SELECTED_KEY}_name`, dev.name || '');
            localStorage.setItem(`${SELECTED_KEY}_ip`, dev.ip || '');
            localStorage.setItem(`${SELECTED_KEY}_port`, dev.port || '');
            localStorage.setItem(`${SELECTED_KEY}_description`, dev.description || '');
        }
        window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: dev }));
    }

    function renderSavedDevices() {
        const container = $id('saved-devices');
        if (!container) return;
        const list = loadDevices();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<div style="color:var(--muted)">No saved devices.</div>';
            return;
        }

        list.forEach((d, idx) => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.marginBottom = '8px';
            // attach data attributes so other UI code can find and highlight cards
            const ipVal = (d.ip || d.host || '').trim();
            if (ipVal) card.setAttribute('data-ip', ipVal);
            if (d.com) card.setAttribute('data-com', String(d.com));
            // Device status indicator
            let statusHtml = '<span class="status-dot status-offline" id="device-status-' + idx + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#cbd5e1;margin-right:6px"></span>';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        ${statusHtml}
                        <strong>${escapeHtml(d.name || d.label || 'Device')}</strong>
                        <div style="font-size:12px;color:#6b7280">${escapeHtml(ipVal)}${d.com? ' • ' + escapeHtml(d.com) : ''}</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" data-idx="${idx}" data-action="select">Select</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="edit">Edit</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="delete">Delete</button>
                    </div>
                </div>`;
            container.appendChild(card);
        });

        // Ensure the selection/highlight UI updates after rendering
        try { if (window.updateDeviceCardSelectionUI) setTimeout(() => window.updateDeviceCardSelectionUI(), 20); } catch (_) {}
        // After rendering, fetch and update device status
        updateAllDeviceStatuses();
    }

    // Fetch and update status for all devices
    function updateAllDeviceStatuses() {
        const list = loadDevices();
        list.forEach((d, idx) => {
            let ip = d.ip || d.host;
            if (!ip) return;
            let url = ip.startsWith('http') ? ip : `http://${ip}`;
            fetch(url + '/api/features', { method: 'GET' })
                .then(r => r.json())
                .then(j => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (!statusDot) return;
                    if (j && j.mode) {
                        if (j.mode === 'AP') {
                            statusDot.style.background = '#2563eb'; // blue
                            statusDot.title = 'AP Mode';
                        } else if (j.mode === 'STA') {
                            statusDot.style.background = '#fbbf24'; // yellow
                            statusDot.title = 'STA Mode';
                        } else if (j.mode === 'USB' || j.mode === 'serial') {
                            statusDot.style.background = '#16a34a'; // green
                            statusDot.title = 'USB/Serial';
                        } else {
                            statusDot.style.background = '#cbd5e1';
                            statusDot.title = 'Unknown';
                        }
                    } else {
                        statusDot.style.background = '#cbd5e1';
                        statusDot.title = 'Offline/Unknown';
                    }
                })
                .catch(_ => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (statusDot) {
                        statusDot.style.background = '#ef4444'; // red
                        statusDot.title = 'Error/Offline';
                    }
                });
        });
    }

    function loadSelected() {
        try {
            const name = localStorage.getItem(`${SELECTED_KEY}_name`);
            if (!name) return null;

            return {
                id: localStorage.getItem(`${SELECTED_KEY}_id`) || '',
                name: name,
                ip: localStorage.getItem(`${SELECTED_KEY}_ip`) || '',
                port: localStorage.getItem(`${SELECTED_KEY}_port`) || '',
                description: localStorage.getItem(`${SELECTED_KEY}_description`) || ''
            };
        }
        catch (e) { return null; }
    }

    function saveSelected(dev) {
        if (!dev) {
            localStorage.removeItem(`${SELECTED_KEY}_id`);
            localStorage.removeItem(`${SELECTED_KEY}_name`);
            localStorage.removeItem(`${SELECTED_KEY}_ip`);
            localStorage.removeItem(`${SELECTED_KEY}_port`);
            localStorage.removeItem(`${SELECTED_KEY}_description`);
        } else {
            localStorage.setItem(`${SELECTED_KEY}_id`, dev.id || '');
            localStorage.setItem(`${SELECTED_KEY}_name`, dev.name || '');
            localStorage.setItem(`${SELECTED_KEY}_ip`, dev.ip || '');
            localStorage.setItem(`${SELECTED_KEY}_port`, dev.port || '');
            localStorage.setItem(`${SELECTED_KEY}_description`, dev.description || '');
        }
        window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: dev }));
    }

    function renderSavedDevices() {
        const container = $id('saved-devices');
        if (!container) return;
        const list = loadDevices();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<div style="color:var(--muted)">No saved devices.</div>';
            return;
        }

        list.forEach((d, idx) => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.marginBottom = '8px';
            // attach data attributes so other UI code can find and highlight cards
            const ipVal = (d.ip || d.host || '').trim();
            if (ipVal) card.setAttribute('data-ip', ipVal);
            if (d.com) card.setAttribute('data-com', String(d.com));
            // Device status indicator
            let statusHtml = '<span class="status-dot status-offline" id="device-status-' + idx + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#cbd5e1;margin-right:6px"></span>';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        ${statusHtml}
                        <strong>${escapeHtml(d.name || d.label || 'Device')}</strong>
                        <div style="font-size:12px;color:#6b7280">${escapeHtml(ipVal)}${d.com? ' • ' + escapeHtml(d.com) : ''}</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" data-idx="${idx}" data-action="select">Select</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="edit">Edit</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="delete">Delete</button>
                    </div>
                </div>`;
            container.appendChild(card);
        });

        // Ensure the selection/highlight UI updates after rendering
        try { if (window.updateDeviceCardSelectionUI) setTimeout(() => window.updateDeviceCardSelectionUI(), 20); } catch (_) {}
        // After rendering, fetch and update device status
        updateAllDeviceStatuses();
    }

    // Fetch and update status for all devices
    function updateAllDeviceStatuses() {
        const list = loadDevices();
        list.forEach((d, idx) => {
            let ip = d.ip || d.host;
            if (!ip) return;
            let url = ip.startsWith('http') ? ip : `http://${ip}`;
            fetch(url + '/api/features', { method: 'GET' })
                .then(r => r.json())
                .then(j => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (!statusDot) return;
                    if (j && j.mode) {
                        if (j.mode === 'AP') {
                            statusDot.style.background = '#2563eb'; // blue
                            statusDot.title = 'AP Mode';
                        } else if (j.mode === 'STA') {
                            statusDot.style.background = '#fbbf24'; // yellow
                            statusDot.title = 'STA Mode';
                        } else if (j.mode === 'USB' || j.mode === 'serial') {
                            statusDot.style.background = '#16a34a'; // green
                            statusDot.title = 'USB/Serial';
                        } else {
                            statusDot.style.background = '#cbd5e1';
                            statusDot.title = 'Unknown';
                        }
                    } else {
                        statusDot.style.background = '#cbd5e1';
                        statusDot.title = 'Offline/Unknown';
                    }
                })
                .catch(_ => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (statusDot) {
                        statusDot.style.background = '#ef4444'; // red
                        statusDot.title = 'Error/Offline';
                    }
                });
        });
    }

    function loadSelected() {
        try {
            const name = localStorage.getItem(`${SELECTED_KEY}_name`);
            if (!name) return null;

            return {
                id: localStorage.getItem(`${SELECTED_KEY}_id`) || '',
                name: name,
                ip: localStorage.getItem(`${SELECTED_KEY}_ip`) || '',
                port: localStorage.getItem(`${SELECTED_KEY}_port`) || '',
                description: localStorage.getItem(`${SELECTED_KEY}_description`) || ''
            };
        }
        catch (e) { return null; }
    }

    function saveSelected(dev) {
        if (!dev) {
            localStorage.removeItem(`${SELECTED_KEY}_id`);
            localStorage.removeItem(`${SELECTED_KEY}_name`);
            localStorage.removeItem(`${SELECTED_KEY}_ip`);
            localStorage.removeItem(`${SELECTED_KEY}_port`);
            localStorage.removeItem(`${SELECTED_KEY}_description`);
        } else {
            localStorage.setItem(`${SELECTED_KEY}_id`, dev.id || '');
            localStorage.setItem(`${SELECTED_KEY}_name`, dev.name || '');
            localStorage.setItem(`${SELECTED_KEY}_ip`, dev.ip || '');
            localStorage.setItem(`${SELECTED_KEY}_port`, dev.port || '');
            localStorage.setItem(`${SELECTED_KEY}_description`, dev.description || '');
        }
        window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: dev }));
    }

    function renderSavedDevices() {
        const container = $id('saved-devices');
        if (!container) return;
        const list = loadDevices();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<div style="color:var(--muted)">No saved devices.</div>';
            return;
        }

        list.forEach((d, idx) => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.marginBottom = '8px';
            // attach data attributes so other UI code can find and highlight cards
            const ipVal = (d.ip || d.host || '').trim();
            if (ipVal) card.setAttribute('data-ip', ipVal);
            if (d.com) card.setAttribute('data-com', String(d.com));
            // Device status indicator
            let statusHtml = '<span class="status-dot status-offline" id="device-status-' + idx + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#cbd5e1;margin-right:6px"></span>';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        ${statusHtml}
                        <strong>${escapeHtml(d.name || d.label || 'Device')}</strong>
                        <div style="font-size:12px;color:#6b7280">${escapeHtml(ipVal)}${d.com? ' • ' + escapeHtml(d.com) : ''}</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" data-idx="${idx}" data-action="select">Select</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="edit">Edit</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="delete">Delete</button>
                    </div>
                </div>`;
            container.appendChild(card);
        });

        // Ensure the selection/highlight UI updates after rendering
        try { if (window.updateDeviceCardSelectionUI) setTimeout(() => window.updateDeviceCardSelectionUI(), 20); } catch (_) {}
        // After rendering, fetch and update device status
        updateAllDeviceStatuses();
    }

    // Fetch and update status for all devices
    function updateAllDeviceStatuses() {
        const list = loadDevices();
        list.forEach((d, idx) => {
            let ip = d.ip || d.host;
            if (!ip) return;
            let url = ip.startsWith('http') ? ip : `http://${ip}`;
            fetch(url + '/api/features', { method: 'GET' })
                .then(r => r.json())
                .then(j => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (!statusDot) return;
                    if (j && j.mode) {
                        if (j.mode === 'AP') {
                            statusDot.style.background = '#2563eb'; // blue
                            statusDot.title = 'AP Mode';
                        } else if (j.mode === 'STA') {
                            statusDot.style.background = '#fbbf24'; // yellow
                            statusDot.title = 'STA Mode';
                        } else if (j.mode === 'USB' || j.mode === 'serial') {
                            statusDot.style.background = '#16a34a'; // green
                            statusDot.title = 'USB/Serial';
                        } else {
                            statusDot.style.background = '#cbd5e1';
                            statusDot.title = 'Unknown';
                        }
                    } else {
                        statusDot.style.background = '#cbd5e1';
                        statusDot.title = 'Offline/Unknown';
                    }
                })
                .catch(_ => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (statusDot) {
                        statusDot.style.background = '#ef4444'; // red
                        statusDot.title = 'Error/Offline';
                    }
                });
        });
    }

    function loadSelected() {
        try {
            const name = localStorage.getItem(`${SELECTED_KEY}_name`);
            if (!name) return null;

            return {
                id: localStorage.getItem(`${SELECTED_KEY}_id`) || '',
                name: name,
                ip: localStorage.getItem(`${SELECTED_KEY}_ip`) || '',
                port: localStorage.getItem(`${SELECTED_KEY}_port`) || '',
                description: localStorage.getItem(`${SELECTED_KEY}_description`) || ''
            };
        }
        catch (e) { return null; }
    }

    function saveSelected(dev) {
        if (!dev) {
            localStorage.removeItem(`${SELECTED_KEY}_id`);
            localStorage.removeItem(`${SELECTED_KEY}_name`);
            localStorage.removeItem(`${SELECTED_KEY}_ip`);
            localStorage.removeItem(`${SELECTED_KEY}_port`);
            localStorage.removeItem(`${SELECTED_KEY}_description`);
        } else {
            localStorage.setItem(`${SELECTED_KEY}_id`, dev.id || '');
            localStorage.setItem(`${SELECTED_KEY}_name`, dev.name || '');
            localStorage.setItem(`${SELECTED_KEY}_ip`, dev.ip || '');
            localStorage.setItem(`${SELECTED_KEY}_port`, dev.port || '');
            localStorage.setItem(`${SELECTED_KEY}_description`, dev.description || '');
        }
        window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: dev }));
    }

    function renderSavedDevices() {
        const container = $id('saved-devices');
        if (!container) return;
        const list = loadDevices();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<div style="color:var(--muted)">No saved devices.</div>';
            return;
        }

        list.forEach((d, idx) => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.marginBottom = '8px';
            // attach data attributes so other UI code can find and highlight cards
            const ipVal = (d.ip || d.host || '').trim();
            if (ipVal) card.setAttribute('data-ip', ipVal);
            if (d.com) card.setAttribute('data-com', String(d.com));
            // Device status indicator
            let statusHtml = '<span class="status-dot status-offline" id="device-status-' + idx + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#cbd5e1;margin-right:6px"></span>';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        ${statusHtml}
                        <strong>${escapeHtml(d.name || d.label || 'Device')}</strong>
                        <div style="font-size:12px;color:#6b7280">${escapeHtml(ipVal)}${d.com? ' • ' + escapeHtml(d.com) : ''}</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" data-idx="${idx}" data-action="select">Select</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="edit">Edit</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="delete">Delete</button>
                    </div>
                </div>`;
            container.appendChild(card);
        });

        // Ensure the selection/highlight UI updates after rendering
        try { if (window.updateDeviceCardSelectionUI) setTimeout(() => window.updateDeviceCardSelectionUI(), 20); } catch (_) {}
        // After rendering, fetch and update device status
        updateAllDeviceStatuses();
    }

    // Fetch and update status for all devices
    function updateAllDeviceStatuses() {
        const list = loadDevices();
        list.forEach((d, idx) => {
            let ip = d.ip || d.host;
            if (!ip) return;
            let url = ip.startsWith('http') ? ip : `http://${ip}`;
            fetch(url + '/api/features', { method: 'GET' })
                .then(r => r.json())
                .then(j => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (!statusDot) return;
                    if (j && j.mode) {
                        if (j.mode === 'AP') {
                            statusDot.style.background = '#2563eb'; // blue
                            statusDot.title = 'AP Mode';
                        } else if (j.mode === 'STA') {
                            statusDot.style.background = '#fbbf24'; // yellow
                            statusDot.title = 'STA Mode';
                        } else if (j.mode === 'USB' || j.mode === 'serial') {
                            statusDot.style.background = '#16a34a'; // green
                            statusDot.title = 'USB/Serial';
                        } else {
                            statusDot.style.background = '#cbd5e1';
                            statusDot.title = 'Unknown';
                        }
                    } else {
                        statusDot.style.background = '#cbd5e1';
                        statusDot.title = 'Offline/Unknown';
                    }
                })
                .catch(_ => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (statusDot) {
                        statusDot.style.background = '#ef4444'; // red
                        statusDot.title = 'Error/Offline';
                    }
                });
        });
    }

    function loadSelected() {
        try {
            const name = localStorage.getItem(`${SELECTED_KEY}_name`);
            if (!name) return null;

            return {
                id: localStorage.getItem(`${SELECTED_KEY}_id`) || '',
                name: name,
                ip: localStorage.getItem(`${SELECTED_KEY}_ip`) || '',
                port: localStorage.getItem(`${SELECTED_KEY}_port`) || '',
                description: localStorage.getItem(`${SELECTED_KEY}_description`) || ''
            };
        }
        catch (e) { return null; }
    }

    function saveSelected(dev) {
        if (!dev) {
            localStorage.removeItem(`${SELECTED_KEY}_id`);
            localStorage.removeItem(`${SELECTED_KEY}_name`);
            localStorage.removeItem(`${SELECTED_KEY}_ip`);
            localStorage.removeItem(`${SELECTED_KEY}_port`);
            localStorage.removeItem(`${SELECTED_KEY}_description`);
        } else {
            localStorage.setItem(`${SELECTED_KEY}_id`, dev.id || '');
            localStorage.setItem(`${SELECTED_KEY}_name`, dev.name || '');
            localStorage.setItem(`${SELECTED_KEY}_ip`, dev.ip || '');
            localStorage.setItem(`${SELECTED_KEY}_port`, dev.port || '');
            localStorage.setItem(`${SELECTED_KEY}_description`, dev.description || '');
        }
        window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: dev }));
    }

    function renderSavedDevices() {
        const container = $id('saved-devices');
        if (!container) return;
        const list = loadDevices();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<div style="color:var(--muted)">No saved devices.</div>';
            return;
        }

        list.forEach((d, idx) => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.marginBottom = '8px';
            // attach data attributes so other UI code can find and highlight cards
            const ipVal = (d.ip || d.host || '').trim();
            if (ipVal) card.setAttribute('data-ip', ipVal);
            if (d.com) card.setAttribute('data-com', String(d.com));
            // Device status indicator
            let statusHtml = '<span class="status-dot status-offline" id="device-status-' + idx + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#cbd5e1;margin-right:6px"></span>';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        ${statusHtml}
                        <strong>${escapeHtml(d.name || d.label || 'Device')}</strong>
                        <div style="font-size:12px;color:#6b7280">${escapeHtml(ipVal)}${d.com? ' • ' + escapeHtml(d.com) : ''}</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" data-idx="${idx}" data-action="select">Select</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="edit">Edit</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="delete">Delete</button>
                    </div>
                </div>`;
            container.appendChild(card);
        });

        // Ensure the selection/highlight UI updates after rendering
        try { if (window.updateDeviceCardSelectionUI) setTimeout(() => window.updateDeviceCardSelectionUI(), 20); } catch (_) {}
        // After rendering, fetch and update device status
        updateAllDeviceStatuses();
    }

    // Fetch and update status for all devices
    function updateAllDeviceStatuses() {
        const list = loadDevices();
        list.forEach((d, idx) => {
            let ip = d.ip || d.host;
            if (!ip) return;
            let url = ip.startsWith('http') ? ip : `http://${ip}`;
            fetch(url + '/api/features', { method: 'GET' })
                .then(r => r.json())
                .then(j => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (!statusDot) return;
                    if (j && j.mode) {
                        if (j.mode === 'AP') {
                            statusDot.style.background = '#2563eb'; // blue
                            statusDot.title = 'AP Mode';
                        } else if (j.mode === 'STA') {
                            statusDot.style.background = '#fbbf24'; // yellow
                            statusDot.title = 'STA Mode';
                        } else if (j.mode === 'USB' || j.mode === 'serial') {
                            statusDot.style.background = '#16a34a'; // green
                            statusDot.title = 'USB/Serial';
                        } else {
                            statusDot.style.background = '#cbd5e1';
                            statusDot.title = 'Unknown';
                        }
                    } else {
                        statusDot.style.background = '#cbd5e1';
                        statusDot.title = 'Offline/Unknown';
                    }
                })
                .catch(_ => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (statusDot) {
                        statusDot.style.background = '#ef4444'; // red
                        statusDot.title = 'Error/Offline';
                    }
                });
        });
    }

    function loadSelected() {
        try {
            const name = localStorage.getItem(`${SELECTED_KEY}_name`);
            if (!name) return null;

            return {
                id: localStorage.getItem(`${SELECTED_KEY}_id`) || '',
                name: name,
                ip: localStorage.getItem(`${SELECTED_KEY}_ip`) || '',
                port: localStorage.getItem(`${SELECTED_KEY}_port`) || '',
                description: localStorage.getItem(`${SELECTED_KEY}_description`) || ''
            };
        }
        catch (e) { return null; }
    }

    function saveSelected(dev) {
        if (!dev) {
            localStorage.removeItem(`${SELECTED_KEY}_id`);
            localStorage.removeItem(`${SELECTED_KEY}_name`);
            localStorage.removeItem(`${SELECTED_KEY}_ip`);
            localStorage.removeItem(`${SELECTED_KEY}_port`);
            localStorage.removeItem(`${SELECTED_KEY}_description`);
        } else {
            localStorage.setItem(`${SELECTED_KEY}_id`, dev.id || '');
            localStorage.setItem(`${SELECTED_KEY}_name`, dev.name || '');
            localStorage.setItem(`${SELECTED_KEY}_ip`, dev.ip || '');
            localStorage.setItem(`${SELECTED_KEY}_port`, dev.port || '');
            localStorage.setItem(`${SELECTED_KEY}_description`, dev.description || '');
        }
        window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: dev }));
    }

    function renderSavedDevices() {
        const container = $id('saved-devices');
        if (!container) return;
        const list = loadDevices();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<div style="color:var(--muted)">No saved devices.</div>';
            return;
        }

        list.forEach((d, idx) => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.marginBottom = '8px';
            // attach data attributes so other UI code can find and highlight cards
            const ipVal = (d.ip || d.host || '').trim();
            if (ipVal) card.setAttribute('data-ip', ipVal);
            if (d.com) card.setAttribute('data-com', String(d.com));
            // Device status indicator
            let statusHtml = '<span class="status-dot status-offline" id="device-status-' + idx + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#cbd5e1;margin-right:6px"></span>';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        ${statusHtml}
                        <strong>${escapeHtml(d.name || d.label || 'Device')}</strong>
                        <div style="font-size:12px;color:#6b7280">${escapeHtml(ipVal)}${d.com? ' • ' + escapeHtml(d.com) : ''}</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" data-idx="${idx}" data-action="select">Select</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="edit">Edit</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="delete">Delete</button>
                    </div>
                </div>`;
            container.appendChild(card);
        });

        // Ensure the selection/highlight UI updates after rendering
        try { if (window.updateDeviceCardSelectionUI) setTimeout(() => window.updateDeviceCardSelectionUI(), 20); } catch (_) {}
        // After rendering, fetch and update device status
        updateAllDeviceStatuses();
    }

    // Fetch and update status for all devices
    function updateAllDeviceStatuses() {
        const list = loadDevices();
        list.forEach((d, idx) => {
            let ip = d.ip || d.host;
            if (!ip) return;
            let url = ip.startsWith('http') ? ip : `http://${ip}`;
            fetch(url + '/api/features', { method: 'GET' })
                .then(r => r.json())
                .then(j => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (!statusDot) return;
                    if (j && j.mode) {
                        if (j.mode === 'AP') {
                            statusDot.style.background = '#2563eb'; // blue
                            statusDot.title = 'AP Mode';
                        } else if (j.mode === 'STA') {
                            statusDot.style.background = '#fbbf24'; // yellow
                            statusDot.title = 'STA Mode';
                        } else if (j.mode === 'USB' || j.mode === 'serial') {
                            statusDot.style.background = '#16a34a'; // green
                            statusDot.title = 'USB/Serial';
                        } else {
                            statusDot.style.background = '#cbd5e1';
                            statusDot.title = 'Unknown';
                        }
                    } else {
                        statusDot.style.background = '#cbd5e1';
                        statusDot.title = 'Offline/Unknown';
                    }
                })
                .catch(_ => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (statusDot) {
                        statusDot.style.background = '#ef4444'; // red
                        statusDot.title = 'Error/Offline';
                    }
                });
        });
    }

    function loadSelected() {
        try {
            const name = localStorage.getItem(`${SELECTED_KEY}_name`);
            if (!name) return null;

            return {
                id: localStorage.getItem(`${SELECTED_KEY}_id`) || '',
                name: name,
                ip: localStorage.getItem(`${SELECTED_KEY}_ip`) || '',
                port: localStorage.getItem(`${SELECTED_KEY}_port`) || '',
                description: localStorage.getItem(`${SELECTED_KEY}_description`) || ''
            };
        }
        catch (e) { return null; }
    }

    function saveSelected(dev) {
        if (!dev) {
            localStorage.removeItem(`${SELECTED_KEY}_id`);
            localStorage.removeItem(`${SELECTED_KEY}_name`);
            localStorage.removeItem(`${SELECTED_KEY}_ip`);
            localStorage.removeItem(`${SELECTED_KEY}_port`);
            localStorage.removeItem(`${SELECTED_KEY}_description`);
        } else {
            localStorage.setItem(`${SELECTED_KEY}_id`, dev.id || '');
            localStorage.setItem(`${SELECTED_KEY}_name`, dev.name || '');
            localStorage.setItem(`${SELECTED_KEY}_ip`, dev.ip || '');
            localStorage.setItem(`${SELECTED_KEY}_port`, dev.port || '');
            localStorage.setItem(`${SELECTED_KEY}_description`, dev.description || '');
        }
        window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: dev }));
    }

    function renderSavedDevices() {
        const container = $id('saved-devices');
        if (!container) return;
        const list = loadDevices();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<div style="color:var(--muted)">No saved devices.</div>';
            return;
        }

        list.forEach((d, idx) => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.marginBottom = '8px';
            // attach data attributes so other UI code can find and highlight cards
            const ipVal = (d.ip || d.host || '').trim();
            if (ipVal) card.setAttribute('data-ip', ipVal);
            if (d.com) card.setAttribute('data-com', String(d.com));
            // Device status indicator
            let statusHtml = '<span class="status-dot status-offline" id="device-status-' + idx + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#cbd5e1;margin-right:6px"></span>';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        ${statusHtml}
                        <strong>${escapeHtml(d.name || d.label || 'Device')}</strong>
                        <div style="font-size:12px;color:#6b7280">${escapeHtml(ipVal)}${d.com? ' • ' + escapeHtml(d.com) : ''}</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" data-idx="${idx}" data-action="select">Select</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="edit">Edit</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="delete">Delete</button>
                    </div>
                </div>`;
            container.appendChild(card);
        });

        // Ensure the selection/highlight UI updates after rendering
        try { if (window.updateDeviceCardSelectionUI) setTimeout(() => window.updateDeviceCardSelectionUI(), 20); } catch (_) {}
        // After rendering, fetch and update device status
        updateAllDeviceStatuses();
    }

    // Fetch and update status for all devices
    function updateAllDeviceStatuses() {
        const list = loadDevices();
        list.forEach((d, idx) => {
            let ip = d.ip || d.host;
            if (!ip) return;
            let url = ip.startsWith('http') ? ip : `http://${ip}`;
            fetch(url + '/api/features', { method: 'GET' })
                .then(r => r.json())
                .then(j => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (!statusDot) return;
                    if (j && j.mode) {
                        if (j.mode === 'AP') {
                            statusDot.style.background = '#2563eb'; // blue
                            statusDot.title = 'AP Mode';
                        } else if (j.mode === 'STA') {
                            statusDot.style.background = '#fbbf24'; // yellow
                            statusDot.title = 'STA Mode';
                        } else if (j.mode === 'USB' || j.mode === 'serial') {
                            statusDot.style.background = '#16a34a'; // green
                            statusDot.title = 'USB/Serial';
                        } else {
                            statusDot.style.background = '#cbd5e1';
                            statusDot.title = 'Unknown';
                        }
                    } else {
                        statusDot.style.background = '#cbd5e1';
                        statusDot.title = 'Offline/Unknown';
                    }
                })
                .catch(_ => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (statusDot) {
                        statusDot.style.background = '#ef4444'; // red
                        statusDot.title = 'Error/Offline';
                    }
                });
        });
    }

    function loadSelected() {
        try {
            const name = localStorage.getItem(`${SELECTED_KEY}_name`);
            if (!name) return null;

            return {
                id: localStorage.getItem(`${SELECTED_KEY}_id`) || '',
                name: name,
                ip: localStorage.getItem(`${SELECTED_KEY}_ip`) || '',
                port: localStorage.getItem(`${SELECTED_KEY}_port`) || '',
                description: localStorage.getItem(`${SELECTED_KEY}_description`) || ''
            };
        }
        catch (e) { return null; }
    }

    function saveSelected(dev) {
        if (!dev) {
            localStorage.removeItem(`${SELECTED_KEY}_id`);
            localStorage.removeItem(`${SELECTED_KEY}_name`);
            localStorage.removeItem(`${SELECTED_KEY}_ip`);
            localStorage.removeItem(`${SELECTED_KEY}_port`);
            localStorage.removeItem(`${SELECTED_KEY}_description`);
        } else {
            localStorage.setItem(`${SELECTED_KEY}_id`, dev.id || '');
            localStorage.setItem(`${SELECTED_KEY}_name`, dev.name || '');
            localStorage.setItem(`${SELECTED_KEY}_ip`, dev.ip || '');
            localStorage.setItem(`${SELECTED_KEY}_port`, dev.port || '');
            localStorage.setItem(`${SELECTED_KEY}_description`, dev.description || '');
        }
        window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: dev }));
    }

    function renderSavedDevices() {
        const container = $id('saved-devices');
        if (!container) return;
        const list = loadDevices();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<div style="color:var(--muted)">No saved devices.</div>';
            return;
        }

        list.forEach((d, idx) => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.marginBottom = '8px';
            // attach data attributes so other UI code can find and highlight cards
            const ipVal = (d.ip || d.host || '').trim();
            if (ipVal) card.setAttribute('data-ip', ipVal);
            if (d.com) card.setAttribute('data-com', String(d.com));
            // Device status indicator
            let statusHtml = '<span class="status-dot status-offline" id="device-status-' + idx + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#cbd5e1;margin-right:6px"></span>';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        ${statusHtml}
                        <strong>${escapeHtml(d.name || d.label || 'Device')}</strong>
                        <div style="font-size:12px;color:#6b7280">${escapeHtml(ipVal)}${d.com? ' • ' + escapeHtml(d.com) : ''}</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" data-idx="${idx}" data-action="select">Select</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="edit">Edit</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="delete">Delete</button>
                    </div>
                </div>`;
            container.appendChild(card);
        });

        // Ensure the selection/highlight UI updates after rendering
        try { if (window.updateDeviceCardSelectionUI) setTimeout(() => window.updateDeviceCardSelectionUI(), 20); } catch (_) {}
        // After rendering, fetch and update device status
        updateAllDeviceStatuses();
    }

    // Fetch and update status for all devices
    function updateAllDeviceStatuses() {
        const list = loadDevices();
        list.forEach((d, idx) => {
            let ip = d.ip || d.host;
            if (!ip) return;
            let url = ip.startsWith('http') ? ip : `http://${ip}`;
            fetch(url + '/api/features', { method: 'GET' })
                .then(r => r.json())
                .then(j => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (!statusDot) return;
                    if (j && j.mode) {
                        if (j.mode === 'AP') {
                            statusDot.style.background = '#2563eb'; // blue
                            statusDot.title = 'AP Mode';
                        } else if (j.mode === 'STA') {
                            statusDot.style.background = '#fbbf24'; // yellow
                            statusDot.title = 'STA Mode';
                        } else if (j.mode === 'USB' || j.mode === 'serial') {
                            statusDot.style.background = '#16a34a'; // green
                            statusDot.title = 'USB/Serial';
                        } else {
                            statusDot.style.background = '#cbd5e1';
                            statusDot.title = 'Unknown';
                        }
                    } else {
                        statusDot.style.background = '#cbd5e1';
                        statusDot.title = 'Offline/Unknown';
                    }
                })
                .catch(_ => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (statusDot) {
                        statusDot.style.background = '#ef4444'; // red
                        statusDot.title = 'Error/Offline';
                    }
                });
        });
    }

    function loadSelected() {
        try {
            const name = localStorage.getItem(`${SELECTED_KEY}_name`);
            if (!name) return null;

            return {
                id: localStorage.getItem(`${SELECTED_KEY}_id`) || '',
                name: name,
                ip: localStorage.getItem(`${SELECTED_KEY}_ip`) || '',
                port: localStorage.getItem(`${SELECTED_KEY}_port`) || '',
                description: localStorage.getItem(`${SELECTED_KEY}_description`) || ''
            };
        }
        catch (e) { return null; }
    }

    function saveSelected(dev) {
        if (!dev) {
            localStorage.removeItem(`${SELECTED_KEY}_id`);
            localStorage.removeItem(`${SELECTED_KEY}_name`);
            localStorage.removeItem(`${SELECTED_KEY}_ip`);
            localStorage.removeItem(`${SELECTED_KEY}_port`);
            localStorage.removeItem(`${SELECTED_KEY}_description`);
        } else {
            localStorage.setItem(`${SELECTED_KEY}_id`, dev.id || '');
            localStorage.setItem(`${SELECTED_KEY}_name`, dev.name || '');
            localStorage.setItem(`${SELECTED_KEY}_ip`, dev.ip || '');
            localStorage.setItem(`${SELECTED_KEY}_port`, dev.port || '');
            localStorage.setItem(`${SELECTED_KEY}_description`, dev.description || '');
        }
        window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: dev }));
    }

    function renderSavedDevices() {
        const container = $id('saved-devices');
        if (!container) return;
        const list = loadDevices();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<div style="color:var(--muted)">No saved devices.</div>';
            return;
        }

        list.forEach((d, idx) => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.marginBottom = '8px';
            // attach data attributes so other UI code can find and highlight cards
            const ipVal = (d.ip || d.host || '').trim();
            if (ipVal) card.setAttribute('data-ip', ipVal);
            if (d.com) card.setAttribute('data-com', String(d.com));
            // Device status indicator
            let statusHtml = '<span class="status-dot status-offline" id="device-status-' + idx + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#cbd5e1;margin-right:6px"></span>';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        ${statusHtml}
                        <strong>${escapeHtml(d.name || d.label || 'Device')}</strong>
                        <div style="font-size:12px;color:#6b7280">${escapeHtml(ipVal)}${d.com? ' • ' + escapeHtml(d.com) : ''}</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" data-idx="${idx}" data-action="select">Select</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="edit">Edit</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="delete">Delete</button>
                    </div>
                </div>`;
            container.appendChild(card);
        });

        // Ensure the selection/highlight UI updates after rendering
        try { if (window.updateDeviceCardSelectionUI) setTimeout(() => window.updateDeviceCardSelectionUI(), 20); } catch (_) {}
        // After rendering, fetch and update device status
        updateAllDeviceStatuses();
    }

    // Fetch and update status for all devices
    function updateAllDeviceStatuses() {
        const list = loadDevices();
        list.forEach((d, idx) => {
            let ip = d.ip || d.host;
            if (!ip) return;
            let url = ip.startsWith('http') ? ip : `http://${ip}`;
            fetch(url + '/api/features', { method: 'GET' })
                .then(r => r.json())
                .then(j => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (!statusDot) return;
                    if (j && j.mode) {
                        if (j.mode === 'AP') {
                            statusDot.style.background = '#2563eb'; // blue
                            statusDot.title = 'AP Mode';
                        } else if (j.mode === 'STA') {
                            statusDot.style.background = '#fbbf24'; // yellow
                            statusDot.title = 'STA Mode';
                        } else if (j.mode === 'USB' || j.mode === 'serial') {
                            statusDot.style.background = '#16a34a'; // green
                            statusDot.title = 'USB/Serial';
                        } else {
                            statusDot.style.background = '#cbd5e1';
                            statusDot.title = 'Unknown';
                        }
                    } else {
                        statusDot.style.background = '#cbd5e1';
                        statusDot.title = 'Offline/Unknown';
                    }
                })
                .catch(_ => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (statusDot) {
                        statusDot.style.background = '#ef4444'; // red
                        statusDot.title = 'Error/Offline';
                    }
                });
        });
    }

    function loadSelected() {
        try {
            const name = localStorage.getItem(`${SELECTED_KEY}_name`);
            if (!name) return null;

            return {
                id: localStorage.getItem(`${SELECTED_KEY}_id`) || '',
                name: name,
                ip: localStorage.getItem(`${SELECTED_KEY}_ip`) || '',
                port: localStorage.getItem(`${SELECTED_KEY}_port`) || '',
                description: localStorage.getItem(`${SELECTED_KEY}_description`) || ''
            };
        }
        catch (e) { return null; }
    }

    function saveSelected(dev) {
        if (!dev) {
            localStorage.removeItem(`${SELECTED_KEY}_id`);
            localStorage.removeItem(`${SELECTED_KEY}_name`);
            localStorage.removeItem(`${SELECTED_KEY}_ip`);
            localStorage.removeItem(`${SELECTED_KEY}_port`);
            localStorage.removeItem(`${SELECTED_KEY}_description`);
        } else {
            localStorage.setItem(`${SELECTED_KEY}_id`, dev.id || '');
            localStorage.setItem(`${SELECTED_KEY}_name`, dev.name || '');
            localStorage.setItem(`${SELECTED_KEY}_ip`, dev.ip || '');
            localStorage.setItem(`${SELECTED_KEY}_port`, dev.port || '');
            localStorage.setItem(`${SELECTED_KEY}_description`, dev.description || '');
        }
        window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: dev }));
    }

    function renderSavedDevices() {
        const container = $id('saved-devices');
        if (!container) return;
        const list = loadDevices();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<div style="color:var(--muted)">No saved devices.</div>';
            return;
        }

        list.forEach((d, idx) => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.marginBottom = '8px';
            // attach data attributes so other UI code can find and highlight cards
            const ipVal = (d.ip || d.host || '').trim();
            if (ipVal) card.setAttribute('data-ip', ipVal);
            if (d.com) card.setAttribute('data-com', String(d.com));
            // Device status indicator
            let statusHtml = '<span class="status-dot status-offline" id="device-status-' + idx + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#cbd5e1;margin-right:6px"></span>';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        ${statusHtml}
                        <strong>${escapeHtml(d.name || d.label || 'Device')}</strong>
                        <div style="font-size:12px;color:#6b7280">${escapeHtml(ipVal)}${d.com? ' • ' + escapeHtml(d.com) : ''}</div>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-small" data-idx="${idx}" data-action="select">Select</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="edit">Edit</button>
                        <button class="btn btn-small" data-idx="${idx}" data-action="delete">Delete</button>
                    </div>
                </div>`;
            container.appendChild(card);
        });

        // Ensure the selection/highlight UI updates after rendering
        try { if (window.updateDeviceCardSelectionUI) setTimeout(() => window.updateDeviceCardSelectionUI(), 20); } catch (_) {}
        // After rendering, fetch and update device status
        updateAllDeviceStatuses();
    }

    // Fetch and update status for all devices
    function updateAllDeviceStatuses() {
        const list = loadDevices();
        list.forEach((d, idx) => {
            let ip = d.ip || d.host;
            if (!ip) return;
            let url = ip.startsWith('http') ? ip : `http://${ip}`;
            fetch(url + '/api/features', { method: 'GET' })
                .then(r => r.json())
                .then(j => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (!statusDot) return;
                    if (j && j.mode) {
                        if (j.mode === 'AP') {
                            statusDot.style.background = '#2563eb'; // blue
                            statusDot.title = 'AP Mode';
                        } else if (j.mode === 'STA') {
                            statusDot.style.background = '#fbbf24'; // yellow
                            statusDot.title = 'STA Mode';
                        } else if (j.mode === 'USB' || j.mode === 'serial') {
                            statusDot.style.background = '#16a34a'; // green
                            statusDot.title = 'USB/Serial';
                        } else {
                            statusDot.style.background = '#cbd5e1';
                            statusDot.title = 'Unknown';
                        }
                    } else {
                        statusDot.style.background = '#cbd5e1';
                        statusDot.title = 'Offline/Unknown';
                    }
                })
                .catch(_ => {
                    let statusDot = document.getElementById('device-status-' + idx);
                    if (statusDot) {
                        statusDot.style.background = '#ef4444'; // red
                        statusDot.title = 'Error/Offline';
                    }
                });
        });
    }

    function loadSelected() {
        try {
            const name = localStorage.getItem(`${SELECTED_KEY}_name`);
            if (!name) return null;

            return {
                id: localStorage.getItem(`${SELECTED_KEY}_id`) || '',
                name: name,
                ip: localStorage.getItem(`${SELECTED_KEY}_ip`) || '',
                port: localStorage.getItem(`${SELECTED_KEY}_port`) || '',
                description: localStorage.getItem(`${SELECTED_KEY}_description`) || ''
            };
        }
        catch (e) { return null; }
    }

    function saveSelected(dev) {
        if (!dev) {
            localStorage.removeItem(`${SELECTED_KEY}_id`);
            localStorage.removeItem(`${SELECTED_KEY}_name`);
            localStorage.removeItem(`${SELECTED_KEY}_ip`);
            localStorage.removeItem(`${SELECTED_KEY}_port`);
            localStorage.removeItem(`${SELECTED_KEY}_description`);
        } else {
            localStorage.setItem(`${SELECTED_KEY}_id`, dev.id || '');
            localStorage.setItem(`${SELECTED_KEY}_name`, dev.name || '');
            localStorage.setItem(`${SELECTED_KEY}_ip`, dev.ip || '');
            localStorage.setItem(`${SELECTED_KEY}_port`, dev.port || '');
            localStorage.setItem(`${SELECTED_KEY}_description`, dev.description || '');
        }
        window.dispatchEvent(new CustomEvent('oepl:selected-device-changed', { detail: dev }));
    }

    function renderSavedDevices() {
        const container = $id('saved-devices');
        if (!container) return;
        const list = loadDevices();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<div style="color:var(--muted)">No saved devices.</div>';
            return;
        }

        list.forEach((d, idx) => {
            const card = document.createElement('div');
            card.className = 'device-card';
            card.style.marginBottom = '8px';
            // attach data attributes so other UI code can find and highlight cards
            const ipVal = (d.ip || d.host || '').trim();
            if (ipVal) card.setAttribute('data-ip', ipVal);
            if (d.com) card.setAttribute('data-com', String(d.com));
            // Device status indicator
            let statusHtml = '<span class="status-dot status-offline" id="device-status-' + idx + '" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#c
