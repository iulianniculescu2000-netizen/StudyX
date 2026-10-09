import { Component, type ErrorInfo, type ReactNode } from 'react';

export default class DashboardErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Dashboard ErrorBoundary caught an error', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center">
          <h2 className="mb-2 text-xl font-bold">Ceva nu a mers bine în Dashboard.</h2>
          <button onClick={() => window.location.reload()} className="text-accent underline">Reîncarcă pagina</button>
        </div>
      );
    }

    return this.props.children;
  }
}
