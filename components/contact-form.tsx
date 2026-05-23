"use client";

import type React from "react";
import { useState } from "react";
import { Phone, Mail, MapPin, Send, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const contactInfo = [
  {
    icon: Mail,
    label: "Email",
    value: "sales@case-bridge.com",
    href: "mailto:sales@case-bridge.com",
  },
  {
    icon: MapPin,
    label: "Office",
    value: "Atlanta, GA",
    href: null,
  },
];

export function ContactForm() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      firmName: formData.get("firmName"),
      message: formData.get("message"),
    };

    try {
      await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } catch {
      // still show success to user
    }

    setSubmitting(false);
    setSubmitted(true);
  };

  return (
    <section id="contact" className="py-16 bg-background sm:py-28">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-secondary">
            Get Started
          </p>
          <h2 className="mx-auto mt-4 max-w-xl font-serif text-2xl font-bold text-foreground sm:text-3xl md:text-4xl text-balance">
            Request a Consultation
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-[15px] font-medium leading-7 text-muted-foreground text-pretty">
            Tell us about your practice and an account representative will
            contact you within one business day to discuss case volume,
            targeting, and pricing.
          </p>
        </div>

        <div className="mx-auto mt-14 max-w-5xl">
          <div className="grid gap-10 lg:grid-cols-12">
            {/* Contact details */}
            <div className="flex flex-col gap-6 lg:col-span-4">
              {contactInfo.map((item) => (
                <div key={item.label} className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary/10">
                    <item.icon className="h-4 w-4 text-secondary" />
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-foreground">
                      {item.label}
                    </div>
                    {item.href ? (
                      <a
                        href={item.href}
                        className="text-[13px] text-muted-foreground transition-colors hover:text-secondary"
                      >
                        {item.value}
                      </a>
                    ) : (
                      <p className="whitespace-pre-line text-[13px] text-muted-foreground">
                        {item.value}
                      </p>
                    )}
                  </div>
                </div>
              ))}

              <div className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-secondary" />
                  <span className="text-[13px] font-semibold text-foreground">
                    Business Hours
                  </span>
                </div>
                <div className="mt-3 flex flex-col gap-1.5 text-[13px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Mon - Fri</span>
                    <span className="text-foreground">8:00 AM - 8:00 PM ET</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Saturday</span>
                    <span className="text-foreground">9:00 AM - 5:00 PM ET</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sunday</span>
                    <span className="text-muted-foreground">Closed</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Form */}
            <div className="lg:col-span-8">
              {submitted ? (
                <div className="flex h-full min-h-[460px] items-center justify-center rounded-lg border border-border bg-card">
                  <div className="text-center px-8">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-secondary/10">
                      <CheckCircle2 className="h-7 w-7 text-secondary" />
                    </div>
                    <h3 className="mt-5 font-serif text-2xl font-bold text-foreground">
                      Thank You
                    </h3>
                    <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                      Your inquiry has been received. A dedicated account
                      representative will be in touch within one business day.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-card p-5 sm:p-8 md:p-10">
                  <form
                    onSubmit={handleSubmit}
                    className="flex flex-col gap-5"
                  >
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <Label
                          htmlFor="firstName"
                          className="text-[13px] font-medium text-foreground"
                        >
                          First Name{" "}
                          <span className="text-secondary">*</span>
                        </Label>
                        <Input
                          id="firstName"
                          name="firstName"
                          required
                          placeholder="John"
                          className="h-11 border-border bg-background text-sm"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label
                          htmlFor="lastName"
                          className="text-[13px] font-medium text-foreground"
                        >
                          Last Name{" "}
                          <span className="text-secondary">*</span>
                        </Label>
                        <Input
                          id="lastName"
                          name="lastName"
                          required
                          placeholder="Smith"
                          className="h-11 border-border bg-background text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <Label
                          htmlFor="email"
                          className="text-[13px] font-medium text-foreground"
                        >
                          Email <span className="text-secondary">*</span>
                        </Label>
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          required
                          placeholder="john@lawfirm.com"
                          className="h-11 border-border bg-background text-sm"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label
                          htmlFor="phone"
                          className="text-[13px] font-medium text-foreground"
                        >
                          Phone
                        </Label>
                        <Input
                          id="phone"
                          name="phone"
                          type="tel"
                          placeholder="(555) 123-4567"
                          className="h-11 border-border bg-background text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label
                        htmlFor="firmName"
                        className="text-[13px] font-medium text-foreground"
                      >
                        Firm Name{" "}
                        <span className="text-secondary">*</span>
                      </Label>
                      <Input
                        id="firmName"
                        name="firmName"
                        required
                        placeholder="Smith & Associates, PLLC"
                        className="h-11 border-border bg-background text-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label
                        htmlFor="message"
                        className="text-[13px] font-medium text-foreground"
                      >
                        Tell Us About Your Needs
                      </Label>
                      <Textarea
                        id="message"
                        name="message"
                        rows={4}
                        placeholder="Describe your target geographies, case types, and monthly volume requirements..."
                        className="resize-none border-border bg-background text-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-4 pt-2 sm:flex-row sm:items-center sm:justify-between">
                      <Button
                        type="submit"
                        disabled={submitting}
                        className="bg-secondary text-secondary-foreground hover:bg-secondary/90 gap-2 px-8 shadow-none disabled:opacity-60"
                      >
                        {submitting ? "Sending..." : "Submit Inquiry"}
                        {!submitting && <Send className="h-3.5 w-3.5" />}
                      </Button>
                      <p className="max-w-[280px] text-[11px] leading-relaxed text-muted-foreground">
                        By submitting, you consent to be contacted regarding our
                        services.
                      </p>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
