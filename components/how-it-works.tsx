import { Megaphone, PhoneCall, ClipboardCheck, Send } from "lucide-react";

const steps = [
  {
    icon: Megaphone,
    step: "01",
    title: "We source the claimant",
    description:
      "Through targeted digital campaigns, SEO, and referral networks, we connect with individuals who have been involved in a motor vehicle accident and are actively seeking legal representation.",
  },
  {
    icon: PhoneCall,
    step: "02",
    title: "Live intake interview",
    description:
      "A trained intake specialist conducts a live phone call with the prospective client to gather case details: accident date, injuries sustained, medical treatment status, fault indicators, and insurance information.",
  },
  {
    icon: ClipboardCheck,
    step: "03",
    title: "Qualification and screening",
    description:
      "Each case passes through our six-point verification process. We screen for liability, confirm medical treatment, check for existing representation, and validate contact information before approval.",
  },
  {
    icon: Send,
    step: "04",
    title: "Real-time delivery to your firm",
    description:
      "Qualified cases are delivered to your team in real time via your preferred method -- CRM integration, email, SMS, or a secure partner dashboard -- complete with detailed case notes.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 bg-muted">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-secondary">
            Our Process
          </p>
          <h2 className="mt-3 font-serif text-3xl leading-snug tracking-tight text-foreground sm:text-4xl text-balance">
            From first contact to your intake queue
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground text-pretty">
            Every case follows the same rigorous path. No shortcuts, no
            automation-only pipelines. Here is exactly how a Case Bridge case
            goes from claimant to your desk.
          </p>
        </div>

        <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((item) => (
            <div
              key={item.step}
              className="flex flex-col bg-card p-8"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <item.icon className="h-5 w-5" />
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Step {item.step}
                </span>
              </div>
              <h3 className="mt-5 text-base font-bold text-foreground">
                {item.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
