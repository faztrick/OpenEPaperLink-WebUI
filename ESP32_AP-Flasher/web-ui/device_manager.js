// Centralized Device Manager
// Responsibilities:
//  - Load & persist devices.json { devices: [ {id,name,host,port?,meta?}], selectedId }
//  - Provide CRUD operations and selection
//  - Emit events: 'changed' (full list), 'selected' (device or null)
//  - Basic validation & ID generation
// NOTE: Legacy (array-only or string entries) support removed – all consumers must use object form.

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class DeviceManager extends EventEmitter {
    constructor(filePath) {
        super();
        this.filePath = filePath;
        this.devices = [];
        this.selectedId = null;
        this._load();
    }

    _load() {
        try {
            if (!fs.existsSync(this.filePath)) return;
            const raw = fs.readFileSync(this.filePath, 'utf8');
            if (!raw.trim()) return;
            const parsed = JSON.parse(raw);
            // Expect strict object shape
            this.devices = this._normalizeDevices(parsed.devices || []);
            this.selectedId = parsed.selectedId || null;
        } catch (e) {
            this.devices = [];
            this.selectedId = null;
        }
    }

    _save() {
        try {
            const payload = { devices: this.devices, selectedId: this.selectedId };
            fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2), 'utf8');
        } catch (e) {
            // swallow
        }
    }

    _normalizeDevices(arr) {
        return arr.filter(d => d && typeof d === 'object').map(d => {
            const id = d.id || this._makeId(d.name || d.host || 'dev');
            return {
                id,
                name: d.name || d.host || id,
                host: d.host || d.ip || '',
                port: d.port || null,
                meta: d.meta || {}
            };
        });
    }

    _makeId(base = 'dev') {
        const slug = String(base).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'dev';
        let candidate = slug;
        let i = 1;
        while (this.devices.find(d => d.id === candidate)) {
            candidate = `${slug}-${i++}`;
        }
        return candidate;
    }

    list() { return [...this.devices]; }
    getSelected() { return this.devices.find(d => d.id === this.selectedId) || null; }
    // Retrieve device by id (added to satisfy server.js usage)
    get(id) {
        if (!id) return null;
        return this.devices.find(d => d.id === id) || null;
    }

    add(device) {
        if (!device || typeof device !== 'object') throw new Error('device object required');
        if (!device.host && !device.name) throw new Error('device host or name required');
        const id = this._makeId(device.name || device.host || 'dev');
        const rec = {
            id,
            name: device.name || device.host || id,
            host: device.host || '',
            port: device.port || null,
            meta: device.meta || {}
        };
        this.devices.push(rec);
        this._save();
        this.emit('changed', this.list());
        return rec;
    }

    update(id, patch) {
        const idx = this.devices.findIndex(d => d.id === id);
        if (idx === -1) throw new Error('device not found');
        const cur = this.devices[idx];
        this.devices[idx] = { ...cur, ...patch, id: cur.id }; // never allow id change
        this._save();
        this.emit('changed', this.list());
        return this.devices[idx];
    }

    remove(id) {
        const idx = this.devices.findIndex(d => d.id === id);
        if (idx === -1) return false;
        const [removed] = this.devices.splice(idx, 1);
        if (this.selectedId === id) this.selectedId = null;
        this._save();
        this.emit('changed', this.list());
        if (removed && removed.id) this.emit('removed', removed);
        if (this.selectedId === null) this.emit('selected', null);
        return true;
    }

    select(id) {
        if (id !== null && !this.devices.find(d => d.id === id)) throw new Error('device not found');
        this.selectedId = id;
        this._save();
        this.emit('selected', this.getSelected());
        return this.getSelected();
    }

    // Replace entire device list (compatibility for legacy POST /api/devices)
    replaceAll(list, selectedId = null) {
        if (!Array.isArray(list)) throw new Error('list must be array');
        this.devices = this._normalizeDevices(list);
        this.selectedId = selectedId && this.devices.find(d => d.id === selectedId) ? selectedId : null;
        this._save();
        this.emit('changed', this.list());
        this.emit('selected', this.getSelected());
        return { devices: this.list(), selectedId: this.selectedId };
    }
}

module.exports = DeviceManager;
