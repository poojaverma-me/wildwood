"use client";

import { Component, Suspense, type ReactNode } from "react";

/** Streams a piece of the world in, and quietly leaves it out if its assets fail to load. */
class Boundary extends Component<{ children: ReactNode; name: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    console.warn(`[wildwood] ${this.props.name} failed to load`, e);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function Safe({ name, children }: { name: string; children: ReactNode }) {
  return (
    <Boundary name={name}>
      <Suspense fallback={null}>{children}</Suspense>
    </Boundary>
  );
}
