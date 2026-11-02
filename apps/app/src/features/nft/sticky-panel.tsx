"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

/** Just under the page header. */
const HEADER_GAP = 80;
const BOTTOM_GAP = 24;

/**
 * Where a side panel sticks. One that fits stays under the header; a taller
 * one scrolls with the page until its bottom shows, then stays, so nothing in
 * it is ever out of reach.
 */
export const stickyTop = (panelHeight: number, viewportHeight: number) =>
  Math.min(HEADER_GAP, viewportHeight - panelHeight - BOTTOM_GAP);

export function StickyPanel({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  const [top, setTop] = useState(HEADER_GAP);

  useEffect(() => {
    const element = panel.current;
    if (!element) return;
    const measure = () => setTop(stickyTop(element.offsetHeight, window.innerHeight));
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <aside ref={panel} id={id} className={className} style={{ top }}>
      {children}
    </aside>
  );
}
