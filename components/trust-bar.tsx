import { Shield, Award, CheckCircle, Lock } from "lucide-react";

const items = [
  { icon: Shield, label: "TCPA Compliant" },
  { icon: Award, label: "ABA Guidelines Adherent" },
  { icon: CheckCircle, label: "Every Case Screened" },
  { icon: Lock, label: "100% Exclusive Cases" },
];

export function TrustBar() {
  return (
    <section className="border-b border-border bg-background py-5 sm:py-6">
      <div className="mx-auto grid max-w-7xl grid-cols-2 items-center justify-items-center gap-x-6 gap-y-4 px-5 sm:flex sm:flex-wrap sm:justify-center sm:gap-x-12 sm:px-8">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary/10">
              <item.icon className="h-3.5 w-3.5 text-secondary" />
            </div>
            <span className="text-[13px] font-medium text-foreground">
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
