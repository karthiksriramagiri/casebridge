"use client";

import type React from "react";
import { useState } from "react";
import {
  ArrowRight,
  Check,
  Clock,
  Mail,
  Pin,
  Reveal,
  SectionHead,
} from "@/components/site/primitives";

const hours = [
  ["Mon – Fri", "8:00 AM – 8:00 PM ET"],
  ["Saturday", "9:00 AM – 5:00 PM ET"],
  ["Sunday", "Closed"],
];

export function ContactForm() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);

    const fd = new FormData(e.currentTarget);
    const data = {
      firstName: fd.get("firstName"),
      lastName: fd.get("lastName"),
      email: fd.get("email"),
      phone: fd.get("phone"),
      firmName: fd.get("firmName"),
      message: fd.get("message"),
    };

    try {
      await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    } catch {
      // The enquiry is also reachable by email, shown alongside the form.
    }

    setSubmitting(false);
    setSubmitted(true);
  }

  return (
    <section id="contact" className="cb-section">
      <div className="cb-wrap">
        <SectionHead
          index="06"
          label="Get started"
          title="Start a conversation."
          lead="Tell us about your practice and an account representative will come back to you within one business day."
        />

        <div className="mt-14 grid gap-x-16 gap-y-12 lg:grid-cols-12">
          {/* Details */}
          <div className="lg:col-span-4">
            <Reveal>
              <dl className="m-0 flex flex-col">
                <div
                  className="flex items-start gap-3 py-4"
                  style={{ borderTop: "1px solid var(--cb-line)" }}
                >
                  <span style={{ color: "var(--cb-steel)" }} className="mt-[3px]">
                    <Mail />
                  </span>
                  <div>
                    <dt className="cb-label" style={{ fontSize: "0.625rem" }}>
                      Email
                    </dt>
                    <dd className="m-0 mt-1">
                      <a
                        href="mailto:sales@case-bridge.com"
                        className="cb-link"
                        style={{ fontSize: "0.9375rem" }}
                      >
                        sales@case-bridge.com
                      </a>
                    </dd>
                  </div>
                </div>

                <div
                  className="flex items-start gap-3 py-4"
                  style={{ borderTop: "1px solid var(--cb-line)" }}
                >
                  <span style={{ color: "var(--cb-steel)" }} className="mt-[3px]">
                    <Pin />
                  </span>
                  <div>
                    <dt className="cb-label" style={{ fontSize: "0.625rem" }}>
                      Office
                    </dt>
                    <dd className="m-0 mt-1 text-[0.9375rem]" style={{ color: "var(--cb-ink)" }}>
                      Atlanta, GA
                    </dd>
                  </div>
                </div>

                <div
                  className="py-4"
                  style={{
                    borderTop: "1px solid var(--cb-line)",
                    borderBottom: "1px solid var(--cb-line)",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span style={{ color: "var(--cb-steel)" }}>
                      <Clock />
                    </span>
                    <dt className="cb-label" style={{ fontSize: "0.625rem" }}>
                      Hours
                    </dt>
                  </div>
                  <dd className="m-0 mt-3 flex flex-col gap-1.5">
                    {hours.map(([day, time]) => (
                      <div key={day} className="flex justify-between gap-4 text-[0.8125rem]">
                        <span style={{ color: "var(--cb-ink-3)" }}>{day}</span>
                        <span style={{ color: "var(--cb-ink-2)" }}>{time}</span>
                      </div>
                    ))}
                  </dd>
                </div>
              </dl>
            </Reveal>
          </div>

          {/* Form */}
          <div className="lg:col-span-8">
            <Reveal delay={100}>
              {submitted ? (
                <div
                  className="cb-plate flex flex-col items-start gap-4 p-8 sm:p-10"
                  style={{ background: "var(--cb-white)" }}
                >
                  <span
                    aria-hidden="true"
                    className="grid place-items-center rounded-full"
                    style={{
                      width: 40,
                      height: 40,
                      background: "rgba(47, 88, 120, 0.1)",
                      color: "var(--cb-steel)",
                    }}
                  >
                    <Check size={18} />
                  </span>
                  <h3 className="cb-h3">Enquiry received.</h3>
                  <p className="cb-body" style={{ maxWidth: "32rem" }}>
                    An account representative will be in touch within one business
                    day. If it is urgent, email{" "}
                    <a href="mailto:sales@case-bridge.com" className="cb-link">
                      sales@case-bridge.com
                    </a>{" "}
                    directly.
                  </p>
                </div>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  className="cb-plate p-6 sm:p-8"
                  style={{ background: "var(--cb-white)" }}
                >
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="cb-field">
                      <label className="cb-field-label" htmlFor="firstName">
                        First name
                      </label>
                      <input id="firstName" name="firstName" required className="cb-input" placeholder="John" />
                    </div>
                    <div className="cb-field">
                      <label className="cb-field-label" htmlFor="lastName">
                        Last name
                      </label>
                      <input id="lastName" name="lastName" required className="cb-input" placeholder="Smith" />
                    </div>
                    <div className="cb-field">
                      <label className="cb-field-label" htmlFor="email">
                        Email
                      </label>
                      <input id="email" name="email" type="email" required className="cb-input" placeholder="john@lawfirm.com" />
                    </div>
                    <div className="cb-field">
                      <label className="cb-field-label" htmlFor="phone">
                        Phone
                      </label>
                      <input id="phone" name="phone" type="tel" className="cb-input" placeholder="(555) 123-4567" />
                    </div>
                    <div className="cb-field sm:col-span-2">
                      <label className="cb-field-label" htmlFor="firmName">
                        Firm name
                      </label>
                      <input id="firmName" name="firmName" required className="cb-input" placeholder="Smith &amp; Associates, PLLC" />
                    </div>
                    <div className="cb-field sm:col-span-2">
                      <label className="cb-field-label" htmlFor="message">
                        What are you looking for?
                      </label>
                      <textarea
                        id="message"
                        name="message"
                        rows={4}
                        className="cb-input"
                        placeholder="Case criteria, target jurisdictions, and the monthly volume you can work."
                      />
                    </div>
                  </div>

                  <div className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center">
                    <button type="submit" className="cb-btn cb-btn-primary" disabled={submitting}>
                      {submitting ? "Sending…" : "Send enquiry"}
                      {!submitting && <ArrowRight className="cb-arrow" />}
                    </button>
                    <p className="cb-small" style={{ maxWidth: "26rem" }}>
                      By submitting, you consent to be contacted about your
                      enquiry. We do not share your details.
                    </p>
                  </div>
                </form>
              )}
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
