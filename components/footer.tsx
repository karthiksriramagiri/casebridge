import Link from "next/link";
import { Logo, Mail, Pin } from "@/components/site/primitives";

const columns = [
  {
    heading: "Site",
    links: [
      { label: "Case types", href: "#case-types" },
      { label: "Why exclusive", href: "#why-us" },
      { label: "Process", href: "#process" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy policy", href: "/privacy" },
      { label: "Terms of service", href: "/terms" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="cb-dark" style={{ background: "var(--cb-slate-2)" }}>
      <div className="cb-wrap" style={{ paddingBlock: "clamp(3rem, 6vw, 4.5rem)" }}>
        <div className="grid gap-x-12 gap-y-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Link href="/" aria-label="Case Bridge — home" className="inline-block">
              {/* The wordmark is near-black, so on a slate ground it needs the
                  standard reversed treatment. Filtering the single asset keeps
                  one file to maintain rather than a second that can drift. */}
              <Logo
                className="h-[30px] w-auto"
                style={{ filter: "brightness(0) invert(1)", opacity: 0.88 }}
              />
            </Link>
            <p
              className="mt-6 text-[0.875rem] leading-[1.66]"
              style={{ color: "rgba(255,255,255,0.5)", maxWidth: "28rem" }}
            >
              Pre-qualified, exclusive motor vehicle accident cases delivered to
              personal injury attorneys. Every case is screened, verified, and
              sent to one firm only.
            </p>
          </div>

          <div className="lg:col-span-3">
            <p className="cb-label">Contact</p>
            <div className="mt-4 flex flex-col gap-3">
              <a
                href="mailto:sales@case-bridge.com"
                className="flex items-center gap-2.5 text-[0.875rem] transition-colors"
                style={{ color: "rgba(255,255,255,0.62)" }}
              >
                <Mail />
                sales@case-bridge.com
              </a>
              <span
                className="flex items-center gap-2.5 text-[0.875rem]"
                style={{ color: "rgba(255,255,255,0.62)" }}
              >
                <Pin />
                Atlanta, GA
              </span>
            </div>
          </div>

          {columns.map((col) => (
            <div key={col.heading} className="lg:col-span-2">
              <p className="cb-label">{col.heading}</p>
              <ul className="mt-4 flex flex-col gap-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-[0.875rem] transition-colors"
                      style={{ color: "rgba(255,255,255,0.62)" }}
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <hr className="cb-rule mt-14" />

        <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <p className="text-[0.75rem]" style={{ color: "rgba(255,255,255,0.32)" }}>
            © {new Date().getFullYear()} Case Bridge. All rights reserved.
          </p>
          <p
            className="text-[0.6875rem] leading-[1.6]"
            style={{ color: "rgba(255,255,255,0.28)", maxWidth: "46rem" }}
          >
            Case Bridge is a case generation service and does not provide legal
            advice. We are not a law firm and do not represent clients. All cases
            are provided to licensed attorneys and law firms in compliance with
            applicable regulations. Individual results may vary.
          </p>
        </div>
      </div>
    </footer>
  );
}
