import { useCallback, useState } from 'react';
import { addSavedDevice, cycleDeviceMethod, loadSavedDevices, removeSavedDevice, SavedDevicesStore, selectSavedDevice, updateSavedDevice } from '../lib/legacy/savedDevices';

export function useSavedDevices() {
  const [store, setStore] = useState<SavedDevicesStore>(() => loadSavedDevices());

  const add = useCallback((input: { name: string; host?: string; port?: string; com?: string; method?: 'http' | 'ws' | 'serial' }) => {
    setStore(s => addSavedDevice(s, input));
  }, []);
  const update = useCallback((id: string, patch: Partial<{ name: string; host: string; port: string; com: string; method: 'http' | 'ws' | 'serial' }>) => {
    setStore(s => updateSavedDevice(s, id, patch));
  }, []);
  const remove = useCallback((id: string) => { setStore(s => removeSavedDevice(s, id)); }, []);
  const select = useCallback((id: string | null) => { setStore(s => selectSavedDevice(s, id)); }, []);
  const cycleMethod = useCallback((id: string) => { setStore(s => cycleDeviceMethod(s, id)); }, []);

  return { ...store, add, update, remove, select, cycleMethod };
}
