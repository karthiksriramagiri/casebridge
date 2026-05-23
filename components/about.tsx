import Image from "next/image";
import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const qualityIndicators = [
  "Every case matched to your firm's specific qualifying criteria",
  "One firm per case -- your prospect speaks only with your team",
  "Real-time transfer via live call, CRM integration, or secure portal",
  "Multi-channel acquisition across search, social, and partner networks",
  "Geographic and case-type targeting tailored to your practice",
  "Dedicated account management with ongoing optimization",
];

export function About() {
  return (
    <section id="why-us" className="py-16 bg-background sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid items-center gap-16 lg:grid-cols-12 lg:gap-20">
          {/* Image side */}
          <div className="order-2 lg:order-1 lg:col-span-5">
            <div className="relative">
              <div className="relative aspect-[4/3] overflow-hidden rounded-lg sm:aspect-[4/5]">
                <Image
                  src="/images/team-meeting.jpg"
                  alt="Legal professionals reviewing case documentation in a boardroom"
                  fill
                  className="object-cover"
                />
              </div>

            </div>
          </div>

          {/* Copy side */}
          <div className="order-1 lg:order-2 lg:col-span-7">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-secondary">
              Why Case Bridge
            </p>
            <h2 className="mt-4 font-serif text-2xl font-bold leading-tight text-foreground sm:text-3xl md:text-4xl text-balance">
              Case Quality That Converts to Retained Clients
            </h2>
            <p className="mt-5 max-w-xl text-[15px] font-medium leading-7 text-muted-foreground text-pretty">
              Most case providers sell the same prospect to multiple firms,
              leaving you competing for attention with attorneys who received the
              identical contact. We operate differently. Every case we deliver
              has been screened by our intake team, meets your defined case
              criteria, and is sent exclusively to your practice.
            </p>
            <p className="mt-4 max-w-xl text-[15px] font-medium leading-7 text-muted-foreground text-pretty">
              The result is a measurably higher conversion rate, a lower
              cost-per-retained-case, and more time for your attorneys to focus
              on litigation rather than prospecting.
            </p>

            <ul className="mt-8 grid gap-3 md:grid-cols-2">
              {qualityIndicators.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary/10">
                    <Check className="h-3 w-3 text-secondary" />
                  </div>
                  <span className="text-[13px] font-medium leading-snug text-foreground">
                    {item}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-10">
              <Button
                asChild
                className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2 px-6"
              >
                <a href="https://calendly.com/case-bridge-sales/30min" target="_blank" rel="noopener noreferrer">
                  Become a Partner
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
