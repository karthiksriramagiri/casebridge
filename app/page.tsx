import { Navbar } from "@/components/navbar";
import { Hero } from "@/components/hero";
import { TrustBar } from "@/components/trust-bar";
import { Services } from "@/components/services";
import { About } from "@/components/about";
import { Process } from "@/components/process";
import { Testimonials } from "@/components/testimonials";
import { CtaSection } from "@/components/cta-section";
import { FaqSection } from "@/components/faq-section";
import { ContactForm } from "@/components/contact-form";
import { Footer } from "@/components/footer";

export default function Page() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <TrustBar />
        <About />
        <Services />
        <Process />
        <Testimonials />
        <CtaSection />
        <FaqSection />
        <ContactForm />
      </main>
      <Footer />
    </>
  );
}
