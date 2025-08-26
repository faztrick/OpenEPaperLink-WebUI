// Improv serial protocol helpers extracted for reuse
const IMPROV_HDR = Buffer.from('IMPROV');
const IMPROV_VER = 0x01;
const TYPE_RPC = 0x03;
const TYPE_RPC_RESPONSE = 0x04;
const CMD_WIFI_SETTINGS = 0x01;
const CMD_GET_CURRENT_STATE = 0x02;
const CMD_GET_DEVICE_INFO = 0x03;
const CMD_GET_WIFI_NETWORKS = 0x04;
function checksum(buf){ let sum=0; for(let i=0;i<buf.length;i++) sum=(sum+buf[i])&0xFF; return Buffer.from([sum]); }
function buildImprovRpc(command, payload = Buffer.alloc(0)){
  const lenByte = Buffer.from([payload.length & 0xFF]);
  const pl = Buffer.concat([Buffer.from([command]), lenByte, payload]);
  const header = Buffer.concat([IMPROV_HDR, Buffer.from([IMPROV_VER, TYPE_RPC, pl.length])]);
  const frame = Buffer.concat([header, pl]);
  return Buffer.concat([frame, checksum(frame)]);
}
function buildWifiSettingsPayload(ssid, password){
  const ss = Buffer.from(String(ssid||''), 'utf8');
  const pw = Buffer.from(String(password||''), 'utf8');
  if (ss.length>255 || pw.length>255) throw new Error('ssid/password too long');
  return Buffer.concat([Buffer.from([ss.length]), ss, Buffer.from([pw.length]), pw]);
}
function parseImprovFrames(buffer, onFrame){
  let buf = buffer;
  while(true){
    const idx = buf.indexOf(IMPROV_HDR);
    if (idx === -1) return buf.length>IMPROV_HDR.length? buf.slice(-IMPROV_HDR.length): buf;
    if (idx>0) buf = buf.slice(idx);
    if (buf.length < 9) return buf;
    const ver = buf[6];
    const typ = buf[7];
    const len = buf[8];
    const fullLen = 9+len+1;
    if (buf.length < fullLen) return buf;
    const frame = buf.slice(0, fullLen);
    const calc = checksum(frame.slice(0,-1))[0];
    if (calc !== frame[frame.length-1]){ buf = buf.slice(1); continue; }
    const payload = frame.slice(9,-1);
    try { onFrame({ ver, typ, payload }); } catch(_){}
    buf = buf.slice(fullLen);
  }
}
function decodeRpcPayload(payload){
  if(!payload || payload.length===0) return { cmd:0, items:[] };
  const cmd = payload[0];
  const tryParseFrom = (startIdx) => {
    const items=[]; let i=startIdx;
    while(i<payload.length){ const sl = payload[i]; i+=1; if (i+sl>payload.length) return items; const s = payload.slice(i,i+sl).toString('utf8'); items.push(s); i+=sl; }
    return items;
  };
  let items = tryParseFrom(1);
  if(items.length===0 && payload.length>=2){ const items2 = tryParseFrom(2); if(items2.length>items.length) items = items2; }
  return { cmd, items };
}
module.exports = { IMPROV_HDR, IMPROV_VER, TYPE_RPC, TYPE_RPC_RESPONSE, CMD_WIFI_SETTINGS, CMD_GET_WIFI_NETWORKS, CMD_GET_CURRENT_STATE, CMD_GET_DEVICE_INFO, checksum, buildImprovRpc, buildWifiSettingsPayload, parseImprovFrames, decodeRpcPayload };
