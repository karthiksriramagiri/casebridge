import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const highlights = [
  "Exclusive, non-shared cases",
  "Professional intake screening",
  "TCPA & bar compliant",
];

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-primary">
      {/* Background */}
      <div className="absolute inset-0">
        <Image
          src="/images/hero-main.jpg"
          alt="Highway at dusk representing motor vehicle accident legal services"
          fill
          className="object-cover opacity-20"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-primary/40 via-transparent to-primary" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-5 pb-16 pt-16 sm:px-8 sm:pb-20 sm:pt-24 lg:pb-28 lg:pt-32">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-20">
          {/* Copy */}
          <div className="lg:col-span-6">
            <div className="inline-flex items-center rounded-full border border-secondary/30 bg-secondary/10 px-3 py-1.5 sm:px-4">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-secondary sm:text-xs">
                Exclusive MVA Cases for Personal Injury Firms
              </span>
            </div>

            <h1 className="mt-6 font-serif text-3xl font-bold leading-[1.15] tracking-tight text-primary-foreground sm:text-4xl md:text-5xl xl:text-[3.5rem] text-balance">
              Higher-Quality MVA Cases. Stronger Retained Clients.
            </h1>

            <p className="mt-6 max-w-lg text-base font-medium leading-7 text-primary-foreground/65 text-pretty">
              We connect personal injury attorneys with pre-qualified motor
              vehicle accident claimants who are actively seeking
              representation. Every case is screened, verified, and delivered
              exclusively to your practice.
            </p>

            <ul className="mt-8 flex flex-col gap-2.5">
              {highlights.map((item) => (
                <li key={item} className="flex items-center gap-2.5">
                  <CheckCircle className="h-4 w-4 text-secondary" />
                  <span className="text-sm font-medium text-primary-foreground/75">
                    {item}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                asChild
                size="lg"
                className="bg-secondary text-secondary-foreground hover:bg-secondary/90 gap-2 px-7 text-sm font-semibold shadow-lg shadow-secondary/20"
              >
                <a href="https://calendly.com/case-bridge-sales/30min" target="_blank" rel="noopener noreferrer">
                  Request a Consultation
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-primary-foreground/15 bg-transparent text-primary-foreground/80 hover:bg-primary-foreground/5 hover:text-primary-foreground text-sm"
              >
                <Link href="#process">See How It Works</Link>
              </Button>
            </div>
          </div>

          {/* Stats grid */}
          <div className="lg:col-span-6">
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {[
                {
                  value: "100%",
                  label: "Exclusive cases, never resold to other firms",
                },
                {
                  value: "Verified",
                  label: "Every case screened by trained intake specialists",
                },
                {
                  value: "Real-Time",
                  label: "Live warm transfers directly to your team",
                },
                {
                  value: "Compliant",
                  label: "TCPA, ABA, and state bar regulation adherence",
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="group rounded-lg border border-primary-foreground/8 bg-primary-foreground/[0.04] p-4 transition-colors hover:bg-primary-foreground/[0.07] sm:p-6"
                >
                  <div className="font-serif text-2xl font-bold text-secondary sm:text-3xl xl:text-4xl">
                    {stat.value}
                  </div>
                  <div className="mt-2.5 text-[13px] leading-snug text-primary-foreground/45">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
