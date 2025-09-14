import Link from 'next/link';
import { Layout } from '../../components/Layout';
import { Seo } from '../../components/Seo';

export default function DeviceRedirect() {
  return (
    <Layout title="Device">
      <Seo title="Device" description="Device page deprecated" />
      <h1 className="mt-0">Device (Deprecated)</h1>
      <div className="callout info mt-6">Per-device details moved to the <Link href="/">Dashboard</Link>.</div>
      <div className="xsmall mt-8 center-muted">Legacy dynamic route retained temporarily.</div>
    </Layout>
  );
}
