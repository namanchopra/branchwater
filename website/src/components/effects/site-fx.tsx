"use client";

import { useEffect } from "react";

/** A drifting node in the constellation. */
interface Pt {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  br: boolean;
}

/**
 * The site's animated backdrop + all cursor/scroll interactions, kept in a
 * single client island so the section markup can stay server-rendered.
 *
 * Renders the node-constellation `<canvas>`, the aurora layers, and the grain
 * overlay; on mount it wires up (all disabled under `prefers-reduced-motion`):
 *  - the live, cursor-reactive constellation (re-coloured on theme change),
 *  - scroll-reveal, count-up stats, and the self-typing terminal,
 *  - cursor-spotlight + 3D tilt on cards, magnetic buttons, and hero parallax.
 *
 * Everything is registered against a single AbortController signal (plus a
 * tracked rAF id and IntersectionObserver) so React strict-mode's double-invoke
 * and unmount both tear down cleanly with no duplicate listeners.
 */
export function SiteFx() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ac = new AbortController();
    const sig = ac.signal;
    let rafId = 0;
    let io: IntersectionObserver | null = null;

    /* ---------------- reveal + count-up + terminal typing ---------------- */
    const items = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));

    const countUp = (el: HTMLElement) => {
      const target = parseFloat(el.dataset.count ?? "");
      if (isNaN(target)) return;
      const suf = el.dataset.suffix ?? "";
      const pre = el.dataset.prefix ?? "";
      let t0: number | null = null;
      const dur = 1100;
      const step = (ts: number) => {
        if (t0 === null) t0 = ts;
        const k = Math.min(1, (ts - t0) / dur);
        el.textContent = pre + Math.round((1 - Math.pow(1 - k, 3)) * target) + suf;
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const typeTerm = () => {
      const lines = Array.from(document.querySelectorAll<HTMLElement>("#termbody .tline"));
      let i = 0;
      const next = () => {
        if (i >= lines.length || sig.aborted) return;
        lines[i].classList.add("show");
        i++;
        setTimeout(next, 170);
      };
      next();
    };

    if (reduce || !("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("in"));
      document.querySelectorAll("#termbody .tline").forEach((l) => l.classList.add("show"));
      document.querySelectorAll<HTMLElement>(".stat .n[data-count]").forEach((el) => {
        el.textContent = (el.dataset.prefix ?? "") + (el.dataset.count ?? "") + (el.dataset.suffix ?? "");
      });
    } else {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (!e.isIntersecting) return;
            const t = e.target as HTMLElement;
            t.classList.add("in");
            io?.unobserve(t);
            if (t.classList.contains("trust")) t.querySelectorAll<HTMLElement>(".n[data-count]").forEach(countUp);
            if (t.id === "term") typeTerm();
          });
        },
        { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
      );
      items.forEach((el, i) => {
        el.style.transitionDelay = `${Math.min(i, 6) * 40}ms`;
        io?.observe(el);
      });
    }

    /* ---------------------- node constellation --------------------------- */
    const cv = document.getElementById("fx") as HTMLCanvasElement | null;
    const ctx = cv ? cv.getContext("2d") : null;
    if (cv && ctx && !reduce) {
      let W = 0;
      let H = 0;
      let DPR = 1;
      let pts: Pt[] = [];
      const mouse = { x: -9999, y: -9999 };
      const col = { line: "", dot: "", branch: "" };
      let running = true;

      const readColors = () => {
        const s = getComputedStyle(document.documentElement);
        col.line = s.getPropertyValue("--fx-line").trim();
        col.dot = s.getPropertyValue("--fx-dot").trim();
        col.branch = s.getPropertyValue("--fx-branch").trim();
      };
      readColors();

      const resize = () => {
        DPR = Math.min(window.devicePixelRatio || 1, 2);
        W = window.innerWidth;
        H = window.innerHeight;
        cv.width = W * DPR;
        cv.height = H * DPR;
        cv.style.width = `${W}px`;
        cv.style.height = `${H}px`;
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        const n = Math.max(36, Math.min(108, Math.round((W * H) / 15000)));
        pts = [];
        for (let i = 0; i < n; i++) {
          pts.push({
            x: Math.random() * W,
            y: Math.random() * H,
            vx: (Math.random() - 0.5) * 0.35,
            vy: (Math.random() - 0.5) * 0.35,
            r: Math.random() < 0.16 ? 2.4 : 1.4,
            br: Math.random() < 0.16,
          });
        }
      };
      resize();

      const D = 132;
      const MD = 190;
      const loop = () => {
        if (!running) return;
        ctx.clearRect(0, 0, W, H);
        for (const p of pts) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0 || p.x > W) p.vx *= -1;
          if (p.y < 0 || p.y > H) p.vy *= -1;
          const dxm = p.x - mouse.x;
          const dym = p.y - mouse.y;
          const dm = Math.hypot(dxm, dym);
          if (dm < MD && dm > 0) {
            p.x += (dxm / dm) * 0.5;
            p.y += (dym / dm) * 0.5;
          }
        }
        for (let a = 0; a < pts.length; a++) {
          for (let b = a + 1; b < pts.length; b++) {
            const dx = pts[a].x - pts[b].x;
            const dy = pts[a].y - pts[b].y;
            const d = Math.hypot(dx, dy);
            if (d < D) {
              ctx.strokeStyle = `rgba(${col.line},${(0.9 * (1 - d / D)).toFixed(3)})`;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(pts[a].x, pts[a].y);
              ctx.lineTo(pts[b].x, pts[b].y);
              ctx.stroke();
            }
          }
        }
        for (const q of pts) {
          const dmm = Math.hypot(q.x - mouse.x, q.y - mouse.y);
          if (dmm < MD) {
            ctx.strokeStyle = `rgba(${col.branch},${(0.5 * (1 - dmm / MD)).toFixed(3)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(q.x, q.y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();
          }
          ctx.fillStyle = q.br ? `rgba(${col.branch},.95)` : `rgba(${col.dot},.8)`;
          ctx.beginPath();
          ctx.arc(q.x, q.y, q.r, 0, 6.2832);
          ctx.fill();
        }
        rafId = requestAnimationFrame(loop);
      };
      loop();

      window.addEventListener("resize", resize, { signal: sig });
      window.addEventListener("pointermove", (e) => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
      }, { signal: sig });
      window.addEventListener("pointerleave", () => {
        mouse.x = mouse.y = -9999;
      }, { signal: sig });
      window.addEventListener("bw-theme", readColors, { signal: sig });
      document.addEventListener("visibilitychange", () => {
        running = !document.hidden;
        if (running) loop();
      }, { signal: sig });
    } else if (cv) {
      cv.style.display = "none";
    }

    /* ------------- card spotlight + tilt, magnetic, parallax ------------- */
    if (!reduce && window.matchMedia("(pointer:fine)").matches) {
      document.querySelectorAll<HTMLElement>(".card").forEach((card) => {
        card.addEventListener("pointermove", (e) => {
          const r = card.getBoundingClientRect();
          const x = e.clientX - r.left;
          const y = e.clientY - r.top;
          card.style.setProperty("--mx", `${x}px`);
          card.style.setProperty("--my", `${y}px`);
          if (card.classList.contains("tilt")) {
            const rx = (y / r.height - 0.5) * -6;
            const ry = (x / r.width - 0.5) * 6;
            card.style.transform = `perspective(800px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateY(-4px)`;
          }
        }, { signal: sig });
        card.addEventListener("pointerleave", () => {
          card.style.transform = "";
        }, { signal: sig });
      });

      document.querySelectorAll<HTMLElement>("[data-magnetic]").forEach((b) => {
        b.addEventListener("pointermove", (e) => {
          const r = b.getBoundingClientRect();
          b.style.transform = `translate(${((e.clientX - (r.left + r.width / 2)) * 0.25).toFixed(1)}px,${((e.clientY - (r.top + r.height / 2)) * 0.3).toFixed(1)}px)`;
        }, { signal: sig });
        b.addEventListener("pointerleave", () => {
          b.style.transform = "";
        }, { signal: sig });
      });

      const mock = document.getElementById("mock");
      if (mock && window.innerWidth > 880) {
        let mraf = 0;
        window.addEventListener("pointermove", (e) => {
          if (mraf) return;
          mraf = requestAnimationFrame(() => {
            mraf = 0;
            const rx = 13 - (e.clientY / window.innerHeight - 0.5) * 6;
            const ry = -8 + (e.clientX / window.innerWidth - 0.5) * 9;
            mock.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
          });
        }, { signal: sig });
      }
    }

    return () => {
      ac.abort();
      if (rafId) cancelAnimationFrame(rafId);
      io?.disconnect();
    };
  }, []);

  return (
    <>
      <div className="bg-layer aurora" aria-hidden="true" />
      <div className="aurora-3" aria-hidden="true" />
      <canvas id="fx" aria-hidden="true" />
      <div className="bg-layer noise" aria-hidden="true" />
    </>
  );
}
