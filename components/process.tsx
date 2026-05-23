import { Search, ClipboardCheck, Zap, TrendingUp } from "lucide-react";

const steps = [
  {
    icon: Search,
    number: "1",
    title: "Prospect Identification",
    description:
      "Our cross-platform campaigns across search, social, and strategic partnerships identify individuals involved in motor vehicle accidents who are actively seeking legal counsel.",
  },
  {
    icon: ClipboardCheck,
    number: "2",
    title: "Intake & Qualification",
    description:
      "Each prospect is evaluated by trained intake specialists who verify accident circumstances, injury documentation, medical treatment status, and insurance coverage.",
  },
  {
    icon: Zap,
    number: "3",
    title: "Exclusive Delivery",
    description:
      "Qualified cases are transferred to your firm through live warm transfer, direct CRM integration, or your secure dashboard. Every case is exclusive to your practice.",
  },
  {
    icon: TrendingUp,
    number: "4",
    title: "Ongoing Optimization",
    description:
      "We continuously refine targeting and qualification criteria using your conversion data to improve case quality and maximize your return on investment over time.",
  },
];

export function Process() {
  return (
    <section id="process" className="py-16 bg-primary sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-secondary">
            How It Works
          </p>
          <h2 className="mx-auto mt-4 max-w-2xl font-serif text-2xl font-bold text-primary-foreground sm:text-3xl md:text-4xl text-balance">
            From Prospect to Retained Case
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[15px] font-medium leading-7 text-primary-foreground/50 text-pretty">
            A streamlined four-step process built to deliver consistent,
            high-quality motor vehicle accident cases to your firm.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:mt-16 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
          {steps.map((step) => (
            <div
              key={step.number}
              className="relative rounded-lg border border-primary-foreground/8 bg-primary-foreground/[0.03] p-7 transition-colors hover:bg-primary-foreground/[0.06]"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/15">
                  <step.icon className="h-5 w-5 text-secondary" />
                </div>
                <span className="font-serif text-xs font-bold tracking-wider text-primary-foreground/30">
                  STEP {step.number}
                </span>
              </div>
              <h3 className="mt-5 text-[15px] font-semibold text-primary-foreground">
                {step.title}
              </h3>
              <p className="mt-2.5 text-[13px] font-medium leading-6 text-primary-foreground/45">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
