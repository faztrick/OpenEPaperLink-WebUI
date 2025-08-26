import { describe, expect, it } from 'vitest';
import { getFlashState, simulateFlashRun } from '../lib/legacy/flash';

describe('flash module simulation', () => {
  it('runs simulation and sets exit code', async () => {
    await simulateFlashRun({ env:'OutdoorAP', port:'COM10', baud:'921600', fast:true });
    const st = getFlashState();
    expect(st.running).toBe(false);
    expect(st.exitCode).toBe(0);
    expect(st.lines.length).toBeGreaterThan(0);
  }, 10000);
});
