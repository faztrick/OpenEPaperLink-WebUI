// settings-page.js - Settings & WiFi management logic extracted from inline script
(function(){
  function init(){
    // Ensure legacy hooks exist
    if(typeof window.initSetupPage !== 'function') window.initSetupPage = function(){};
    // Load initial tags (needed for tag count + shared functions)
    if(typeof loadTags === 'function') try{ loadTags(0); } catch(e){ console.error(e); }
    // Start periodic status updates
    setTimeout(()=>{
      updateCompactHeaderStatus();
      updateFooterStatus();
      updateHeaderUptime();
      setInterval(updateCompactHeaderStatus,5000);
      setInterval(updateFooterStatus,10000);
      setInterval(updateHeaderUptime,60000);
      initWifiManagement();
    },1000);
  }
  function updateCompactHeaderStatus(){
    fetch('get_ap_config').then(r=>r.json()).then(data=>{
      const systemDot = document.getElementById('systemDot');
      const systemStatus = document.getElementById('systemStatus');
      const tagCount = document.getElementById('tagCount');
      const wifiStatus = document.getElementById('wifiStatus');
      if(systemDot && systemStatus && data.apstate !== undefined){
        if (data.apstate === 1) { systemDot.className = 'status-dot online'; systemStatus.textContent = 'Online'; }
        else if (data.apstate === 2) { systemDot.className = 'status-dot warning'; systemStatus.textContent = 'Flashing'; }
        else if (data.apstate === 5) { systemDot.className = 'status-dot offline'; systemStatus.textContent = 'Failed'; }
        else { systemDot.className = 'status-dot warning'; systemStatus.textContent = 'Starting'; }
      }
      if(tagCount){ const totalTags = Object.keys(window.tagDB||{}).length; tagCount.textContent = `${totalTags} Tags`; }
      if(wifiStatus){ wifiStatus.textContent = data.wifiConnected ? 'Connected' : 'Disconnected'; }
    }).catch(err=>console.error('Status update error:',err));
  }
  function updateFooterStatus(){ const el = document.getElementById('footerTimestamp'); if(el) el.textContent = 'Last updated: '+new Date().toLocaleTimeString(); }
  function updateHeaderUptime(){ const el = document.getElementById('uptimeDisplay'); if(el){ const n=new Date(); el.textContent = String(n.getHours()).padStart(2,'0')+':'+String(n.getMinutes()).padStart(2,'0'); } }
  // WiFi Management
  function initWifiManagement(){ loadCurrentWifiConfig(); const scanBtn=$('#wifi_scan_btn'); const saveBtn=$('#wifi_save_btn'); if(scanBtn) scanBtn.addEventListener('click', scanWifiNetworks); if(saveBtn) saveBtn.addEventListener('click', saveWifiConfig); }
  function loadCurrentWifiConfig(){ fetch('get_wifi_config').then(r=>r.json()).then(data=>{ const map={ 'wifi_current_ssid': data.ssid||'Not connected','wifi_static_ip':data.ip||'','wifi_subnet':data.mask||'','wifi_gateway':data.gw||'','wifi_dns':data.dns||''}; Object.entries(map).forEach(([id,val])=>{ const el=document.getElementById(id); if(el) el.value=val;}); }).catch(err=>{ console.error('Failed to load WiFi config:',err); const msg=document.getElementById('wifi_status_msg'); if(msg) msg.textContent='Failed to load current WiFi config';}); }
  function scanWifiNetworks(){ const scanBtn=$('#wifi_scan_btn'); const ssidInput=$('#wifi_new_ssid'); const statusMsg=$('#wifi_status_msg'); if(!scanBtn||!ssidInput) return; scanBtn.disabled=true; scanBtn.textContent='Scanning...'; if(statusMsg){ statusMsg.textContent='Scanning for WiFi networks...'; statusMsg.style.color='#4facfe'; }
    fetch('wifi_scan').then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }).then(data=>{ if(!data.success) throw new Error('WiFi scan failed'); if(statusMsg){ if(data.networkCount===0){ statusMsg.textContent='No WiFi networks found'; statusMsg.style.color='#ff6b6b'; return; } }
      const select=document.createElement('select'); select.id='wifi_new_ssid'; select.style=ssidInput.style; const manual=document.createElement('option'); manual.value=''; manual.text='-- Enter manually --'; select.appendChild(manual); data.networks.sort((a,b)=>b.rssi-a.rssi).forEach(n=>{ if(n.ssid&&n.ssid.trim()!==''){ const o=document.createElement('option'); o.value=n.ssid; o.text=`${n.ssid} (${n.rssi}dBm) [${n.encryption===0?'Open':'Secured'}]`; select.appendChild(o);} }); const currentValue=ssidInput.value; ssidInput.replaceWith(select); select.addEventListener('change',function(){ if(this.value===''){ const input=document.createElement('input'); input.id='wifi_new_ssid'; input.type='text'; input.placeholder='Enter SSID manually'; input.style=this.style; input.value=currentValue; this.replaceWith(input);} }); if(statusMsg){ statusMsg.textContent=`Found ${data.networkCount} networks`; statusMsg.style.color='#6bcf7f'; }
    }).catch(err=>{ console.error('WiFi scan error:',err); if(statusMsg){ statusMsg.textContent='WiFi scan failed. Try again.'; statusMsg.style.color='#ff6b6b'; }}).finally(()=>{ scanBtn.disabled=false; scanBtn.textContent='Scan Networks'; }); }
  function saveWifiConfig(){ const saveBtn=$('#wifi_save_btn'); const statusMsg=$('#wifi_status_msg'); const ssidEl=$('#wifi_new_ssid'); const ssid=ssidEl?ssidEl.value.trim():''; if(!ssid){ if(statusMsg){ statusMsg.textContent='Please enter or select an SSID'; statusMsg.style.color='#ff6b6b'; } return; } const data={ ssid:ssid, pw:$('#wifi_password')?.value||'', ip:$('#wifi_static_ip')?.value||'', mask:$('#wifi_subnet')?.value||'', gw:$('#wifi_gateway')?.value||'', dns:$('#wifi_dns')?.value||''}; if(saveBtn){ saveBtn.disabled=true; saveBtn.textContent='Saving...'; } if(statusMsg){ statusMsg.textContent='Saving WiFi configuration...'; statusMsg.style.color='#4facfe'; }
    fetch('save_wifi_config',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)}).then(resp=>{ if(resp.ok){ return resp.json().catch(()=>({success:true,message:'Settings saved'})); } return resp.json().then(ed=>{ throw new Error(ed.error||'HTTP '+resp.status); }).catch(()=>{ throw new Error('HTTP '+resp.status+': '+resp.statusText);}); }).then(result=>{ if(result.success!==false){ if(statusMsg){ statusMsg.textContent=result.message||'WiFi settings saved! Access Point will reboot...'; statusMsg.style.color='#6bcf7f'; } const pw=$('#wifi_password'); if(pw) pw.value=''; setTimeout(()=>{ if(statusMsg) statusMsg.textContent='Rebooting... Please wait and reconnect.'; },2000);} else { throw new Error(result.error||'Unknown error'); } }).catch(err=>{ console.error('Error saving WiFi settings:',err); if(statusMsg){ statusMsg.textContent='Failed to save WiFi settings: '+err.message; statusMsg.style.color='#ff6b6b'; }}).finally(()=>{ if(saveBtn){ saveBtn.disabled=false; saveBtn.textContent='Save WiFi Settings'; } }); }
  document.addEventListener('boot:ready', function(ev){ if(ev.detail.page==='settings') init(); });
})();
