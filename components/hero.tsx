import {
  ArrowRight,
  BridgeArc,
  Eye,
  Lock,
  Reveal,
  Scale,
  Shield,
} from "@/components/site/primitives";

const CALENDLY = "https://calendly.com/case-bridge-sales/30min";

/* The four tiles this replaces read "100% / Verified / Real-Time / Compliant"
   in display type — the shape of a statistics block with only one number in
   it. A specification table makes the same claims in a form that is checkable,
   which is what a firm evaluating a vendor is actually looking for. */
const specs = [
  { k: "Cases per firm", v: "One — never resold" },
  { k: "Screening", v: "4-stage, by trained intake" },
  { k: "Delivery", v: "Live transfer, CRM or portal" },
  { k: "Coverage", v: "All 50 states" },
];

const marks = [
  { Icon: Shield, label: "TCPA compliant" },
  { Icon: Scale, label: "ABA Model Rules" },
  { Icon: Eye, label: "Every case screened" },
  { Icon: Lock, label: "Documented consent" },
];

export function Hero() {
  return (
    <section className="cb-dark relative overflow-hidden" style={{ background: "var(--cb-slate)" }}>
      {/* A drawn texture rather than a stock photograph at 20% opacity. The
          photo behind the old headline was generic, its light trails cut
          diagonally through the type, and it fought the copy for attention. */}
      <div className="cb-grid-bg" aria-hidden="true" />

      <div
        className="cb-wrap relative"
        style={{
          paddingTop: "clamp(3.5rem, 7vw, 6rem)",
          paddingBottom: "clamp(3.5rem, 6vw, 5rem)",
        }}
      >
        <div className="grid gap-x-16 gap-y-14 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Reveal>
              <p className="cb-label" style={{ color: "var(--cb-steel-3)" }}>
                Exclusive MVA cases · Personal injury firms
              </p>
            </Reveal>

            <Reveal delay={70}>
              <h1 className="cb-display mt-6" style={{ color: "#fff" }}>
                Cases your firm
                <br />
                <span style={{ color: "var(--cb-steel-3)" }}>actually retains.</span>
              </h1>
            </Reveal>

            <Reveal delay={140}>
              <p className="cb-lead mt-7" style={{ maxWidth: "34rem" }}>
                We deliver pre-qualified motor vehicle accident claimants who are
                actively seeking representation — screened by our intake team,
                matched to your criteria, and sent to one firm only. Yours.
              </p>
            </Reveal>

            <Reveal delay={200}>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <a
                  href={CALENDLY}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cb-btn cb-btn-primary"
                >
                  Book a 30-minute call
                  <ArrowRight className="cb-arrow" />
                </a>
                <a href="#process" className="cb-btn cb-btn-ghost">
                  See how a case is screened
                </a>
              </div>
            </Reveal>
          </div>

          {/* Specification table */}
          <div className="lg:col-span-5">
            <Reveal delay={260}>
              <div className="cb-specs" style={{ borderTopColor: "var(--cb-line-dark-2)" }}>
                {specs.map((s) => (
                  <div className="cb-spec" key={s.k}>
                    <span className="cb-spec-k">{s.k}</span>
                    <span className="cb-spec-v">{s.v}</span>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal delay={320}>
              <div className="cb-marks mt-8">
                {marks.map(({ Icon, label }) => (
                  <span className="cb-mark" key={label}>
                    <Icon />
                    {label}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </div>

      {/* The mark is a bridge, so the section closes on one. Left in flow at
          its natural aspect ratio rather than absolutely positioned inside a
          fixed-height box: at 1440 the SVG rendered 180px tall in a 168px
          well and both ends were clipped short of the corners. In flow it
          lands on them exactly, at any width. */}
      <div className="relative" style={{ opacity: 0.6 }} aria-hidden="true">
        <BridgeArc strokeSteel={1.5} strokeEmber={1.5} emberOpacity={0.85} delay={280} />
      </div>
    </section>
  );
}
