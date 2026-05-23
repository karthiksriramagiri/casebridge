import {
  Car,
  Truck,
  UserCheck,
  PhoneCall,
  BarChart3,
  Shield,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Service {
  icon: LucideIcon;
  title: string;
  description: string;
  highlight?: string;
}

const services: Service[] = [
  {
    icon: Car,
    title: "Motor Vehicle Accident Cases",
    description:
      "Pre-qualified cases from individuals involved in car, motorcycle, and pedestrian accidents who meet your specific case criteria and insurance thresholds.",
    highlight: "Core Service",
  },
  {
    icon: Truck,
    title: "Commercial Vehicle Cases",
    description:
      "Vetted cases for commercial trucking collisions, fleet accidents, and premises liability matters with verified policy coverage and documented injuries.",
    highlight: "High Value",
  },
  {
    icon: UserCheck,
    title: "Professional Intake Screening",
    description:
      "Every prospect is evaluated by trained intake specialists who verify accident details, injury severity, treatment status, and insurance coverage before delivery.",
  },
  {
    icon: PhoneCall,
    title: "Live Warm Transfers",
    description:
      "Qualified claimants are connected directly to your intake team in real time, resulting in significantly higher conversion rates than static case lists.",
  },
  {
    icon: BarChart3,
    title: "Performance Analytics",
    description:
      "Transparent reporting on case volume, conversion rates, and cost-per-acquisition so you can measure ROI and refine targeting criteria over time.",
  },
  {
    icon: Shield,
    title: "Full Regulatory Compliance",
    description:
      "Every case is sourced in accordance with ABA Model Rules, state bar regulations, and TCPA guidelines with documented consent records.",
  },
];

export function Services() {
  return (
    <section id="services" className="py-16 bg-card sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-secondary">
            Our Services
          </p>
          <h2 className="mx-auto mt-4 max-w-2xl font-serif text-2xl font-bold text-foreground sm:text-3xl md:text-4xl text-balance">
            End-to-End MVA Case Generation
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[15px] font-medium leading-7 text-muted-foreground text-pretty">
            From multi-channel prospect acquisition through professional
            screening to real-time delivery, we handle every stage of the
            pipeline so your attorneys can focus on casework.
          </p>
        </div>

        {/* Top 2 featured cards */}
        <div className="mt-16 grid gap-6 lg:grid-cols-2">
          {services.slice(0, 2).map((service) => (
            <div
              key={service.title}
              className="group relative overflow-hidden rounded-xl border border-border bg-primary p-6 transition-all hover:shadow-lg sm:p-8 md:p-10"
            >
              <div className="flex items-start justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                  <service.icon className="h-6 w-6" />
                </div>
                {service.highlight && (
                  <span className="rounded-full bg-secondary/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-secondary">
                    {service.highlight}
                  </span>
                )}
              </div>
              <h3 className="mt-6 text-lg font-bold text-primary-foreground">
                {service.title}
              </h3>
              <p className="mt-3 text-sm font-medium leading-7 text-primary-foreground/50">
                {service.description}
              </p>
            </div>
          ))}
        </div>

        {/* Bottom 4 cards */}
        <div className="mt-4 grid gap-4 sm:mt-6 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
          {services.slice(2).map((service) => (
            <div
              key={service.title}
              className="group relative rounded-xl border border-border bg-background p-7 transition-all hover:border-secondary/30 hover:shadow-md"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary/10 text-secondary transition-colors group-hover:bg-secondary group-hover:text-secondary-foreground">
                <service.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-[15px] font-bold text-foreground">
                {service.title}
              </h3>
              <p className="mt-2.5 text-[13px] font-medium leading-6 text-muted-foreground">
                {service.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
