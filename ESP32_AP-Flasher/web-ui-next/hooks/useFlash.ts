import { useCallback, useEffect, useState } from 'react';
import { FlashRunOptions, getFlashState, simulateFlashRun, FlashProcessState } from '../lib/legacy/flash';

export function useFlash() {
  const [state, setState] = useState<FlashProcessState>(() => getFlashState());

  const refresh = useCallback(() => { setState(getFlashState()); }, []);

  const run = useCallback(async (opts: FlashRunOptions) => {
    await simulateFlashRun(opts); refresh();
  }, [refresh]);

  useEffect(() => { const id = setInterval(refresh, 1000); return () => clearInterval(id); }, [refresh]);

  return { state, run };
}
