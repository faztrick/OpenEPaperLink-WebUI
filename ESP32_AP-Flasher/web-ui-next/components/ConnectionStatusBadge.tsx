import { useEffect, useState } from 'react';
import { transport, TransportStatus } from '../lib/transport';

interface ConnectionStatusBadgeProps {
  status?: TransportStatus; // optional external status (avoids own subscription)
  className?: string;
  minimal?: boolean; // if true only show effective channel code
  showWhenEqual?: boolean; // if false and preferred==effective hide badge
}

// Small reusable badge indicating effective vs preferred transport channel.
// - Warn styling applied if there is a mismatch (fallback / override scenario)
// - Title attribute gives detailed explanation for hover tooltips
export function ConnectionStatusBadge({ status: ext, className = '', minimal, showWhenEqual = true }: ConnectionStatusBadgeProps) {
  const t = transport();
  const [st, setSt] = useState<TransportStatus>(() => ext || t.getStatus());

  useEffect(() => {
    if (ext) return; // external status drives updates
    const unsub = t.subscribe(setSt);
    return () => unsub();
  }, [ext, t]);

  const preferred = st.preferred;
  const effective = st.effective;
  const mismatch = preferred !== effective;
  if (!showWhenEqual && !mismatch) return null;
  const label = minimal ? effective : (mismatch ? `Using ${effective}` : `Effective ${effective}`);
  const extra = !minimal && mismatch ? ` (pref ${preferred})` : '';
  const title = `Preferred: ${preferred}\nEffective: ${effective}${mismatch ? '\nReason: fallback or forced mismatch' : ''}`;
  return (
    <span className={`badge xsmall ${mismatch ? 'warn' : ''} ${className}`.trim()} title={title}>
      {label}{extra}
    </span>
  );
}

export default ConnectionStatusBadge;
