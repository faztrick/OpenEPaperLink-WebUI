import React from 'react';
import dynamic from 'next/dynamic';

// Dynamically import to avoid SSR issues if any
const SerialWifiScannerPanel = dynamic(()=> import('../components/SerialWifiScannerPanel'), { ssr:false });

export default function SerialWifiPage(){
  return (
    <main className="max-w-4xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold">Serial WiFi Scanner</h1>
      <p className="text-sm text-gray-600">Open a serial connection first (e.g. via API /api/serial/open). Then run scans to view nearby networks.</p>
      <SerialWifiScannerPanel />
    </main>
  );
}
