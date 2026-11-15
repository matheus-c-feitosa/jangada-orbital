import { Component, type ReactNode } from 'react'

const RELOADED = 'jangada-reloaded-at'

/** Reloads the page once when a code chunk is missing: a deploy replaces every hashed file, so a page opened before it
 * asks for chunks that no longer exist (Vite docs, "Load Error Handling"). A second failure within a minute is left to
 * the LoadBoundary below, so a chunk that is really missing cannot reload the page in a loop. */
export function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOADED) ?? 0)
    if (Date.now() - last < 60_000) return false
    sessionStorage.setItem(RELOADED, String(Date.now()))
  } catch {
    return false // storage blocked: no way to tell a loop from a first try
  }
  window.location.reload()
  return true
}

/** Shows `fallback` instead of a blank page when a lazy part of the page (the map, the Method page) fails to load. */
export class LoadBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    console.warn('part of the page could not load:', error.message)
    if (/dynamically imported module|Importing a module script failed|error loading dynamically/i.test(error.message)) reloadOnce()
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
