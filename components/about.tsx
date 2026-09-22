import Image from "next/image";
import { ArrowRight, Check, Reveal } from "@/components/site/primitives";

const CALENDLY = "https://calendly.com/case-bridge-sales/30min";

const indicators = [
  "Matched to your firm's qualifying criteria, not a generic filter",
  "One firm per case — your prospect speaks only with your team",
  "Live transfer, CRM integration, or secure portal, your choice",
  "Acquisition across search, social, and partner networks",
  "Targeting by state, metro, or county",
  "A named account manager who reviews your conversion data",
];

export function About() {
  return (
    <section id="why-us" className="cb-section" style={{ background: "var(--cb-paper-2)" }}>
      <div className="cb-wrap">
        <div className="grid gap-x-16 gap-y-12 lg:grid-cols-12">
          {/* The argument, given the room to be an argument */}
          <div className="lg:col-span-7">
            <Reveal className="cb-head-top">
              <span className="cb-index">02</span>
              <span className="cb-label">Why exclusive</span>
              <span className="cb-head-rule" aria-hidden="true" />
            </Reveal>

            <Reveal delay={60}>
              <h2 className="cb-h2 mt-7">
                Most providers sell the same claimant to four firms.
                <span style={{ color: "var(--cb-steel)" }}> We sell to one.</span>
              </h2>
            </Reveal>

            <Reveal delay={120}>
              <p className="cb-lead mt-9" style={{ maxWidth: "36rem" }}>
                When a case is shared, you are not competing on the merits of your
                firm — you are competing on who dials first. Conversion collapses,
                and your cost per retained case is set by someone else's call
                centre.
              </p>
            </Reveal>

            <Reveal delay={170}>
              <p className="cb-body mt-6" style={{ maxWidth: "36rem" }}>
                Every case we deliver has been screened by our intake team against
                the criteria you define, and is sent to your practice alone. The
                result is a higher conversion rate, a lower cost per retained case,
                and attorneys spending their time on litigation rather than
                prospecting.
              </p>
            </Reveal>

            <Reveal delay={220}>
              <ul className="mt-9 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {indicators.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-[3px] grid shrink-0 place-items-center rounded-full"
                      style={{
                        width: 18,
                        height: 18,
                        background: "rgba(47, 88, 120, 0.1)",
                        color: "var(--cb-steel)",
                      }}
                    >
                      <Check size={11} />
                    </span>
                    <span
                      className="text-[0.875rem] leading-[1.5]"
                      style={{ color: "var(--cb-ink-2)" }}
                    >
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={270}>
              <div className="mt-10">
                <a
                  href={CALENDLY}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cb-btn cb-btn-ink"
                >
                  Talk to us about your criteria
                  <ArrowRight className="cb-arrow" />
                </a>
              </div>
            </Reveal>
          </div>

          {/* One photograph, used at full strength instead of four at 20% */}
          <div className="lg:col-span-5">
            <Reveal delay={140}>
              <figure className="relative m-0">
                <div
                  className="relative overflow-hidden"
                  style={{ borderRadius: 12, aspectRatio: "4 / 5" }}
                >
                  <Image
                    src="/images/team-meeting.jpg"
                    alt="Attorneys reviewing case documentation"
                    fill
                    sizes="(max-width: 1024px) 100vw, 40vw"
                    className="object-cover"
                  />
                </div>

                {/* A quiet caption plate rather than a floating stat bubble */}
                <figcaption
                  className="cb-plate mt-3 px-4 py-3"
                  style={{ background: "var(--cb-white)" }}
                >
                  <p className="cb-label" style={{ fontSize: "0.625rem" }}>
                    The difference in practice
                  </p>
                  <p className="mt-2 text-[0.875rem] leading-[1.55]" style={{ color: "var(--cb-ink-2)" }}>
                    Your intake team calls a claimant who has spoken to no one
                    else — not the fourth firm to reach someone who has already
                    said yes to another.
                  </p>
                </figcaption>
              </figure>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
