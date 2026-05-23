"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Star, Quote } from "lucide-react";

const testimonials = [
  {
    quote:
      "We evaluated a dozen case providers before choosing Case Bridge. The difference is the quality of screening -- every case arrives with verified accident details, confirmed treatment records, and real intent to retain counsel. Our conversion rate has tripled.",
    name: "Robert H.",
    title: "Managing Partner",
    location: "Dallas, TX",
  },
  {
    quote:
      "The exclusivity model is what sold us. We stopped wasting time competing with four other firms for the same prospect. Case Bridge sends cases that are genuinely ours, and it shows in our intake numbers.",
    name: "Sarah M.",
    title: "Senior Partner",
    location: "San Mateo, CA",
  },
  {
    quote:
      "The live transfer program changed our practice. We connect with potential clients within seconds of them seeking representation. Our cost per retained case dropped significantly, and case quality has been remarkably consistent month over month.",
    name: "Angela T.",
    title: "Director of Intake",
    location: "Atlanta, GA",
  },
];

export function Testimonials() {
  const [current, setCurrent] = useState(0);

  const prev = () =>
    setCurrent((c) => (c === 0 ? testimonials.length - 1 : c - 1));
  const next = () =>
    setCurrent((c) => (c === testimonials.length - 1 ? 0 : c + 1));

  const t = testimonials[current];

  return (
    <section id="testimonials" className="py-16 bg-background sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid gap-16 lg:grid-cols-12">
          {/* Left column */}
          <div className="lg:col-span-4">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-secondary">
              Testimonials
            </p>
            <h2 className="mt-4 font-serif text-2xl font-bold text-foreground sm:text-3xl md:text-4xl text-balance">
              What Our Partners Say
            </h2>
            <p className="mt-4 text-[15px] font-medium leading-7 text-muted-foreground text-pretty">
              Hear from attorneys who have transformed their intake pipeline
              with Case Bridge.
            </p>

            {/* Navigation */}
            <div className="mt-8 flex items-center gap-3">
              <button
                type="button"
                onClick={prev}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                aria-label="Previous testimonial"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={next}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                aria-label="Next testimonial"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <span className="ml-2 text-xs text-muted-foreground">
                {current + 1} / {testimonials.length}
              </span>
            </div>

            {/* Dots */}
            <div className="mt-4 flex gap-2">
              {testimonials.map((_, i) => (
                <button
                  key={`dot-${testimonials[i].name}`}
                  type="button"
                  onClick={() => setCurrent(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === current
                      ? "w-8 bg-secondary"
                      : "w-1.5 bg-border hover:bg-muted-foreground"
                  }`}
                  aria-label={`Go to testimonial ${i + 1}`}
                />
              ))}
            </div>
          </div>

          {/* Right column - testimonial card */}
          <div className="lg:col-span-8">
            <div className="rounded-lg border border-border bg-card p-6 sm:p-8 md:p-10 lg:p-12">
              <Quote className="h-8 w-8 text-secondary/30" />

              <div className="mt-4 flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={`star-${t.name}-${i}`}
                    className="h-4 w-4 fill-secondary text-secondary"
                  />
                ))}
              </div>

              <blockquote className="mt-6">
                <p className="text-base font-medium leading-7 text-foreground sm:text-lg sm:leading-8 md:text-xl md:leading-9 text-pretty">
                  {`"${t.quote}"`}
                </p>
              </blockquote>

              <div className="mt-8 flex items-center gap-4 border-t border-border pt-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary font-serif text-sm font-bold text-primary-foreground">
                  {t.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {t.name}
                  </div>
                  <div className="text-[13px] text-muted-foreground">
                    {t.title}
                  </div>
                  <div className="text-xs text-muted-foreground/70">
                    {t.location}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
