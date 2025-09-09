import type { AppProps } from 'next/app';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { DeviceProvider } from '../context/DeviceContext';
import { UIProvider } from '../context/UIContext';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ErrorBoundary>
      <UIProvider>
        <DeviceProvider>
          <Component {...pageProps} />
        </DeviceProvider>
      </UIProvider>
    </ErrorBoundary>
  );
}
