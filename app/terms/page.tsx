import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service | Case Bridge",
  description:
    "Case Bridge terms of service. Read the terms governing the use of our case generation services.",
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-5 py-6 sm:px-8">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-20">
        <h1 className="font-serif text-3xl font-bold text-foreground sm:text-4xl">
          Terms of Service
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Last updated: February 2026
        </p>

        <div className="mt-10 space-y-10 text-[15px] leading-7 text-foreground/80">
          <section>
            <h2 className="font-serif text-xl font-bold text-foreground">
              1. Acceptance of Terms
            </h2>
            <p className="mt-3">
              By accessing or using the Case Bridge website and services, you
              agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do
              not agree to these Terms, you may not use our website or services.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-foreground">
              2. Description of Services
            </h2>
            <p className="mt-3">
              Case Bridge is a case generation service that connects
              pre-qualified motor vehicle accident claimants with licensed
              personal injury attorneys and law firms. We are not a law firm, do
              not provide legal advice, and do not represent clients in any legal
              matter.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-foreground">
              3. Eligibility
            </h2>
            <p className="mt-3">
              Our case generation services are available exclusively to licensed
              attorneys and law firms authorized to practice personal injury law
              in their respective jurisdictions. By engaging our services, you
              represent and warrant that you hold a valid license to practice law
              in the states where you accept cases.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-foreground">
              4. Case Delivery and Exclusivity
            </h2>
            <p className="mt-3">
              Each qualified case delivered through Case Bridge is exclusive to a
              single partner firm. Cases are not resold, shared, or distributed
              to competing firms. Delivery methods include live warm transfers,
              CRM integration, and secure dashboard access as agreed upon during
              onboarding.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-foreground">
              5. Partner Obligations
            </h2>
            <p className="mt-3">Partner firms agree to the following:</p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                Respond to delivered cases promptly and in accordance with agreed
                service level expectations.
              </li>
              <li>
                Maintain compliance with all applicable bar association rules,
                state regulations, and ethical standards.
              </li>
              <li>
                Keep case information confidential and use it solely for the
                purpose of evaluating and potentially representing the
                prospective client.
              </li>
              <li>
                Provide accurate feedback and conversion data as reasonably
                requested to facilitate performance optimization.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-foreground">
              6. Payment Terms
            </h2>
            <p className="mt-3">
              Pricing, billing frequency, and payment terms are established in a
              separate service agreement between Case Bridge and each partner
              firm. All fees are due in accordance with the terms of that
              agreement. Late payments may result in suspension of case delivery.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-foreground">
              7. Compliance and Regulatory Standards
            </h2>
            <p className="mt-3">
              Case Bridge operates in compliance with ABA Model Rules of
              Professional Conduct, applicable state bar advertising and
              solicitation regulations, and TCPA guidelines. All cases are
              ethically sourced with documented consent records maintained on
              file.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-foreground">
              8. Limitation of Liability
            </h2>
            <p className="mt-3">
              Case Bridge provides case generation services on an &quot;as is&quot; basis.
              We do not guarantee specific case volumes, conversion rates, or
              outcomes. To the fullest extent permitted by law, Case Bridge shall
              not be liable for any indirect, incidental, special, consequential,
              or punitive damages arising out of or related to the use of our
              services.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-foreground">
              9. Indemnification
            </h2>
            <p className="mt-3">
              You agree to indemnify and hold harmless Case Bridge, its
              officers, directors, employees, and agents from any claims,
              damages, losses, liabilities, and expenses (including reasonable
              attorneys&apos; fees) arising out of or related to your use of our
              services, your breach of these Terms, or your violation of any
              applicable law or regulation.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-foreground">
              10. Intellectual Property
            </h2>
            <p className="mt-3">
              All content on the Case Bridge website, including text, graphics,
              logos, and software, is the property of Case Bridge and is
              protected by applicable intellectual property laws. You may not
              reproduce, distribute, or create derivative works from any content
              on our website without prior written consent.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-foreground">
              11. Termination
            </h2>
            <p className="mt-3">
              Either party may terminate the service relationship in accordance
              with the terms of the applicable service agreement. Case Bridge
              reserves the right to suspend or terminate access to our services
              for any partner firm that violates these Terms or engages in
              conduct that could harm our reputation or operations.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-foreground">
              12. Governing Law
            </h2>
            <p className="mt-3">
              These Terms shall be governed by and construed in accordance with
              the laws of the State of Georgia, without regard to its conflict of
              law provisions. Any disputes arising under these Terms shall be
              resolved in the state or federal courts located in Fulton County,
              Georgia.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-foreground">
              13. Changes to These Terms
            </h2>
            <p className="mt-3">
              We reserve the right to modify these Terms at any time. Updated
              Terms will be posted on this page with a revised &quot;Last updated&quot;
              date. Continued use of our services after changes constitutes
              acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-foreground">
              14. Contact Us
            </h2>
            <p className="mt-3">
              If you have any questions about these Terms of Service, please
              contact us at:
            </p>
            <p className="mt-3">
              <strong className="text-foreground">Case Bridge</strong>
              <br />
              Atlanta, GA
              <br />
              <a
                href="mailto:sales@case-bridge.com"
                className="text-secondary underline underline-offset-2 hover:text-secondary/80"
              >
                sales@case-bridge.com
              </a>
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
