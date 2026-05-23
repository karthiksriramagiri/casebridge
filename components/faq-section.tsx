"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { MessageCircle } from "lucide-react";

const faqs = [
  {
    question: "How do you ensure case quality?",
    answer:
      "Every case passes through a multi-step screening process. Our trained intake specialists verify accident details, confirm injury documentation and medical treatment status, check insurance coverage, and assess legal viability. Only prospects who meet your firm's specific qualifying criteria are delivered.",
  },
  {
    question: "Are the cases exclusive to my firm?",
    answer:
      "Yes. Every case is delivered exclusively to a single firm. We do not resell or redistribute cases to competing practices. Exclusivity is core to our model because it directly impacts conversion rates and your return on investment.",
  },
  {
    question: "What types of MVA cases do you cover?",
    answer:
      "Our primary focus is motor vehicle accidents, including car collisions, motorcycle accidents, pedestrian incidents, and rideshare-related cases. We also generate cases for commercial trucking collisions and fleet vehicle accidents with verified policy coverage.",
  },
  {
    question: "How are cases delivered to my firm?",
    answer:
      "We offer three delivery methods: live warm transfers directly to your intake team, automated integration with your existing CRM or case management system, and access to a secure client portal. Most partners use a combination based on their workflow.",
  },
  {
    question: "Is our process compliant with bar regulations?",
    answer:
      "Yes. Our processes comply with ABA Model Rules of Professional Conduct, applicable state bar regulations, and TCPA guidelines. Every case is ethically sourced with documented consent records that we maintain on file.",
  },
  {
    question: "What geographic areas do you cover?",
    answer:
      "We operate across all 50 states. Targeting is customizable by state, metro area, or specific counties, allowing you to focus on the jurisdictions where your firm is licensed and most competitive.",
  },
  {
    question: "How do you measure and improve performance?",
    answer:
      "We provide transparent reporting on case volume, qualification rates, and downstream conversion metrics. Your dedicated account manager reviews this data regularly and adjusts targeting parameters and qualification criteria to continuously improve results.",
  },
  {
    question: "What should I expect when getting started?",
    answer:
      "After an initial consultation to define your case criteria, geographic targets, and volume requirements, we configure your account and begin campaign activation. Most firms begin receiving qualified cases within the first few business days of onboarding.",
  },
];

export function FaqSection() {
  return (
    <section id="faq" className="py-16 bg-card sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid gap-16 lg:grid-cols-12">
          {/* Left */}
          <div className="lg:col-span-4">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-secondary">
              FAQ
            </p>
            <h2 className="mt-4 font-serif text-2xl font-bold text-foreground sm:text-3xl md:text-4xl text-balance">
              Common Questions
            </h2>
            <p className="mt-4 text-[15px] font-medium leading-7 text-muted-foreground text-pretty">
              Answers to the questions personal injury attorneys ask most about
              our case generation services.
            </p>

            <div className="mt-8 rounded-lg border border-border bg-background p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/10">
                <MessageCircle className="h-5 w-5 text-secondary" />
              </div>
              <p className="mt-4 text-sm font-semibold text-foreground">
                Still have questions?
              </p>
              <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-muted-foreground">
                Our team is available to walk through any aspect of our process
                in detail.
              </p>
              <a
                href="#contact"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-secondary hover:underline"
              >
                Contact us
              </a>
            </div>
          </div>

          {/* Right */}
          <div className="lg:col-span-8">
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq, index) => (
                <AccordionItem
                  key={`faq-${index}`}
                  value={`faq-${index}`}
                  className="border-border"
                >
                  <AccordionTrigger className="text-left text-[15px] font-semibold text-foreground hover:text-secondary hover:no-underline py-5 gap-4">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-[13px] font-medium leading-6 text-muted-foreground pb-5 pr-8">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </div>
    </section>
  );
}
