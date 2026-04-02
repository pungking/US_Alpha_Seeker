import React from 'react';
import { captureClientException } from '../services/sentryClient';

interface Props {
  label: string;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

class RenderGuard extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[RenderGuard:${this.props.label}]`, error, info);
    captureClientException(error, {
      boundary: 'RenderGuard',
      label: this.props.label,
      componentStack: info?.componentStack || ''
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="glass-panel p-6 md:p-8 rounded-[28px] border border-rose-500/30 bg-slate-950/80">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
            </svg>
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-rose-400">{this.props.label} Runtime Guard</p>
            <p className="text-[10px] text-slate-400">A rendering fault was contained to prevent a full-screen blackout.</p>
          </div>
        </div>
      </div>
    );
  }
}

export default RenderGuard;
