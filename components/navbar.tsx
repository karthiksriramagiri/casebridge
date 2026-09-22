"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Close, Logo, Menu } from "@/components/site/primitives";

const CALENDLY = "https://calendly.com/case-bridge-sales/30min";

const navLinks = [
  { label: "Case types", href: "#case-types" },
  { label: "Why exclusive", href: "#why-us" },
  { label: "Process", href: "#process" },
  { label: "FAQ", href: "#faq" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  /* The bar starts transparent over the dark hero and only takes on the paper
     material once it is over paper. That means its contents have to invert
     too — a slate wordmark and slate links on a slate hero are invisible,
     which is what happens if only the background is made conditional. */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const close = () => setOpen(false);
    mq.addEventListener("change", close);
    return () => mq.removeEventListener("change", close);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Over the hero, or with the mobile panel open, the bar is on a dark ground.
  const onDark = !scrolled && !open;

  const linkColor = onDark ? "rgba(255,255,255,0.72)" : "var(--cb-ink-2)";
  const linkHover = onDark ? "#ffffff" : "var(--cb-ink)";

  return (
    <header
      className="sticky top-0 z-50"
      style={{
        /* Sticky keeps the bar in flow, so at the top of the page it sits
           above the hero rather than over it. Painting it the hero's own
           slate makes the two read as one block; leaving it transparent put
           white type on the paper ground behind it, where it vanished. */
        background: onDark ? "var(--cb-slate)" : "rgba(246, 244, 240, 0.82)",
        backdropFilter: onDark ? "none" : "blur(16px) saturate(1.6)",
        WebkitBackdropFilter: onDark ? "none" : "blur(16px) saturate(1.6)",
        borderBottom: `1px solid ${onDark ? "transparent" : "var(--cb-line)"}`,
        transition:
          "background-color 320ms var(--cb-ease), border-color 320ms var(--cb-ease)",
      }}
    >
      <div className="cb-wrap flex h-[76px] items-center gap-6">
        <Link href="/" aria-label="Case Bridge — home" className="flex shrink-0 items-center">
          <Logo
            priority
            className="h-[26px] w-auto sm:h-[30px]"
            style={{
              filter: onDark ? "brightness(0) invert(1)" : "none",
              opacity: onDark ? 0.92 : 1,
              transition: "filter 320ms var(--cb-ease), opacity 320ms var(--cb-ease)",
            }}
          />
        </Link>

        <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="Main">
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3.5 py-2 text-[0.9375rem] font-medium"
              style={{ color: linkColor, transition: "color 200ms var(--cb-ease)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = linkHover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = linkColor;
              }}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2.5 lg:flex">
          <a
            href="#contact"
            className="cb-btn"
            style={{
              height: "2.5rem",
              background: "transparent",
              color: onDark ? "rgba(255,255,255,0.88)" : "var(--cb-ink)",
              borderColor: onDark ? "rgba(255,255,255,0.22)" : "var(--cb-line-2)",
            }}
          >
            Contact
          </a>
          <a
            href={CALENDLY}
            target="_blank"
            rel="noopener noreferrer"
            className="cb-btn cb-btn-primary"
            style={{ height: "2.5rem" }}
          >
            Book a call
            <ArrowRight className="cb-arrow" />
          </a>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          className="ml-auto grid h-10 w-10 place-items-center rounded-md lg:hidden"
          style={{
            border: `1px solid ${onDark ? "rgba(255,255,255,0.22)" : "var(--cb-line-2)"}`,
            color: onDark ? "#fff" : "var(--cb-ink)",
          }}
        >
          {open ? <Close /> : <Menu />}
        </button>
      </div>

      {open && (
        <div
          className="lg:hidden"
          style={{
            background: "var(--cb-paper)",
            borderTop: "1px solid var(--cb-line)",
            height: "calc(100dvh - 76px)",
          }}
        >
          <div className="cb-wrap flex h-full flex-col pt-2">
            <nav className="flex flex-col">
              {navLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="py-4 text-[1.125rem] font-medium"
                  style={{
                    borderBottom: "1px solid var(--cb-line)",
                    color: "var(--cb-ink)",
                  }}
                >
                  {l.label}
                </Link>
              ))}
            </nav>
            <div className="mt-6 flex flex-col gap-2.5">
              <a
                href={CALENDLY}
                target="_blank"
                rel="noopener noreferrer"
                className="cb-btn cb-btn-primary"
                onClick={() => setOpen(false)}
              >
                Book a call
                <ArrowRight className="cb-arrow" />
              </a>
              <a href="#contact" className="cb-btn cb-btn-ghost" onClick={() => setOpen(false)}>
                Send an enquiry
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
