import Image from "next/image";
import Link from "next/link";
import { Mail, MapPin } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-primary">
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
        {/* Top row: Logo + Contact */}
        <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Link href="#" className="inline-block">
              <Image
                src="/images/case-bridge-logo.png"
                alt="Case Bridge"
                width={300}
                height={90}
                className="h-16 w-auto brightness-0 invert opacity-90 sm:h-20 md:h-24"
              />
            </Link>
            <p className="mt-5 max-w-sm text-[13px] font-medium leading-6 text-primary-foreground/35">
              Pre-qualified, exclusive motor vehicle accident cases delivered
              directly to personal injury attorneys. Every case is screened,
              verified, and never shared.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <a
              href="mailto:sales@case-bridge.com"
              className="flex items-center gap-3 text-[13px] text-primary-foreground/50 transition-colors hover:text-primary-foreground/80"
            >
              <Mail className="h-4 w-4 shrink-0" />
              sales@case-bridge.com
            </a>
            <div className="flex items-center gap-3 text-[13px] text-primary-foreground/50">
              <MapPin className="h-4 w-4 shrink-0" />
              Atlanta, GA
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="mt-12 border-t border-primary-foreground/8" />

        {/* Bottom row */}
        <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-primary-foreground/30">
            {`\u00A9 ${new Date().getFullYear()} Case Bridge. All rights reserved.`}
          </p>
          <div className="flex gap-5">
            <Link
              href="/privacy"
              className="text-[12px] text-primary-foreground/30 transition-colors hover:text-primary-foreground/50"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="text-[12px] text-primary-foreground/30 transition-colors hover:text-primary-foreground/50"
            >
              Terms of Service
            </Link>
          </div>
        </div>

        {/* Disclaimer */}
        <p className="mt-6 max-w-3xl text-[11px] leading-5 text-primary-foreground/20">
          Case Bridge is a case generation service and does not provide legal
          advice. We are not a law firm and do not represent clients. All cases
          are provided to licensed attorneys and law firms in compliance with
          applicable regulations. Individual results may vary.
        </p>
      </div>
    </footer>
  );
}
