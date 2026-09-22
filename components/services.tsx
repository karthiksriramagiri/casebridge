import { Reveal, SectionHead } from "@/components/site/primitives";

/* The previous version was four identical dark cards, each with the same
   orange icon tile and a badge reading CORE SERVICE / HIGH VALUE / GROWING
   SEGMENT / HIGH DEMAND. None of those badges carried information a firm
   could act on, and four equal cards meant nothing led.

   A row list holds more per screen, and the column that matters — what we
   actually verify before a case is sent — gets its own place instead of
   being buried in a paragraph. */

const caseTypes = [
  {
    name: "Motor vehicle collisions",
    blurb:
      "Car and motorcycle accidents where the claimant is injured, treating, and has not yet retained counsel.",
    checks: ["Fault and police report", "Injury and treatment status", "Policy limits"],
  },
  {
    name: "Commercial and trucking",
    blurb:
      "Fleet and commercial vehicle collisions, where coverage is higher and the carrier is identifiable.",
    checks: ["Carrier and DOT number", "Commercial policy coverage", "Documented injuries"],
  },
  {
    name: "Pedestrian and cyclist",
    blurb:
      "Crosswalk incidents and hit-and-runs, including cases where the claimant was struck on foot.",
    checks: ["Scene and liability", "Medical documentation", "Uninsured motorist cover"],
  },
  {
    name: "Rideshare",
    blurb:
      "Uber and Lyft collisions involving passengers, drivers, or third parties, where coverage tiers apply.",
    checks: ["Trip status at impact", "Platform coverage tier", "Injury verification"],
  },
];

export function Services() {
  return (
    <section id="case-types" className="cb-section">
      <div className="cb-wrap">
        <SectionHead
          index="01"
          label="What we deliver"
          title="Four case types, one standard of proof."
          lead="Every case is screened against the same checklist before it reaches your intake team. If it does not clear, it is not sent."
        />

        {/* On wide screens the right-hand column gets one header rather than
            the same label repeated once per row — four identical captions down
            a list is the sort of repetition that makes a page look generated.
            Below md the columns stack, so each row labels itself again. */}
        <div className="mt-14">
          <div className="hidden md:grid" style={{ gridTemplateColumns: "3.25rem minmax(0, 1fr)", columnGap: "clamp(1rem, 2.5vw, 2rem)" }}>
            <span />
            <div className="grid grid-cols-12 gap-x-12 pb-3">
              <span className="col-span-7" />
              <p className="col-span-5 cb-label" style={{ fontSize: "0.625rem" }}>
                Verified before delivery
              </p>
            </div>
          </div>

          {caseTypes.map((c, i) => (
            <Reveal key={c.name} delay={i * 60}>
              <article className="cb-row">
                <span className="cb-index" style={{ paddingTop: "0.3rem" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>

                <div className="grid gap-x-12 gap-y-4 md:grid-cols-12">
                  <div className="md:col-span-7">
                    <h3 className="cb-h3">{c.name}</h3>
                    <p className="cb-body mt-2.5" style={{ maxWidth: "34rem" }}>
                      {c.blurb}
                    </p>
                  </div>

                  <div className="md:col-span-5">
                    <p className="cb-label md:hidden" style={{ fontSize: "0.625rem" }}>
                      Verified before delivery
                    </p>
                    <ul className="mt-3 flex flex-col gap-1.5 md:mt-0">
                      {c.checks.map((check) => (
                        <li
                          key={check}
                          className="flex items-baseline gap-2.5 text-[0.875rem]"
                          style={{ color: "var(--cb-ink-2)" }}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: 999,
                              background: "var(--cb-steel-2)",
                              flexShrink: 0,
                              transform: "translateY(-2px)",
                            }}
                          />
                          {check}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
