import type { Metadata } from "next";
import CTA from "@/components/ctaLandingPage";
import Features from "@/components/features";
import Footer from "@/components/footer";
import Header from "@/components/header";
import Hero from "@/components/hero";
import Marquee from "@/components/marqueeLandingPage";
import Pricing from "@/components/pricing";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
};

export default function Home() {
  return (
    <main className="bg-canvas min-h-screen">
      <Header />
      <Hero />
      <Marquee />
      <Features />
      <Pricing />
      <CTA />
      <Footer />
    </main>
  );
}
