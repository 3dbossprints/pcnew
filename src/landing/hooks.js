import { useEffect, useRef } from "react";

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function useRevealOnScroll() {
  useEffect(() => {
    const nodes = document.querySelectorAll("[data-reveal]");
    if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
      nodes.forEach((node) => node.classList.add("is-in"));
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
}

export function useTilt(strength = 7) {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || prefersReducedMotion() || window.matchMedia("(hover: none)").matches) return undefined;
    let raf = 0;
    function onMove(event) {
      const rect = node.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        node.style.setProperty("--rx", (-y * strength).toFixed(2) + "deg");
        node.style.setProperty("--ry", (x * strength).toFixed(2) + "deg");
        node.style.setProperty("--mx", ((x + 0.5) * 100).toFixed(1) + "%");
        node.style.setProperty("--my", ((y + 0.5) * 100).toFixed(1) + "%");
      });
    }
    function onLeave() {
      cancelAnimationFrame(raf);
      node.style.setProperty("--rx", "0deg");
      node.style.setProperty("--ry", "0deg");
    }
    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerleave", onLeave);
    };
  }, [strength]);
  return ref;
}
