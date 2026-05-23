import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CtaSection() {
  return (
    <section className="relative overflow-hidden bg-primary py-16 sm:py-24">
      <div className="absolute inset-0">
        <Image
          src="/images/courtroom.jpg"
          alt="Courtroom interior"
          fill
          className="object-cover opacity-10"
        />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-5 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-secondary">
            Start Today
          </p>
          <h2 className="mt-4 font-serif text-2xl font-bold text-primary-foreground sm:text-3xl md:text-4xl text-balance">
            Ready to Improve Your Case Pipeline?
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-[15px] font-medium leading-7 text-primary-foreground/50 text-pretty">
            Speak with our team about your practice areas, geographic targets,
            and volume requirements. We will outline exactly how Case Bridge can
            deliver qualified, exclusive MVA cases to your firm.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4">
            <Button
              asChild
              size="lg"
              className="bg-secondary text-secondary-foreground hover:bg-secondary/90 gap-2 px-8 shadow-lg shadow-secondary/20"
            >
              <a href="https://calendly.com/case-bridge-sales/30min" target="_blank" rel="noopener noreferrer">
                Request a Consultation
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
