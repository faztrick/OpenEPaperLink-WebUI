// Alias endpoint for backwards compatibility: /api/wifi/status
// Delegates to the serial Wi-Fi status handler (/api/serial/wifi/status)
// so existing clients hitting the old path receive identical behavior.
import type { NextApiRequest, NextApiResponse } from 'next';
// Re-use existing handler implementation
// Relative path: wifi/status -> ../serial/wifi/status
import serialWifiStatusHandler from '../serial/wifi/status';

export default function wifiStatusAlias(req: NextApiRequest, res: NextApiResponse) {
  // Let original handler manage backend selection (it already inspects ?backend=)
  return serialWifiStatusHandler(req, res);
}
