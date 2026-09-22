import { Accordion, ArrowRight, Reveal } from "@/components/site/primitives";

const faqs = [
  {
    question: "How do you ensure case quality?",
    answer:
      "Every case passes a four-stage screen. A trained intake specialist verifies the accident circumstances, confirms injury documentation and treatment status, checks insurance coverage, and assesses legal viability. Only prospects that meet the criteria your firm defined are delivered.",
  },
  {
    question: "Are the cases exclusive to my firm?",
    answer:
      "Yes. Every case goes to a single firm. We do not resell or redistribute to competing practices. Exclusivity is the whole model — it is what separates a case you can convert from a race to dial first.",
  },
  {
    question: "What types of MVA cases do you cover?",
    answer:
      "Car and motorcycle collisions, pedestrian and cyclist incidents, and rideshare cases involving passengers, drivers, or third parties. We also generate commercial trucking and fleet cases where the carrier is identifiable and policy coverage is verified.",
  },
  {
    question: "How are cases delivered?",
    answer:
      "Three ways, and most firms use a combination: a live warm transfer straight to your intake team, an automated push into your existing CRM or case management system, or a secure portal your team works from.",
  },
  {
    question: "Is the process compliant with bar regulations?",
    answer:
      "Our processes follow the ABA Model Rules of Professional Conduct, applicable state bar regulations, and TCPA guidelines. Every case is ethically sourced with documented consent records that we retain on file and can produce on request.",
  },
  {
    question: "What geographic areas do you cover?",
    answer:
      "All 50 states. Targeting is set by state, metro area, or specific counties, so you only receive cases in the jurisdictions where your firm is licensed and competitive.",
  },
  {
    question: "How do you measure and improve performance?",
    answer:
      "You get reporting on case volume, qualification rates, and downstream conversion. Your account manager reviews it with you and adjusts targeting and qualifying criteria against your actual retention data, not against our own delivery numbers.",
  },
  {
    question: "What should I expect when getting started?",
    answer:
      "An initial call to define your case criteria, geographic targets, and volume. We then configure the account and activate campaigns. Most firms are receiving qualified cases within the first few business days.",
  },
];

export function FaqSection() {
  return (
    <section id="faq" className="cb-section" style={{ background: "var(--cb-paper-2)" }}>
      <div className="cb-wrap">
        <div className="grid gap-x-16 gap-y-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-[100px]">
              <Reveal className="cb-head-top">
                <span className="cb-index">05</span>
                <span className="cb-label">Questions</span>
                <span className="cb-head-rule" aria-hidden="true" />
              </Reveal>
              <Reveal delay={60}>
                <h2 className="cb-h2 mt-7">Asked before signing.</h2>
              </Reveal>
              <Reveal delay={120}>
                <p className="cb-body mt-7" style={{ maxWidth: "24rem" }}>
                  The eight things personal injury firms want settled before they
                  put a case provider in front of their intake team.
                </p>
              </Reveal>
              <Reveal delay={170}>
                <a href="#contact" className="cb-link mt-7">
                  Ask us something else
                  <ArrowRight size={15} className="cb-arrow" />
                </a>
              </Reveal>
            </div>
          </div>

          <div className="lg:col-span-8">
            <Reveal delay={80}>
              <Accordion items={faqs} />
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
