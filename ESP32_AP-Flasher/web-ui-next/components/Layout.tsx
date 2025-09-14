import dynamic from 'next/dynamic';
import Head from 'next/head';
import { ReactNode } from 'react';
import { ConnectionSwitcher } from './ConnectionSwitcher';
import { Header } from './Header';
import { Toaster } from './Toaster';
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
        className="skip-link offscreen"
      >
        Skip to content
      </a>
      <div
        className="app-shell flex-col full-min-h"
      >
        <Header />
        <div className="pad-conn"><ConnectionSwitcher /></div>
        <TopNav />
        <div className="layout-main-row">
          {sidebar && <Sidebar />}
          <main id="main" className="main-content">
            {children}
          </main>
        </div>
        <Modals />
        <Toaster />
      </div>
    </>
  );
}
