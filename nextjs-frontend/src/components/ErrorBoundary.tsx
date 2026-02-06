'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
        };
    }

    static getDerivedStateFromError(error: Error): State {
        // Update state so the next render will show the fallback UI
        return {
            hasError: true,
            error,
            errorInfo: null,
        };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // Log error details for debugging
        console.error('Error Boundary caught an error:', error);
        console.error('Error Info:', errorInfo);

        // Update state with error details
        this.setState({
            error,
            errorInfo,
        });

        // You can also log to an error reporting service here
        // Example: logErrorToService(error, errorInfo);
    }

    handleReset = () => {
        // Reset error state
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
        });
    };

    handleReload = () => {
        // Reload the page
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                    <div className="max-w-2xl w-full bg-white rounded-2xl shadow-2xl p-8 border border-gray-200">
                        {/* Error Icon */}
                        <div className="flex justify-center mb-6">
                            <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center">
                                <svg
                                    className="w-10 h-10 text-rose-600"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                    />
                                </svg>
                            </div>
                        </div>

                        {/* Error Message */}
                        <div className="text-center mb-8">
                            <h1 className="text-3xl font-bold text-gray-900 mb-3">
                                Oops! Something went wrong
                            </h1>
                            <p className="text-gray-600 text-lg mb-2">
                                We encountered an unexpected error. Don't worry, your data is safe.
                            </p>
                            <p className="text-gray-500 text-sm">
                                Try reloading the page or contact support if the problem persists.
                            </p>
                        </div>

                        {/* Error Details (Development Mode) */}
                        {process.env.NODE_ENV === 'development' && this.state.error && (
                            <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
                                <p className="text-sm font-semibold text-gray-700 mb-2">
                                    Error Details (Development Only):
                                </p>
                                <p className="text-xs text-red-600 font-mono mb-2">
                                    {this.state.error.toString()}
                                </p>
                                {this.state.errorInfo && (
                                    <details className="text-xs text-gray-600 font-mono">
                                        <summary className="cursor-pointer text-gray-700 font-semibold mb-1">
                                            Component Stack
                                        </summary>
                                        <pre className="whitespace-pre-wrap break-words bg-white p-2 rounded border border-gray-200 mt-2">
                                            {this.state.errorInfo.componentStack}
                                        </pre>
                                    </details>
                                )}
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex flex-col sm:flex-row gap-3">
                            <button
                                onClick={this.handleReload}
                                className="flex-1 px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-all duration-200 shadow-lg hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                            >
                                Reload Page
                            </button>
                            <button
                                onClick={this.handleReset}
                                className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                            >
                                Try Again
                            </button>
                        </div>

                        {/* Additional Help */}
                        <div className="mt-6 pt-6 border-t border-gray-200 text-center">
                            <p className="text-sm text-gray-600">
                                Need help?{' '}
                                <a
                                    href="/"
                                    className="text-emerald-600 hover:text-emerald-700 font-semibold hover:underline"
                                >
                                    Go to Dashboard
                                </a>
                            </p>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
