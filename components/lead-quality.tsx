import Image from "next/image";
import {
  UserCheck,
  FileSearch,
  Stethoscope,
  BadgeCheck,
  ShieldAlert,
  Car,
} from "lucide-react";

const qualityChecks = [
  {
    icon: Car,
    title: "Accident Verification",
    description:
      "We confirm the motor vehicle accident occurred, including date, location, and involvement of a third-party at fault.",
  },
  {
    icon: Stethoscope,
    title: "Medical Treatment Confirmed",
    description:
      "Every case has sought or is actively receiving medical treatment for injuries sustained in the accident.",
  },
  {
    icon: ShieldAlert,
    title: "Liability Assessment",
    description:
      "Our intake specialists evaluate fault indicators to ensure clear liability before forwarding the case to your firm.",
  },
  {
    icon: UserCheck,
    title: "Live Intake Interview",
    description:
      "Trained legal intake professionals conduct a live phone interview -- no web forms or automated bots.",
  },
  {
    icon: FileSearch,
    title: "Duplicate Screening",
    description:
      "Proprietary systems cross-reference every case against existing records to ensure you never receive a duplicate.",
  },
  {
    icon: BadgeCheck,
    title: "Compliance Verified",
    description:
      "All cases are generated through TCPA-compliant channels with documented consent to contact.",
  },
];

export function LeadQuality() {
  return (
    <section id="case-quality" className="py-24 bg-background">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid items-start gap-16 lg:grid-cols-12">
          {/* Left content */}
          <div className="lg:col-span-5">
            <p className="text-sm font-semibold uppercase tracking-wider text-secondary">
              Case Quality Standards
            </p>
            <h2 className="mt-3 font-serif text-3xl leading-snug tracking-tight text-foreground sm:text-4xl text-balance">
              Six-point verification on every case we deliver
            </h2>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground text-pretty">
              Your firm deserves more than a name and phone number. Our intake
              team verifies six critical data points on every MVA case before it
              enters your pipeline, so your attorneys spend time on cases -- not
              chasing dead ends.
            </p>
            <div className="mt-8 relative aspect-[4/3] overflow-hidden rounded-xl">
              <Image
                src="/images/intake-specialist.jpg"
                alt="Professional intake specialist conducting a live interview"
                fill
                className="object-cover"
              />
            </div>
          </div>

          {/* Right grid */}
          <div className="lg:col-span-7">
            <div className="grid gap-6 sm:grid-cols-2">
              {qualityChecks.map((check) => (
                <div
                  key={check.title}
                  className="rounded-xl border border-border bg-card p-6"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/5">
                    <check.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mt-4 text-sm font-bold text-foreground">
                    {check.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {check.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
