import React from "react";
import { Button } from "@/components/ui/button";

// Added 2026-08-18: no ErrorBoundary existed anywhere in this app before this. Every save/
// delete handler that could throw was audited and fixed separately (see reportError.js's
// header + docs/ai-memory/KNOWN_ISSUES.md), but that only covers async handler errors --
// React error boundaries are the only mechanism that can catch a genuine *render-time*
// exception (e.g. a null-dereference from unexpected API data shape). Without this, any such
// crash previously unmounted the whole app to a blank white screen. Wrapped once around the
// whole routed app in App.jsx -- a single boundary is deliberately simpler than one per page;
// per-route boundaries could be added later if a specific page's crash should not take down
// unrelated UI (e.g. a persistent sidebar), but nothing in this app currently has that shape.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("Unhandled render error caught by ErrorBoundary:", error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-background p-6">
          <div className="max-w-sm w-full text-center space-y-4">
            <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              This page hit an unexpected error. Your data is safe -- nothing was lost, this
              screen just couldn't display it correctly.
            </p>
            <Button onClick={() => { this.setState({ error: null }); window.location.href = "/"; }}>
              Reload
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
