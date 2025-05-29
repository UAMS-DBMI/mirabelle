
/**
 * ErrorBoundary component to catch JavaScript errors in child components
 * and display a fallback UI instead of crashing the entire app.
 *
 * Usage:
 * Wrap your application or specific components with <ErrorBoundary>
 */

import React from 'react';
import './ErrorBoundary.css';


export default class ErrorBoundary extends React.Component {
    state = { hasError: false, error: null };

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        console.error('Uncaught error:', error, info);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div id="error-boundary">
                    <h1>Something went wrong.</h1>
                    <pre>{this.state.error.message}</pre>
                </div>
            );
        }
        return this.props.children;
    }
}