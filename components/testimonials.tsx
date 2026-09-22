import { Quote, Reveal, SectionHead } from "@/components/site/primitives";

/* The carousel this replaces showed one quote at a time behind two arrow
   buttons, a counter, and a row of dots — more chrome than content, and two
   thirds of the evidence hidden behind an interaction nobody performs. All
   three are on the page now, with one given the weight of a pull quote. */

const featured = {
  quote:
    "We evaluated a dozen case providers before choosing Case Bridge. The difference is the screening — every case arrives with verified accident details, confirmed treatment records, and real intent to retain counsel.",
  name: "Robert H.",
  title: "Managing Partner",
  location: "Dallas, TX",
};

const supporting = [
  {
    quote:
      "The exclusivity model is what sold us. We stopped competing with four other firms for the same prospect, and it shows in our intake numbers.",
    name: "Sarah M.",
    title: "Senior Partner",
    location: "San Mateo, CA",
  },
  {
    quote:
      "Live transfer changed our practice. We speak to a claimant within seconds of them looking for representation, and case quality has been consistent month over month.",
    name: "Angela T.",
    title: "Director of Intake",
    location: "Atlanta, GA",
  },
];

function Attribution({
  name,
  title,
  location,
}: {
  name: string;
  title: string;
  location: string;
}) {
  return (
    <figcaption className="mt-6 flex items-center gap-3">
      <span
        aria-hidden="true"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[0.75rem] font-bold"
        style={{ background: "var(--cb-steel)", color: "#fff", letterSpacing: "-0.02em" }}
      >
        {name
          .split(" ")
          .map((n) => n[0])
          .join("")}
      </span>
      <span className="min-w-0">
        <span className="block text-[0.875rem] font-semibold" style={{ color: "var(--cb-ink)" }}>
          {name}
        </span>
        <span className="block text-[0.8125rem]" style={{ color: "var(--cb-ink-3)" }}>
          {title} · {location}
        </span>
      </span>
    </figcaption>
  );
}

export function Testimonials() {
  return (
    <section id="testimonials" className="cb-section">
      <div className="cb-wrap">
        <SectionHead index="04" label="Partners" title="What the firms say." />

        <div className="mt-14 grid gap-x-16 gap-y-12 lg:grid-cols-12">
          {/* The pull quote is the one place a display serif belongs: large,
              set as a quotation, and never used at label size. */}
          <div className="lg:col-span-7">
            <Reveal>
              <figure className="m-0">
                <Quote size={30} style={{ color: "var(--cb-line-2)" }} />
                <blockquote className="m-0 mt-4">
                  <p
                    className="font-serif"
                    style={{
                      fontSize: "clamp(1.375rem, 2.4vw, 1.875rem)",
                      lineHeight: 1.36,
                      letterSpacing: "-0.018em",
                      color: "var(--cb-ink)",
                      textWrap: "pretty",
                    }}
                  >
                    {featured.quote}
                  </p>
                </blockquote>
                <Attribution {...featured} />
              </figure>
            </Reveal>
          </div>

          <div className="flex flex-col gap-10 lg:col-span-5">
            {supporting.map((t, i) => (
              <Reveal key={t.name} delay={100 + i * 80}>
                <figure
                  className="m-0 pt-7"
                  style={{ borderTop: "1px solid var(--cb-line)" }}
                >
                  <blockquote className="m-0">
                    <p className="cb-body" style={{ color: "var(--cb-ink)" }}>
                      {t.quote}
                    </p>
                  </blockquote>
                  <Attribution {...t} />
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
