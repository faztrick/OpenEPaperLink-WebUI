// Placeholder API helpers. Later we can adapt existing REST endpoints.
export interface DeviceSummary { id: string; name: string; status?: string }

export async function fetchDevices(): Promise<DeviceSummary[]> {
  // TODO: connect to real endpoint or reuse legacy data
  return [];
}
