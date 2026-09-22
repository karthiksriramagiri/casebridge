import { Navbar } from "@/components/navbar";
import { Hero } from "@/components/hero";
import { Services } from "@/components/services";
import { About } from "@/components/about";
import { Process } from "@/components/process";
import { Testimonials } from "@/components/testimonials";
import { CtaSection } from "@/components/cta-section";
import { FaqSection } from "@/components/faq-section";
import { ContactForm } from "@/components/contact-form";
import { Footer } from "@/components/footer";

/* The compliance marks that used to sit in their own full-width band directly
   under the hero now sit inside it, next to the specification table they were
   repeating. That band, the top utility bar and the hero badge were all making
   the same claim within 400px of each other. */

export default function Page() {
  return (
    <div className="cb">
      <Navbar />
      <main>
        <Hero />
        <Services />
        <About />
        <Process />
        <Testimonials />
        <FaqSection />
        <CtaSection />
        <ContactForm />
      </main>
      <Footer />
    </div>
  );
}
