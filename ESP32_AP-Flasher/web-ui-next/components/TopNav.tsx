import Link from 'next/link';
import { useRouter } from 'next/router';

const LINKS: ReadonlyArray<[string, string]> = [
  ['/', 'Dashboard'],
  ['/wifi', 'WiFi'],
  ['/tags', 'Tags'],
  ['/ap-list', 'AP List'],
  ['/peers', 'Peers'],
  ['/flash', 'Simple Flasher'],
  ['/devices', 'Device'],
  ['/settings', 'Settings'],
  ['/ai', 'AI']
];

function isActive(currentPath: string, href: string) {
  if (href === '/') return currentPath === '/';
  if (currentPath === href) return true;
  // treat nested route (e.g., /device/123) active if href is a prefix and next char is '/'
  return currentPath.startsWith(href + '/');
}

export function TopNav() {
  const { asPath } = useRouter();
  return (
    <nav className="top-nav border-bottom" aria-label="Main Navigation" data-component-root="nav">
      <div className="flex gap px-4 py-2 flex-wrap">
        {LINKS.map(([href, label]) => {
          const active = isActive(asPath, href);
          return (
            <Link key={href} href={href} className={`nav-link${active ? ' active' : ''}`}>{label}</Link>
          );
        })}
      </div>
    </nav>
  );
}
