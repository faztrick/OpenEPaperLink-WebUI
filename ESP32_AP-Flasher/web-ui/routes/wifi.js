// Device WiFi related routes (proxy + convenience by device id)
module.exports = function registerWifiRoutes(app, deps){
  const { deviceManager, axios, appendLog, rateLimit } = deps;
  // Scan via host
  app.get('/api/device/wifi/scan', async (req,res)=>{
    if(rateLimit && rateLimit(req,res,'wifi_scan',4)) return; // keep original limiting
    try {
      const host = req.query.host; if(!host) return res.status(400).json({ success:false, error:'host required' }); const base = `http://${host}`;
      const normalizeNetworks = raw => { if(!raw) return []; if(Array.isArray(raw.networks)) raw = raw.networks; if(Array.isArray(raw.results)) raw = raw.results; if(Array.isArray(raw.scanResults)) raw = raw.scanResults; if(!Array.isArray(raw) && typeof raw==='object') raw = Object.values(raw); if(!Array.isArray(raw)) return []; return raw.map(n=> (n && typeof n==='object')? n : { ssid:String(n) }); };
      // Unified attempt
      let unifiedAttempted = false;
      try {
        unifiedAttempted = true;
        const kick = await axios.post(`${base}/api/wifi/scan`, {}, { timeout:8000, validateStatus:()=>true });
        if(kick.status>=200 && kick.status<300){
          const started=Date.now(); const timeoutMs=15000; let lastData=null;
          while((Date.now()-started)<timeoutMs){
            await new Promise(r=>setTimeout(r,750));
            try {
              const r = await axios.get(`${base}/api/wifi/scan/results`, { timeout:6000, validateStatus:()=>true });
              if(r.status>=200 && r.status<300){
                lastData = r.data;
                if(!r.data?.scanRunning){
                  const nets = normalizeNetworks(r.data);
                  return res.json({ success:true, networks:nets, unified:true, scanDurationMs: Date.now()-started });
                }
              } else { break; }
            } catch(_) { break; }
          }
          if(lastData){
            const nets = normalizeNetworks(lastData);
            if(nets.length) return res.json({ success:true, networks:nets, unified:true, partial:true });
          }
        }
      } catch(_) { /* fallback to legacy */ }
      // Legacy fallback
      const legacyPaths=['/wifi_scan','/scan_wifi']; let lastErr=null;
      for(const p of legacyPaths){
        try {
          const r=await axios.get(`${base}${p}`, { timeout:10000, validateStatus:()=>true });
          if(r.status>=200 && r.status<300){ const nets=normalizeNetworks(r.data); return res.json({ success:true, networks:nets, unified:false, legacyEndpoint:p }); }
          lastErr = new Error(`HTTP ${r.status}`);
        } catch(e){ lastErr=e; }
      }
      return res.status(502).json({ success:false, error: lastErr?.message || 'scan failed', unifiedTried: unifiedAttempted });
    } catch(err){ res.status(500).json({ success:false, error: err.message || String(err) }); }
  });
  // Connect
  app.post('/api/device/wifi/connect', async (req,res)=>{ try { const { host, ssid, password='' } = req.body||{}; if(!host || !ssid) return res.status(400).json({ success:false, error:'host and ssid required' }); const base = `http://${host}`; const payload={ ssid, password }; const postJson = p=> axios.post(`${base}${p}`, payload, { timeout:12000, validateStatus:()=>true }); const postForm = p=> axios.post(`${base}${p}`, new URLSearchParams(payload).toString(), { timeout:12000, headers:{'Content-Type':'application/x-www-form-urlencoded'}, validateStatus:()=>true }); const attempts=[ ()=>postJson('/save_wifi_config'), ()=>postForm('/save_wifi_config'), ()=>postJson('/set_wifi') ]; let last=null; for(const fn of attempts){ try { const r=await fn(); if(r.status>=200 && r.status<300) return res.json({ success:true, data:r.data }); last=new Error(`HTTP ${r.status}`); } catch(e){ last=e; } } return res.status(502).json({ success:false, error: last?.message || 'connect failed' }); } catch(err){ res.status(500).json({ success:false, error: err.message || String(err) }); } });
  // Status
  app.get('/api/device/wifi/status', async (req,res)=>{ const host = req.query.host; if(!host) return res.status(400).json({ success:false, error:'host required' }); const base = `http://${host}`; const result = { success:true, host, connected:false, ssid:null, rssi:null, ip:null, channel:null, mode:null, raw:{} }; const attempts=[ '/api/wifi/summary','/api/wifi/status','/network_info','/sysinfo','/api/telemetry','/api/status' ]; for(const p of attempts){ try { const r=await axios.get(base+p, { timeout:5000, validateStatus:()=>true }); if(r.status>=200 && r.status<300 && r.data){ result.raw[p.replace(/^\/+/,'').replace(/\//g,'_')] = r.data; const d=r.data; const wifi = d.wifi || d.network || d; if(wifi){ if(wifi.ssid && !result.ssid) result.ssid=wifi.ssid; if(typeof wifi.rssi==='number' && result.rssi==null) result.rssi=wifi.rssi; if(wifi.localIP && !result.ip) result.ip=wifi.localIP; if(wifi.ip && !result.ip) result.ip=wifi.ip; if(wifi.channel && !result.channel) result.channel=wifi.channel; if((wifi.connected===true || wifi.status==='connected') && !result.connected) result.connected=true; } if(d.ap && d.ap.enabled && !result.mode) result.mode = d.ap.mode || 'ap'; if(d.mode && !result.mode) result.mode = d.mode; if(d.wifiStatus!==undefined){ const ws = (typeof d.wifiStatus==='string')? parseInt(d.wifiStatus,10): d.wifiStatus; if(ws===3) result.connected=true; } } } catch(_){} }
    if(!result.connected){ try { const ping = await axios.get(base+'/api/ping', { timeout:2000, validateStatus:()=>true }); if(ping.status>=200 && ping.status<300 && ping.data && ping.data.ok) result.connected=true; } catch(_){} }
    res.json(result);
  });
  // By device id wrappers
  app.get('/api/device/:id/wifi/status', (req,res)=>{ try { const dev = deviceManager.get(req.params.id); if(!dev || !(dev.host||dev.ip)) return res.status(404).json({ success:false, error:'device not found' }); req.query.host = dev.host || dev.ip; return app._router.handle({ ...req, url:`/api/device/wifi/status?host=${encodeURIComponent(req.query.host)}`, path:'/api/device/wifi/status' }, res, ()=>{} ); } catch(e){ res.status(500).json({ success:false, error:e.message }); } });
  app.get('/api/device/:id/wifi/scan', (req,res)=>{ try { const dev = deviceManager.get(req.params.id); if(!dev || !(dev.host||dev.ip)) return res.status(404).json({ success:false, error:'device not found' }); const host = dev.host || dev.ip; req.query.host = host; return app._router.handle({ ...req, url:`/api/device/wifi/scan?host=${encodeURIComponent(host)}`, path:'/api/device/wifi/scan' }, res, ()=>{} ); } catch(e){ res.status(500).json({ success:false, error:e.message }); } });
  app.post('/api/device/:id/wifi/connect', (req,res)=>{ try { const dev = deviceManager.get(req.params.id); if(!dev || !(dev.host||dev.ip)) return res.status(404).json({ success:false, error:'device not found' }); req.body.host = dev.host || dev.ip; return app._router.handle({ ...req, url:'/api/device/wifi/connect', path:'/api/device/wifi/connect', method:'POST' }, res, ()=>{} ); } catch(e){ res.status(500).json({ success:false, error:e.message }); } });
  // Disconnect
  app.post('/api/device/wifi/disconnect', async (req,res)=>{ try { const { host } = req.body || {}; if(!host) return res.status(400).json({ success:false, error:'host required' }); const base = `http://${host}`; const paths=[ {m:'post',p:'/wifi_disconnect'}, {m:'post',p:'/disconnect_wifi'}, {m:'get',p:'/wifi_disconnect'}, {m:'get',p:'/disconnect_wifi'}, {m:'post',p:'/api/wifi/disconnect'}, {m:'get',p:'/api/wifi/disconnect'} ]; let lastErr=null; for(const t of paths){ try { const fn = t.m==='post'? axios.post : axios.get; const r = await fn(base+t.p, {}, { timeout:5000, validateStatus:()=>true }); if(r.status>=200 && r.status<300) return res.json({ success:true, endpoint:t.p, data:r.data }); lastErr = new Error(`HTTP ${r.status}`); } catch(e){ lastErr=e; } } return res.status(502).json({ success:false, error: lastErr?.message || 'disconnect failed' }); } catch(err){ res.status(500).json({ success:false, error: err.message || String(err) }); } });
  app.post('/api/device/:id/wifi/disconnect', (req,res)=>{ try { const dev = deviceManager.get(req.params.id); if(!dev || !(dev.host||dev.ip)) return res.status(404).json({ success:false, error:'device not found' }); req.body.host = dev.host || dev.ip; return app._router.handle({ ...req, url:'/api/device/wifi/disconnect', path:'/api/device/wifi/disconnect', method:'POST' }, res, ()=>{} ); } catch(e){ res.status(500).json({ success:false, error:e.message }); } });
};
