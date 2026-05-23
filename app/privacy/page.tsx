import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy | Case Bridge",
  description:
    "Case Bridge privacy policy. Learn how we collect, use, and protect your personal information.",
};

export default function PrivacyPolicyPage() {
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
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Last updated: February 2026
        </p>

        <div className="mt-10 space-y-10 text-[15px] leading-7 text-foreground/80">
          <section>
            <h2 className="font-serif text-xl font-bold text-foreground">
              1. Introduction
            </h2>
            <p className="mt-3">
              Case Bridge (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting the
              privacy of individuals who visit our website, submit inquiries, or
              use our services. This Privacy Policy explains how we collect, use,
              disclose, and safeguard your information when you interact with
              Case Bridge.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-foreground">
              2. Information We Collect
            </h2>
            <p className="mt-3">We may collect the following types of information:</p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <strong className="text-foreground">Contact Information:</strong> Name, email address,
                phone number, and firm name when you submit an inquiry through
                our website.
              </li>
              <li>
                <strong className="text-foreground">Case Information:</strong> Details related to motor
                vehicle accidents, including accident type, injury details,
                medical treatment status, insurance information, and geographic
                location provided by prospective claimants.
              </li>
              <li>
                <strong className="text-foreground">Usage Data:</strong> Information about how you interact
                with our website, including IP address, browser type, pages
                visited, and referring URLs.
              </li>
              <li>
                <strong className="text-foreground">Cookies and Tracking Technologies:</strong> We use
                cookies and similar technologies to enhance your browsing
                experience and analyze website traffic.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-foreground">
              3. How We Use Your Information
            </h2>
            <p className="mt-3">We use collected information for the following purposes:</p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                To connect prospective claimants with licensed personal injury
                attorneys and law firms.
              </li>
              <li>
                To respond to inquiries submitted through our contact form.
              </li>
              <li>
                To screen and qualify motor vehicle accident cases for delivery
                to partner firms.
              </li>
              <li>
                To improve our website, services, and case generation processes.
              </li>
              <li>
                To comply with applicable legal obligations and regulatory
                requirements.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-foreground">
              4. Information Sharing and Disclosure
            </h2>
            <p className="mt-3">
              We do not sell your personal information. We may share information
              in the following circumstances:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <strong className="text-foreground">With Partner Law Firms:</strong> Qualified case
                information is delivered exclusively to a single partner firm as
                part of our case generation services.
              </li>
              <li>
                <strong className="text-foreground">Service Providers:</strong> We may share information
                with third-party vendors who assist in operating our website,
                conducting business, or servicing you, provided they agree to
                keep such information confidential.
              </li>
              <li>
                <strong className="text-foreground">Legal Requirements:</strong> We may disclose
                information when required to do so by law, court order, or
                governmental authority.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-foreground">
              5. Data Security
            </h2>
            <p className="mt-3">
              We implement commercially reasonable administrative, technical, and
              physical safeguards to protect your personal information from
              unauthorized access, use, or disclosure. However, no method of
              transmission over the internet or electronic storage is completely
              secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-foreground">
              6. Data Retention
            </h2>
            <p className="mt-3">
              We retain personal information for as long as necessary to fulfill
              the purposes outlined in this policy, comply with legal
              obligations, resolve disputes, and enforce our agreements.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-foreground">
              7. Your Rights
            </h2>
            <p className="mt-3">
              Depending on your jurisdiction, you may have the right to access,
              correct, delete, or restrict the processing of your personal
              information. To exercise any of these rights, please contact us at{" "}
              <a
                href="mailto:sales@case-bridge.com"
                className="text-secondary underline underline-offset-2 hover:text-secondary/80"
              >
                sales@case-bridge.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-foreground">
              8. Third-Party Links
            </h2>
            <p className="mt-3">
              Our website may contain links to third-party websites. We are not
              responsible for the privacy practices or content of those sites. We
              encourage you to review the privacy policies of any third-party
              sites you visit.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-foreground">
              9. Changes to This Policy
            </h2>
            <p className="mt-3">
              We may update this Privacy Policy from time to time. Any changes
              will be posted on this page with a revised &quot;Last updated&quot; date. We
              encourage you to review this policy periodically for any updates.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-xl font-bold text-foreground">
              10. Contact Us
            </h2>
            <p className="mt-3">
              If you have any questions about this Privacy Policy, please contact
              us at:
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
