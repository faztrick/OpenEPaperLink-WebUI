import { Layout } from '../components/Layout';
import { SavedDevicesPanel } from '../components/SavedDevicesPanel';
import { Seo } from '../components/Seo';

export default function Home() {
  return (
    <Layout title="OpenEPaperLink Next UI">
      <Seo title="OpenEPaperLink Next UI" description="Migrated Next.js interface for OpenEPaperLink" />
      <h1>OpenEPaperLink Next UI (WIP)</h1>
      <p>This is the starting point for the Next.js optimized version of the development UI.</p>
      <ul>
        <li>Pages pending deeper data integration (device details, tags, wifi, flash, logs, settings)</li>
        <li>Migrated foundations: header, serial API, device + saved devices context</li>
        <li>Legacy assets remain in <code>public/dev</code></li>
      </ul>
      <SavedDevicesPanel />
    </Layout>
  );
}
