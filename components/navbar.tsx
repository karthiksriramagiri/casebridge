"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const navLinks = [
  { label: "Services", href: "#services" },
  { label: "About", href: "#why-us" },
  { label: "Process", href: "#process" },
  { label: "Testimonials", href: "#testimonials" },
  { label: "FAQ", href: "#faq" },
];

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      {/* Top utility bar */}
      <div className="hidden bg-primary text-primary-foreground lg:block">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-2 sm:px-8">
          <p className="text-xs tracking-wide text-primary-foreground/50">
            Pre-qualified, exclusive MVA cases for personal injury firms nationwide
          </p>
        </div>
      </div>

      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-background/95 shadow-[0_1px_3px_rgba(0,0,0,0.08)] backdrop-blur-sm"
            : "bg-background"
        } border-b border-border`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 sm:px-8">
          <Link href="#" className="flex items-center">
            <Image
              src="/images/case-bridge-logo.png"
              alt="Case Bridge"
              width={440}
              height={132}
              className="h-16 w-auto sm:h-24 lg:h-36 lg:-my-12"
              priority
            />
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="rounded-md px-4 py-2 text-[15px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <Button
              asChild
              className="bg-secondary text-secondary-foreground hover:bg-secondary/90 gap-2 px-5 shadow-none"
            >
              <a href="https://calendly.com/case-bridge-sales/30min" target="_blank" rel="noopener noreferrer">
                Get Started
                <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </Button>
          </div>

          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-md border border-border text-foreground lg:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>

        {mobileOpen && (
          <div className="border-t border-border bg-background px-5 pb-6 pt-2 sm:px-8 lg:hidden">
            <nav className="flex flex-col">
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="border-b border-border py-3.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground last:border-0"
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="mt-4">
              <Button
                asChild
                className="bg-secondary text-secondary-foreground hover:bg-secondary/90 w-full"
              >
                <a href="https://calendly.com/case-bridge-sales/30min" target="_blank" rel="noopener noreferrer" onClick={() => setMobileOpen(false)}>
                  Get Started
                </a>
              </Button>
            </div>
          </div>
        )}
      </header>
    </>
  );
}
