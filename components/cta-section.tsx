import { ArrowRight, BridgeArc, Reveal } from "@/components/site/primitives";

const CALENDLY = "https://calendly.com/case-bridge-sales/30min";

export function CtaSection() {
  return (
    <section className="cb-dark relative overflow-hidden" style={{ paddingBlock: "clamp(4.5rem, 8vw, 7rem)" }}>
      <div className="cb-grid-bg" aria-hidden="true" style={{ opacity: 0.5 }} />

      {/* The span closes the page the way it opened it. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0"
        style={{ height: "clamp(120px, 18vw, 220px)", opacity: 0.35, transform: "rotate(180deg)" }}
        aria-hidden="true"
      >
        <BridgeArc className="h-full" strokeSteel={1.4} strokeEmber={1.4} emberOpacity={0.8} />
      </div>

      <div className="cb-wrap relative">
        <div className="grid items-end gap-x-16 gap-y-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Reveal>
              <h2 className="cb-h2" style={{ color: "#fff", maxWidth: "20ch" }}>
                Tell us what a good case looks like to you.
              </h2>
            </Reveal>
            <Reveal delay={80}>
              <p className="cb-lead mt-6" style={{ maxWidth: "34rem" }}>
                Thirty minutes. Bring your case criteria, your target
                jurisdictions, and the volume you can actually work. We will tell
                you honestly whether we can supply it.
              </p>
            </Reveal>
          </div>

          <div className="lg:col-span-5">
            <Reveal delay={140}>
              <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
                <a
                  href={CALENDLY}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cb-btn cb-btn-primary"
                >
                  Book a 30-minute call
                  <ArrowRight className="cb-arrow" />
                </a>
                <a href="#contact" className="cb-btn cb-btn-ghost">
                  Send an enquiry
                </a>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
