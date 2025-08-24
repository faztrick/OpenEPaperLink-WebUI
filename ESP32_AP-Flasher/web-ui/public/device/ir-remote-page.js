// ir-remote-page.js
// Logic extracted from original inline script in ir_remote.html
(function(){
  class IRRemoteControl {
    constructor(){
      this.isLearning = false;
      this.receiverEnabled = false;
      this.logEntries = [];
      this.init();
    }
    async init(){
      this.log('🚀 IR Remote Control initialized');
      await this.refreshStatus();
      await this.loadProfiles();
      this.statusTimer = setInterval(()=>this.refreshStatus(), 5000);
      this.receiveTimer = setInterval(()=>this.checkReceived(), 2000);
      window.addEventListener('beforeunload', ()=>{
        clearInterval(this.statusTimer); clearInterval(this.receiveTimer);
      });
    }
    async refreshStatus(){
      try{
        const r = await fetch('/ir/status');
        if(!r.ok) return this.log('❌ Failed to get IR status');
        const status = await r.json();
        this.updateStatusDisplay(status);
      }catch(e){ this.log('❌ Error getting status: '+e.message); }
    }
    updateStatusDisplay(status){
      const set = (id,val,cls)=>{ const el=document.getElementById(id); if(el){ el.textContent=val; if(cls) el.className=cls; }};
      set('ir-status', status.enabled? 'Enabled':'Disabled', status.enabled? 'status-value':'status-value inactive');
      set('receiver-status', status.receiverEnabled? 'Active':'Inactive', status.receiverEnabled? 'status-value':'status-value inactive');
      set('send-pin', status.sendPin||'--');
      set('recv-pin', status.recvPin||'--');
      set('current-profile', status.currentProfile||'None');
      this.receiverEnabled = status.receiverEnabled;
    }
    async loadProfiles(){
      try{
        const r = await fetch('/ir/profiles');
        if(!r.ok) return this.log('❌ Failed to load profiles');
        const data = await r.json();
        this.updateProfileSelector(data);
      }catch(e){ this.log('❌ Error loading profiles: '+e.message); }
    }
    updateProfileSelector(data){
      const select = document.getElementById('profile-select');
      if(!select) return;
      select.innerHTML='';
      if(data.profiles && data.profiles.length){
        data.profiles.forEach(p=>{ const o=document.createElement('option'); o.value=p; o.textContent=p; if(p===data.current) o.selected=true; select.appendChild(o); });
      } else {
        const o=document.createElement('option'); o.value=''; o.textContent='No profiles available'; select.appendChild(o);
      }
      this.log(`📂 Loaded ${data.profiles?.length||0} profiles`);
    }
    async sendCommand(command){
      this.log('📤 Sending command: '+command);
      try{
        const r= await fetch('/ir/send',{method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:`command=${encodeURIComponent(command)}`});
        const result = await r.json();
        if(result.success) this.log('✅ Command sent successfully: '+command); else this.log('❌ Failed to send command: '+result.error);
      }catch(e){ this.log('❌ Error sending command: '+e.message); }
    }
    async startLearning(){
      if(this.isLearning) return this.log('⚠️ Already in learning mode');
      const timeout = parseInt(document.getElementById('learn-timeout').value)||10000;
      const btn = document.getElementById('learn-btn');
      this.isLearning=true; if(btn){ btn.textContent='⏳ Learning...'; btn.disabled=true; }
      this.log(`🎓 Starting IR learning (timeout: ${timeout}ms)`);
      try{
        const r= await fetch('/ir/learn',{method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:`timeout=${timeout}`});
        const result = await r.json();
        if(result.success){ this.log(`✅ Learned command: ${result.protocol} 0x${result.code} (${result.bits} bits)`); this.displayLearnedCommand(result);} else this.log('⏰ Learning timeout or error: '+result.error);
      }catch(e){ this.log('❌ Learning error: '+e.message); }
      finally { this.isLearning=false; if(btn){ btn.textContent='🎓 Start Learning'; btn.disabled=false; } }
    }
    displayLearnedCommand(command){
      const wrap=document.getElementById('received-commands'); const list=document.getElementById('command-list'); if(!list) return;
      const div=document.createElement('div'); div.className='command-item';
      div.innerHTML=`<strong>Protocol:</strong> ${command.protocol}<br><strong>Code:</strong> ${command.code}<br><strong>Bits:</strong> ${command.bits}<br><strong>Description:</strong> ${command.description||'Unknown'}`;
      list.appendChild(div); if(wrap) wrap.style.display='block';
    }
    async checkReceived(){
      try{ const r= await fetch('/ir/receive'); if(!r.ok) return; const result= await r.json(); if(result.hasCommand){ this.log(`📡 Received: ${result.protocol} ${result.code} - ${result.description}`); this.displayLearnedCommand(result);} }catch(e){/*silent*/}
    }
    clearReceived(){ const list=document.getElementById('command-list'); const wrap=document.getElementById('received-commands'); if(list) list.innerHTML=''; if(wrap) wrap.style.display='none'; this.log('🗑️ Cleared received commands'); }
    async testConnection(){ this.log('🔧 Testing IR connection...'); await this.refreshStatus(); this.log('✅ Connection test completed'); }
    async toggleReceiver(){ this.log('🔄 Toggling receiver (currently '+(this.receiverEnabled?'enabled':'disabled')+')'); await this.refreshStatus(); }
    log(msg){ const ts=new Date().toLocaleTimeString(); const entry=`[${ts}] ${msg}`; this.logEntries.push(entry); if(this.logEntries.length>100) this.logEntries.shift(); const area=document.getElementById('log-display'); if(area){ area.textContent=this.logEntries.join('\n'); area.scrollTop=area.scrollHeight; } }
    clearLog(){ this.logEntries=[]; const area=document.getElementById('log-display'); if(area) area.textContent=''; this.log('🗑️ Log cleared'); }
    exportLog(){ const blob=new Blob([this.logEntries.join('\n')],{type:'text/plain'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`ir-remote-log-${new Date().toISOString().split('T')[0]}.txt`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); this.log('💾 Log exported'); }
  }
  let irRemote;
  document.addEventListener('boot:ready', ()=>{ irRemote = new IRRemoteControl(); });
  // Expose global wrappers for existing onclick attributes
  window.sendCommand = c=>irRemote && irRemote.sendCommand(c);
  window.startLearning = ()=>irRemote && irRemote.startLearning();
  window.clearReceived = ()=>irRemote && irRemote.clearReceived();
  window.checkReceived = ()=>irRemote && irRemote.checkReceived();
  window.refreshStatus = ()=>irRemote && irRemote.refreshStatus();
  window.loadProfiles = ()=>irRemote && irRemote.loadProfiles();
  window.testConnection = ()=>irRemote && irRemote.testConnection();
  window.toggleReceiver = ()=>irRemote && irRemote.toggleReceiver();
  window.clearLog = ()=>irRemote && irRemote.clearLog();
  window.exportLog = ()=>irRemote && irRemote.exportLog();
})();
