"use client";

import { useEffect, useRef, useState } from "react";
import { Reveal } from "@/components/site/primitives";

const steps = [
  {
    title: "Acquisition",
    description:
      "Campaigns across search, social, and partner networks reach people who have just been in a collision and are looking for counsel.",
  },
  {
    title: "Screening",
    description:
      "A trained intake specialist verifies the accident, the injuries, the treatment status, and the insurance position on a recorded call.",
  },
  {
    title: "Delivery",
    description:
      "The case goes to your firm and no one else — live warm transfer, straight into your CRM, or waiting in your portal.",
  },
  {
    title: "Optimisation",
    description:
      "Your conversion data feeds back into targeting and qualifying criteria, so the cases you get in month six beat the ones from month one.",
  },
];

/* The four piers meet the steel span at these points. Both the arc and the
   piers live in one SVG so they cannot drift apart at any viewport width —
   the alternative, positioning HTML rules against a stretched SVG, is exactly
   the kind of thing that survives the desktop breakpoint and nothing else. */
const PIERS = [
  { x: 150, y: 101 },
  { x: 450, y: 60 },
  { x: 750, y: 60 },
  { x: 1050, y: 101 },
];

export function Process() {
  const ref = useRef<SVGSVGElement | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    /* Same units problem as the hero span: non-scaling-stroke resolves the
       dash in screen pixels while getTotalLength() reports user units, so the
       measured length has to be scaled by the viewBox factor or the line
       stops short of its own end. The SVG is height:auto, which keeps x and y
       on the same scale, so one factor covers both. */
    const applyLengths = () => {
      const scale = el.getBoundingClientRect().width / 1200;
      for (const p of Array.from(
        el.querySelectorAll<SVGPathElement | SVGLineElement>("path, line"),
      )) {
        const len = Math.ceil((p as SVGPathElement).getTotalLength() * (scale || 1));
        p.style.setProperty("--len", String(len));
      }
    };
    applyLengths();
    const ro = new ResizeObserver(applyLengths);
    ro.observe(el);

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
    } else {
      io = new IntersectionObserver(
        ([e]) => {
          if (e.isIntersecting) {
            setSeen(true);
            io?.disconnect();
          }
        },
        { threshold: 0.2 },
      );
      io.observe(el);
    }

    return () => {
      ro.disconnect();
      io?.disconnect();
    };
  }, []);

  return (
    <section id="process" className="cb-dark cb-section relative overflow-hidden">
      <div className="cb-grid-bg" aria-hidden="true" style={{ opacity: 0.6 }} />

      <div className="cb-wrap relative">
        <div className="cb-head">
          <Reveal className="cb-head-top">
            <span className="cb-index">03</span>
            <span className="cb-label">How it works</span>
            <span className="cb-head-rule" aria-hidden="true" />
          </Reveal>
          <Reveal delay={60}>
            <h2 className="cb-h2" style={{ color: "#fff" }}>
              From collision to retained case.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <p className="cb-lead" style={{ maxWidth: "36rem" }}>
              Four stages, and a case has to clear all of them. Most do not — which
              is the point.
            </p>
          </Reveal>
        </div>

        {/* ── The span, on wide screens ──────────────────────────────────── */}
        <div className="mt-20 hidden lg:block">
          <svg
            ref={ref}
            viewBox="0 0 1200 150"
            preserveAspectRatio="none"
            aria-hidden="true"
            className={`cb-arc cb-arc-draw ${seen ? "is-in" : ""}`}
          >
            {/* Lower span — steel */}
            <path
              d="M0 148 C 300 24, 900 24, 1200 148"
              stroke="var(--cb-steel-2)"
              strokeWidth={1.6}
            />
            {/* Upper span — ember, as in the mark */}
            <path
              d="M0 150 C 300 -4, 900 -4, 1200 150"
              stroke="var(--cb-ember)"
              strokeWidth={1.6}
              opacity={0.85}
              style={{ ["--cb-delay" as string]: "160ms" }}
            />
            {/* Piers down to the deck */}
            {PIERS.map((p, i) => (
              <line
                key={p.x}
                x1={p.x}
                y1={p.y}
                x2={p.x}
                y2={150}
                stroke="rgba(255,255,255,0.22)"
                strokeWidth={1}
                style={{ ["--cb-delay" as string]: `${700 + i * 90}ms` }}
              />
            ))}
          </svg>
        </div>

        {/* ── The deck ───────────────────────────────────────────────────── */}
        <div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:mt-0 lg:grid-cols-4 lg:gap-x-8">
          {steps.map((s, i) => (
            <Reveal key={s.title} delay={i * 80}>
              <div
                className="relative pt-6"
                style={{ borderTop: "1px solid var(--cb-line-dark-2)" }}
              >
                <div className="flex items-baseline gap-3">
                  <span className="cb-index">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="cb-h3" style={{ color: "#fff" }}>
                    {s.title}
                  </h3>
                </div>
                <p
                  className="mt-3 text-[0.875rem] leading-[1.62]"
                  style={{ color: "rgba(255,255,255,0.55)" }}
                >
                  {s.description}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
