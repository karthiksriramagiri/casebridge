import Image from "next/image";
import { CheckCircle2 } from "lucide-react";

const differentiators = [
  {
    title: "Exclusive to your firm",
    description:
      "Every case is sent to one firm only. We do not sell shared cases, auction cases, or operate a bidding marketplace. When a case is delivered, it belongs to you.",
  },
  {
    title: "Pre-screened for case viability",
    description:
      "Our intake team confirms that the claimant was not at fault, has documented injuries, and is receiving or has received medical treatment -- before you ever see their information.",
  },
  {
    title: "Transparent performance data",
    description:
      "Every partner firm has access to a reporting dashboard showing case volume, contact rates, retention rates, and cost per signed case. We measure what matters to your bottom line.",
  },
  {
    title: "Flexible volume and geography",
    description:
      "Set your own parameters: monthly case volume, geographic coverage area, case value minimums, and injury type preferences. Scale up or down at any time.",
  },
];

export function Results() {
  return (
    <section id="results" className="py-24 bg-card">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-secondary">
              Why Case Bridge
            </p>
            <h2 className="mt-3 font-serif text-3xl leading-snug tracking-tight text-foreground sm:text-4xl text-balance">
              Built for firms that measure results, not just volume
            </h2>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground text-pretty">
              Most case providers optimize for quantity. We optimize for the
              metric that actually matters to your practice: signed retainers.
              That distinction shapes every decision we make, from how we source
              claimants to how we structure our intake calls.
            </p>

            <div className="mt-10 flex flex-col gap-8">
              {differentiators.map((item) => (
                <div key={item.title} className="flex items-start gap-4">
                  <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-secondary" />
                  <div>
                    <h3 className="text-sm font-bold text-foreground">
                      {item.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl">
              <Image
                src="/images/dashboard-analytics.jpg"
                alt="Case Bridge partner performance dashboard showing case analytics"
                fill
                className="object-cover"
              />
            </div>
            {/* Overlay card */}
            <div className="absolute -bottom-6 right-6 rounded-xl border border-border bg-card p-6 shadow-lg max-w-[260px]">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-foreground">68%</span>
                <span className="text-sm font-medium text-secondary">avg.</span>
              </div>
              <p className="mt-1 text-xs font-medium text-muted-foreground">
                Case-to-retainer conversion rate across our top-performing partner firms
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
