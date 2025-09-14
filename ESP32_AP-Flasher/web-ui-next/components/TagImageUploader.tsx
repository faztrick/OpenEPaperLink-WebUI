import React, { useCallback, useRef, useState } from 'react';
import useSWR from 'swr';
import { fetchAllTags, TagRecord } from '../lib/api';
import { buildApiUrl } from '../lib/apiBase';

interface Props {
  onUploaded?: (mac: string) => void;
  compact?: boolean;
}

// Thin SWR helper to populate tag list once
function useTagsOnce() {
  const { data, error, isLoading } = useSWR('tags-all', () => fetchAllTags(500), { revalidateOnFocus: false });
  return { tags: data || [], error, isLoading };
}

export const TagImageUploader: React.FC<Props> = ({ onUploaded, compact }) => {
  const { tags, isLoading } = useTagsOnce();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [mac, setMac] = useState('');
  const [dither, setDither] = useState(1); // 0 none, 1 burkes, 2 ordered
  const [rotate, setRotate] = useState(0);
  const [lut, setLut] = useState(0);
  const [invert, setInvert] = useState(false);
  const [alias, setAlias] = useState('');
  const [ttl, setTtl] = useState('');
  const [preload, setPreload] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chosenTag: TagRecord | undefined = tags.find(t => t.mac === mac);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setMessage(null);
    if (!mac) { setError('Select a tag'); return; }
    const file = fileRef.current?.files?.[0];
    if (!file) { setError('Choose an image (JPEG/PNG)'); return; }
    try {
      setBusy(true);
      const fd = new FormData();
      fd.append('mac', mac);
      fd.append('file', file, file.name);
      fd.append('dither', String(dither));
      fd.append('rotate', String(rotate));
      fd.append('lut', String(lut));
      if (invert) fd.append('invert', '1');
      if (alias.trim()) fd.append('alias', alias.trim());
      if (ttl.trim()) fd.append('ttl', ttl.trim());
      if (preload) fd.append('preload', '1');
      // Content mode set inside backend to 24 for custom image; alias saved via modecfgjson
      const res = await fetch(buildApiUrl('/imgupload'), { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text() || res.statusText);
      setMessage('Image queued. Press / wake the tag to fetch the new content.');
      onUploaded?.(mac);
      fileRef.current!.value = '';
    } catch (err:any) {
      console.error(err);
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  }, [mac, dither, rotate, lut, invert, alias, ttl, preload, onUploaded]);

  const tagSelect = (
    <select value={mac} onChange={e=> setMac(e.target.value)} style={{width:'100%'}} disabled={busy || isLoading}>
      <option value=''>{isLoading ? 'Loading tags…' : 'Choose tag…'}</option>
      {tags.map(t => <option key={t.mac} value={t.mac}>{t.alias || t.mac} ({t.status})</option>)}
    </select>
  );

  return (
    <form onSubmit={handleSubmit} style={{display:'grid', gap:8, padding: compact?0:12, background: compact? 'transparent':'#161b22', border: compact? '1px dashed #30363d':'1px solid #30363d', borderRadius:8}}>
      {!compact && <h3 style={{margin:'4px 0'}}>Upload Image to Tag</h3>}
      <label style={{display:'grid', gap:4}}>
        <span style={{fontSize:12, opacity:.7}}>Tag</span>
        {tagSelect}
      </label>
      <label style={{display:'grid', gap:4}}>
        <span style={{fontSize:12, opacity:.7}}>Image File</span>
        <input ref={fileRef} type="file" accept="image/*" disabled={busy} />
      </label>
      <div style={{display:'flex', flexWrap:'wrap', gap:8}}>
        <label style={{display:'grid', fontSize:12}}>Dither<select value={dither} onChange={e=> setDither(Number(e.target.value))} disabled={busy}><option value={0}>None</option><option value={1}>Burkes</option><option value={2}>Ordered</option></select></label>
        <label style={{display:'grid', fontSize:12}}>Rotate<select value={rotate} onChange={e=> setRotate(Number(e.target.value))} disabled={busy}><option value={0}>0°</option><option value={1}>90°</option><option value={2}>180°</option><option value={3}>270°</option></select></label>
        <label style={{display:'grid', fontSize:12}}>LUT<select value={lut} onChange={e=> setLut(Number(e.target.value))} disabled={busy}><option value={0}>Default</option><option value={1}>Alt1</option><option value={2}>Alt2</option></select></label>
        <label style={{display:'flex', alignItems:'center', gap:4, fontSize:12}}><input type="checkbox" checked={invert} onChange={e=> setInvert(e.target.checked)} disabled={busy}/>Invert</label>
        <label style={{display:'flex', alignItems:'center', gap:4, fontSize:12}}><input type="checkbox" checked={preload} onChange={e=> setPreload(e.target.checked)} disabled={busy}/>Preload only</label>
      </div>
      <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
        <label style={{display:'grid', gap:4, flex:1, minWidth:140}}><span style={{fontSize:12, opacity:.7}}>Alias (optional)</span><input value={alias} onChange={e=> setAlias(e.target.value)} maxLength={63} disabled={busy} /></label>
        <label style={{display:'grid', gap:4, width:120}}><span style={{fontSize:12, opacity:.7}}>TTL (s)</span><input value={ttl} onChange={e=> setTtl(e.target.value)} disabled={busy} placeholder='e.g. 3600' /></label>
      </div>
      {chosenTag && <div style={{fontSize:12, opacity:.7}}>Last seen: {chosenTag.lastSeenDate?.toLocaleString() || 'never'} | Pending: {chosenTag.pending}</div>}
      <button type='submit' disabled={busy} style={{padding:'6px 12px', background:'var(--accent,#238636)', color:'#fff', border:'none', borderRadius:4, cursor:'pointer'}}>{busy ? 'Uploading…' : 'Upload & Queue'}</button>
      {message && <div style={{color:'var(--accent,#3fb950)', fontSize:12}}>{message}</div>}
      {error && <div style={{color:'tomato', fontSize:12}}>{error}</div>}
      <p style={{margin:0, fontSize:11, opacity:.6}}>After uploading, press the tag button (or wait for its next scheduled wake) to apply the new image.</p>
    </form>
  );
};

export default TagImageUploader;
