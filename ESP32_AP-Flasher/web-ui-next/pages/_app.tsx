import type { AppProps } from 'next/app';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { DeviceProvider } from '../context/DeviceContext';
import { UIProvider } from '../context/UIContext';
import { SerialConfigProvider } from '../lib/serialConfig';
import '../styles/globals.css';
import '../styles/utilities.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ErrorBoundary>
      <UIProvider>
        <DeviceProvider>
          <SerialConfigProvider>
            <Component {...pageProps} />
          </SerialConfigProvider>
        </DeviceProvider>
      </UIProvider>
    </ErrorBoundary>
  );
}
