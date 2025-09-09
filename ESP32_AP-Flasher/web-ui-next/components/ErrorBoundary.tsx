import { Component, ErrorInfo, ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { hasError: boolean; error?: Error }

// Simple error boundary to prevent the entire app from crashing on render errors.
export class ErrorBoundary extends Component<Props, State> {
  // Explicitly declare so TS recognizes the fields even if react types aren't fully resolved yet
  declare props: Readonly<Props>;
  declare state: State;
  constructor(props: Props){
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo){
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught', error, info);
  }

  render(){
    const { hasError, error } = this.state;
    if (hasError){
      return (
        <div style={{ padding: '2rem' }}>
          <h2>Something went wrong.</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{error?.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
