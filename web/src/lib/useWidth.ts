import { useLayoutEffect, useState } from 'react'

/**
 * Width in CSS pixels of the element passed to the returned callback ref; follows resizes. Lets an SVG draw at 1:1, so
 * its text keeps its size. The element may mount later than the hook (a component that renders null at first).
 */
export function useWidth<T extends HTMLElement>(initial = 640) {
  const [element, setElement] = useState<T | null>(null)
  const [width, setWidth] = useState(initial)
  useLayoutEffect(() => {
    if (!element) return
    setWidth(Math.round(element.getBoundingClientRect().width))
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])
  return [setElement, width] as const
}
