import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('UI error:', error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card bg-base-200 max-w-sm">
          <div className="card-body items-center text-center">
            <h2 className="card-title">Something went wrong</h2>
            <p className="text-sm opacity-70">{String(this.state.error.message || this.state.error)}</p>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      </div>
    );
  }
}
