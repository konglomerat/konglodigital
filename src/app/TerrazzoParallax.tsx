"use client";

import { useEffect } from "react";

/**
 * Verschiebt die Terrazzo-Hintergründe leicht mit der Mausbewegung.
 * Schreibt --terrazzo-mx / --terrazzo-my (jeweils -1 … 1) auf <html>,
 * die CSS in background-position umrechnet.
 */
export default function TerrazzoParallax() {
  useEffect(() => {
    const root = document.documentElement;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let x = 0;
    let y = 0;

    const apply = () => {
      frame = 0;
      root.style.setProperty("--terrazzo-mx", String(x));
      root.style.setProperty("--terrazzo-my", String(y));
    };

    const onMove = (event: MouseEvent) => {
      x = (event.clientX / window.innerWidth) * 2 - 1;
      y = (event.clientY / window.innerHeight) * 2 - 1;
      if (!frame) frame = window.requestAnimationFrame(apply);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (frame) window.cancelAnimationFrame(frame);
      root.style.removeProperty("--terrazzo-mx");
      root.style.removeProperty("--terrazzo-my");
    };
  }, []);

  return null;
}
