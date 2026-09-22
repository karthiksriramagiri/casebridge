"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";

/* ═══════════════════════════════════════════════════════════════════════════
   Shared pieces for the marketing site.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Logo ───────────────────────────────────────────────────────────────────
   The source PNG is a 2000×2000 canvas holding a 1480×466 mark, so roughly
   four fifths of it is empty. The navbar compensated with `h-36` plus a
   `-my-12` negative margin to pull a 144px image back into a 68px bar — a
   hack that breaks the moment the bar height changes. The trimmed asset has
   the real aspect ratio, so height alone places it.                        */

export function Logo({ className = "", priority = false, style }: { className?: string; priority?: boolean; style?: React.CSSProperties }) {
  return (
    <Image
      src="/images/case-bridge-logo-trimmed.png"
      alt="Case Bridge"
      width={800}
      height={252}
      priority={priority}
      className={className}
      style={style}
    />
  );
}

/* ── Reveal ─────────────────────────────────────────────────────────────────
   Adds a class once the element has been seen, and then stops observing.
   Content is rendered and interactive from the first paint — this only moves
   it, so a failed observer or a reduced-motion preference costs nothing.   */

export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: React.ElementType;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={`cb-reveal ${seen ? "is-in" : ""} ${className}`}
      style={{ ["--cb-delay" as string]: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

/* ── Section header ─────────────────────────────────────────────────────── */

export function SectionHead({
  index,
  label,
  title,
  lead,
  className = "",
}: {
  index: string;
  label: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`cb-head ${className}`}>
      <Reveal className="cb-head-top">
        <span className="cb-index">{index}</span>
        <span className="cb-label">{label}</span>
        <span className="cb-head-rule" aria-hidden="true" />
      </Reveal>
      <Reveal delay={60}>
        <h2 className="cb-h2">{title}</h2>
      </Reveal>
      {lead && (
        <Reveal delay={120} className="cb-head-lead">
          <p className="cb-lead" style={{ maxWidth: "38rem" }}>
            {lead}
          </p>
        </Reveal>
      )}
    </div>
  );
}

/* ── The bridge ─────────────────────────────────────────────────────────────
   Two arcs, the same pair that sits above the wordmark: a steel span with an
   ember one riding above it. Drawn once when it scrolls into view.

   The path length is measured from the rendered node rather than guessed, so
   the dash animation is exact at any viewport width.                        */

export function BridgeArc({
  className = "",
  strokeSteel = 2,
  strokeEmber = 2,
  draw = true,
  delay = 0,
  emberOpacity = 1,
}: {
  className?: string;
  strokeSteel?: number;
  strokeEmber?: number;
  draw?: boolean;
  delay?: number;
  emberOpacity?: number;
}) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [seen, setSeen] = useState(!draw);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    /* The dash length has to be measured in the same units the browser will
       resolve it in. These paths carry `vector-effect: non-scaling-stroke`,
       which puts stroke *and dash* into screen units, while getTotalLength()
       reports user units. At 1440 the viewBox scale is 1.2, so an unscaled
       dash covered exactly 1/1.2 of the path and the arc stopped 17% short of
       the right edge — symmetric geometry, asymmetric paint. Re-measured on
       resize, since the scale moves with the viewport. */
    const applyLengths = () => {
      const scale = el.getBoundingClientRect().width / 1200;
      for (const p of Array.from(el.querySelectorAll("path"))) {
        const len = Math.ceil(p.getTotalLength() * (scale || 1));
        p.style.setProperty("--len", String(len));
      }
    };
    applyLengths();
    const ro = new ResizeObserver(applyLengths);
    ro.observe(el);

    let io: IntersectionObserver | null = null;
    if (draw) {
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
          { threshold: 0.15 },
        );
        io.observe(el);
      }
    }

    return () => {
      ro.disconnect();
      io?.disconnect();
    };
  }, [draw]);

  return (
    <svg
      ref={ref}
      viewBox="0 0 1200 150"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={`cb-arc ${draw ? "cb-arc-draw" : ""} ${seen ? "is-in" : ""} ${className}`}
      style={{ ["--cb-delay" as string]: `${delay}ms` }}
    >
      {/* Lower span — steel, the structural member */}
      <path
        d="M0 148 C 300 24, 900 24, 1200 148"
        stroke="var(--cb-steel-2)"
        strokeWidth={strokeSteel}
      />
      {/* Upper span — ember, riding above it exactly as in the mark */}
      <path
        d="M0 150 C 300 -4, 900 -4, 1200 150"
        stroke="var(--cb-ember)"
        strokeWidth={strokeEmber}
        opacity={emberOpacity}
      />
    </svg>
  );
}

/* ── Accordion ──────────────────────────────────────────────────────────────
   Height is measured off the panel's own content rather than animated to
   `auto`, which does not interpolate. Transitions rather than keyframes, so
   a rapid open/close retargets smoothly instead of restarting.             */

export function Accordion({
  items,
}: {
  items: { question: string; answer: string }[];
}) {
  const [open, setOpen] = useState<number | null>(0);
  const uid = useId();

  return (
    <div className="cb-acc">
      {items.map((item, i) => (
        <AccordionItem
          key={item.question}
          id={`${uid}-${i}`}
          item={item}
          open={open === i}
          onToggle={() => setOpen(open === i ? null : i)}
        />
      ))}
    </div>
  );
}

function AccordionItem({
  id,
  item,
  open,
  onToggle,
}: {
  id: string;
  item: { question: string; answer: string };
  open: boolean;
  onToggle: () => void;
}) {
  const inner = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => setHeight(el.scrollHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="cb-acc-item">
      <h3>
        <button
          type="button"
          className="cb-acc-trigger"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          id={`${id}-trigger`}
          onClick={onToggle}
        >
          {item.question}
          <span className="cb-acc-icon" aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
        </button>
      </h3>
      <div
        id={`${id}-panel`}
        role="region"
        aria-labelledby={`${id}-trigger`}
        className={`cb-acc-panel ${open ? "is-open" : ""}`}
        style={{ height: open ? height : 0 }}
      >
        <div ref={inner}>
          <p className="cb-body" style={{ maxWidth: "44rem" }}>
            {item.answer}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Icons ──────────────────────────────────────────────────────────────────
   Drawn here at one weight rather than pulled from lucide at four different
   sizes, so the set reads as a set.                                        */

type IconProps = { size?: number; className?: string; style?: React.CSSProperties };
const icon = (size: number, d: React.ReactNode) => {
  const C = (p: IconProps) => (
    <svg
      width={p.size ?? size}
      height={p.size ?? size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={p.className}
      style={p.style}
      aria-hidden="true"
    >
      {d}
    </svg>
  );
  return C;
};

export const ArrowRight = icon(16, <><path d="M5 12h13" /><path d="M13 6l6 6-6 6" /></>);
export const Check = icon(14, <path d="M4.5 12.5l5 5 10-11" />);
export const Shield = icon(15, <><path d="M12 22s8-3.6 8-10V5.4L12 2.4 4 5.4V12c0 6.4 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></>);
export const Scale = icon(15, <><path d="M12 3v18" /><path d="M6 21h12" /><path d="M4 8l4-3 4 3" /><path d="M12 8l4-3 4 3" /><path d="M4 8l-2 5a3.2 3.2 0 0 0 6.4 0L6 8" /><path d="M16 8l-2 5a3.2 3.2 0 0 0 6.4 0L18 8" /></>);
export const Lock = icon(15, <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>);
export const Eye = icon(15, <><path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="2.6" /></>);
export const Quote = icon(24, <path d="M9.5 6C6.4 7.4 4.5 10.3 4.5 13.8V18h5.8v-5.8H7.4c0-2 .9-3.5 2.6-4.4L9.5 6zm9 0c-3.1 1.4-5 4.3-5 7.8V18h5.8v-5.8h-2.9c0-2 .9-3.5 2.6-4.4L18.5 6z" />);
export const Plus = icon(14, <><path d="M12 5v14" /><path d="M5 12h14" /></>);
export const Menu = icon(20, <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>);
export const Close = icon(20, <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>);
export const Mail = icon(15, <><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M3 6.5l9 6 9-6" /></>);
export const Pin = icon(15, <><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.4" /></>);
export const Clock = icon(15, <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.2 1.9" /></>);
