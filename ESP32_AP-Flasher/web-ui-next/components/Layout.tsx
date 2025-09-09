import dynamic from 'next/dynamic';
import Head from 'next/head';
import { ReactNode } from 'react';
import { Header } from './Header';
import { TopNav } from './TopNav';

const Sidebar = dynamic(() => import('./Sidebar').then((m) => m.Sidebar), { ssr: false });
const Modals = dynamic(() => import('./Modals').then((m) => m.Modals), { ssr: false });

export interface LayoutProps {
  title?: string;
  children?: ReactNode;
  sidebar?: boolean;
  description?: string;
}

export function Layout({
  title = 'OpenEPaperLink',
  children,
  sidebar = true,
  description,
}: LayoutProps) {
  return (
    <>
      <Head>
        <title>{title}</title>
        {description && <meta name="description" content={description} />}
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>
      <a
        href="#main"
        style={{ position: 'absolute', left: -1000, top: -1000 }}
        className="skip-link"
      >
        Skip to content
      </a>
      <div
        className="app-shell"
        style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}
      >
        <Header />
        <TopNav />
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {sidebar && <Sidebar />}
          <main id="main" style={{ flex: 1, padding: '1rem' }}>
            {children}
          </main>
        </div>
        <Modals />
      </div>
    </>
  );
}
