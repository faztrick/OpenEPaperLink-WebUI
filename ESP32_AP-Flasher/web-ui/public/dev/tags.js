/*
 * Dynamic Tags Page Logic (dev environment)
 * Fetches the tag database via /get_db with pagination, renders a table, supports
 * filtering, manual + auto refresh, and highlights Newton M3 7.5" tags.
 */
(function(){
  const statusEl = document.getElementById('tags-status');
  const tbody = document.getElementById('tags-tbody');
  const emptyEl = document.getElementById('tags-empty');
  const summaryEl = document.getElementById('tags-summary');
  const filterInput = document.getElementById('tags-filter');
  const refreshBtn = document.getElementById('tags-refresh');
  const autoSel = document.getElementById('tags-autorefresh');

  if(!tbody){ return; }

  let allTags = []; // flattened tag objects
  let autoTimer = null;
  const NEWTON_SIGNATURES = [
    /newton/i,
    /m3\s*7\.5/i
  ];

  function isNewton(tag){
    // heuristic: check alias, typeName, resolution width/height from metadata (800x480 + 4 colors) or name
    if(tag.alias && NEWTON_SIGNATURES.some(r=>r.test(tag.alias))) return true;
    if(tag.typeName && NEWTON_SIGNATURES.some(r=>r.test(tag.typeName))) return true;
    if(tag.width === 800 && tag.height === 480 && (tag.colors === 4 || tag.colors === '4')) return true;
    return false;
  }

  async function fetchAllTags(){
    let pos = 0; // starting position
    let assembled = [];
    let guard = 0;
    while(guard < 200){ // safety
      const url = `/get_db?pos=${pos}`;
      try {
        const res = await fetch(url, {cache:'no-store'});
        if(!res.ok){ throw new Error(res.status + ' ' + res.statusText); }
        const data = await res.json();
        if(Array.isArray(data.tags)){
          assembled = assembled.concat(data.tags.map(normalizeRawTag));
        }
        if(data.continu){
          pos = data.continu; // backend returns next position
        } else {
          break;
        }
      } catch(e){
        console.error('Tag fetch failed', e);
        statusEl && (statusEl.textContent = 'Failed loading tags: ' + e.message);
        break;
      }
      guard++;
    }
    return assembled;
  }

  function normalizeRawTag(raw){
    // raw may be an object or array depending on firmware. We'll attempt flexible parsing.
    // Expect fields: mac, alias, type, w, h, col, batt, rssi, lastseen
    const t = {
      mac: raw.mac || raw.MAC || raw.id || '',
      alias: raw.alias || raw.name || '',
      typeCode: raw.type ?? raw.tagtype ?? raw.typeCode ?? null,
      width: Number(raw.w || raw.width || raw.W || 0),
      height: Number(raw.h || raw.height || raw.H || 0),
      colors: raw.col || raw.colors || raw.c || '',
      battery: raw.batt || raw.battery || raw.v || null,
      rssi: raw.rssi || raw.RSSI || null,
      lastSeenRaw: raw.lastseen || raw.seen || raw.lastSeen || null
    };
    t.typeName = mapType(t.typeCode, t);
    t.isNewton = isNewton(t);
    return t;
  }

  function mapType(code, tag){
    if(code == null) return '';
    // Basic known types from existing constants (subset). Extend if needed.
    const base = {
      1: '1.54" BWR',
      2: '2.13" BWR',
      3: '2.9" BWR',
      4: '4.2" BWR',
      5: '7.5" BWR',
      6: '2.13" BW',
      7: '2.9" BW',
      8: '4.2" BW',
      9: '7.5" BW',
      10: '1.54" BW'
    };
    if(code in base){
      let name = base[code];
      // Distinguish Newton 7.5 with 4 colors if heuristic matches
      if(tag && tag.width === 800 && tag.height === 480 && (tag.colors == 4) && /7\.5/.test(name)){
        name = 'Newton M3 7.5" (4C)';
      }
      return name;
    }
    return 'Type ' + code;
  }

  function formatLastSeen(v){
    if(v == null) return '';
    const n = Number(v);
    if(!isFinite(n)) return String(v);
    const d = new Date(n * 1000); // assume epoch seconds
    const now = Date.now();
    const ageMs = now - d.getTime();
    const age = ageMs/1000;
    let rel;
    if(age < 90) rel = Math.round(age)+ 's ago';
    else if(age < 3600) rel = Math.round(age/60) + 'm ago';
    else if(age < 86400) rel = Math.round(age/3600) + 'h ago';
    else rel = Math.round(age/86400) + 'd ago';
    return rel;
  }

  function formatBattery(v){
    if(v == null || v === '') return '';
    let num = Number(v);
    if(!isFinite(num)) return v;
    if(num > 10) { // maybe mV
      if(num > 100) num = num/1000; // convert mV to V
    }
    return num.toFixed(2) + 'V';
  }

  function formatRSSI(v){
    if(v == null || v === '') return '';
    return v + ' dBm';
  }

  function render(){
    const filter = (filterInput.value||'').trim().toLowerCase();
    const rows = [];
    let newtonCount = 0;
    const filtered = allTags.filter(t=>{
      if(!filter) return true;
      return [t.mac, t.alias, t.typeName].some(x=> x && x.toLowerCase().includes(filter));
    });

    filtered.forEach(tag=>{
      if(tag.isNewton) newtonCount++;
      const badge = tag.isNewton ? '<span style="background:#4b2;border:1px solid #6d4;padding:2px 4px;border-radius:4px;font-size:10px;letter-spacing:.5px">NEWTON</span> ' : '';
      rows.push(`<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #222;font-family:monospace">${tag.mac}</td>
        <td class="alias-cell" data-mac="${tag.mac}" style="padding:6px 10px;border-bottom:1px solid #222;cursor:pointer" title="Click to edit alias">${escapeHTML(tag.alias)||''}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #222">${badge}${escapeHTML(tag.typeName||'')}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #222">${tag.width && tag.height ? tag.width+'x'+tag.height: ''}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #222">${tag.colors||''}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #222">${formatBattery(tag.battery)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #222">${formatRSSI(tag.rssi)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #222">${formatLastSeen(tag.lastSeenRaw)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #222;white-space:nowrap">
          <button class="btn tiny" data-mac="${tag.mac}" data-action="ping" title="Request wake / info">Ping</button>
        </td>
      </tr>`);
    });

    tbody.innerHTML = rows.join('');
    emptyEl.style.display = filtered.length? 'none':'block';
    summaryEl.textContent = `${filtered.length} shown / ${allTags.length} total${newtonCount? ` — ${newtonCount} Newton` : ''}`;
  }

  function escapeHTML(str){
    if(str == null) return '';
    return String(str).replace(/[&<>"']/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  }

  async function load(){
    statusEl && (statusEl.textContent = 'Loading tag database…');
    refreshBtn && (refreshBtn.disabled = true);
    try {
      allTags = await fetchAllTags();
      statusEl && (statusEl.textContent = `Loaded ${allTags.length} tag(s)`);
    } finally {
      refreshBtn && (refreshBtn.disabled = false);
    }
    render();
  }

  function schedule(){
    if(autoTimer) clearTimeout(autoTimer);
    const sec = Number(autoSel.value);
    if(sec > 0){
      autoTimer = setTimeout(()=>{ load(); schedule(); }, sec*1000);
    }
  }

  function pauseAuto(){ if(autoTimer){ clearTimeout(autoTimer); autoTimer=null; } }
  function resumeAuto(){ schedule(); }

  function beginAliasEdit(cell){
    const mac = cell.getAttribute('data-mac');
    const current = cell.textContent.trim();
    pauseAuto();
    cell.innerHTML = '';
    const input = document.createElement('input');
    input.type='text';
    input.value = current;
    input.maxLength = 63;
    input.style.width='100%';
    input.style.boxSizing='border-box';
    input.style.padding='2px 4px';
    input.style.fontSize='0.8rem';
    cell.appendChild(input);
    input.focus();
    input.select();

    let committed = false;
    const finish = (apply)=>{
      if(committed) return; // guard
      committed = true;
      const newVal = input.value.trim();
      cell.innerHTML = escapeHTML(apply ? newVal : current);
      if(apply && newVal !== current){
        saveAlias(mac, newVal, cell);
      } else {
        resumeAuto();
      }
    };
    input.addEventListener('keydown', e=>{
      if(e.key==='Enter') { e.preventDefault(); finish(true);} else if(e.key==='Escape'){ e.preventDefault(); finish(false);} });
    input.addEventListener('blur', ()=> finish(true));
  }

  async function saveAlias(mac, alias, cell){
    cell.dataset.saving='1';
    const indicator = document.createElement('span');
    indicator.textContent='…';
    indicator.style.marginLeft='4px';
    indicator.style.opacity='0.6';
    cell.appendChild(indicator);
    try{
      const form = new URLSearchParams();
      form.set('mac', mac); form.set('alias', alias);
      const res = await fetch('/tag_alias', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: form.toString()});
      if(!res.ok){ throw new Error(res.status+' '+res.statusText); }
      const json = await res.json().catch(()=>({}));
      if(!json.success){ throw new Error(json.error||'alias update failed'); }
      // update local list
      const tag = allTags.find(t=>t.mac===mac); if(tag){ tag.alias = alias; }
    }catch(err){
      console.warn('Alias save failed', err);
      cell.style.background='#402';
      setTimeout(()=>{ cell.style.background=''; }, 1500);
    } finally {
      delete cell.dataset.saving; indicator.remove(); resumeAuto();
    }
  }

  filterInput && filterInput.addEventListener('input', ()=> render());
  refreshBtn && refreshBtn.addEventListener('click', ()=> load());
  autoSel && autoSel.addEventListener('change', ()=> schedule());

  // Basic action handler placeholder
  tbody.addEventListener('click', e=>{
    const btn = e.target.closest('button[data-action]');
    if(!btn) return;
    const mac = btn.getAttribute('data-mac');
    const action = btn.getAttribute('data-action');
    if(action === 'ping'){
      // Placeholder - actual endpoint may differ; send simple fetch if exists
      fetch(`/get_db?mac=${mac}`).then(r=>r.ok && r.json()).then(data=>{
        console.log('Ping response', data);
      }).catch(err=>console.warn('Ping failed', err));
    }
  });

  // Inline alias editing
  tbody.addEventListener('click', e=>{
    const cell = e.target.closest('.alias-cell');
    if(cell && !cell.dataset.saving){ beginAliasEdit(cell); }
  });

  // Simple context menu (right-click) placeholder for future actions
  tbody.addEventListener('contextmenu', e=>{
    const row = e.target.closest('tr');
    if(!row) return;
    e.preventDefault();
    const macCell = row.querySelector('td');
    if(!macCell) return;
    const mac = macCell.textContent.trim();
    // For now just quick action: refetch single tag
    fetch(`/get_db?mac=${mac}`).then(r=>r.ok && r.json()).then(data=>{
      console.log('Context fetch', data);
    }).catch(err=>console.warn('Context fetch failed', err));
  });

  document.addEventListener('components:loaded', ()=>{
    // Ensure layout dependencies loaded before initial fetch
    load();
    schedule();
  });

})();
