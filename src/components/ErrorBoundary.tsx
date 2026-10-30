/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Synaptron Uncaught Component Error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetAndReload = () => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('synaptron_working_memory_24h');
        localStorage.removeItem('synaptron_tabula_rasa_mode');
      }
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.clear();
      }
    } catch {
      // Ignore
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#04060b] text-slate-100 flex items-center justify-center p-4 font-sans selection:bg-sky-500 selection:text-white">
          <div className="max-w-lg w-full bg-[#090d18] border border-rose-900/60 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-rose-950/80 border border-rose-600/50 flex items-center justify-center text-rose-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white tracking-wide">
                  Synaptron Recovery Interface
                </h2>
                <p className="text-xs text-slate-400">
                  An unexpected runtime exception was intercepted safely.
                </p>
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 rounded p-3 text-xs font-mono text-rose-300 max-h-40 overflow-y-auto leading-relaxed">
              {this.state.error?.message || 'Unknown runtime error occurred during rendering.'}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={this.handleReload}
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium flex items-center gap-2 cursor-pointer transition-colors shadow-md"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload Application</span>
              </button>
              <button
                onClick={this.handleResetAndReload}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-white border border-slate-700 hover:border-rose-700/60 text-xs font-medium flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>Clear Cache &amp; Reset</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
