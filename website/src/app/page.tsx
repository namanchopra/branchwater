import { SiteFx } from "@/components/effects/site-fx";
import { Navbar } from "@/components/sections/navbar";
import { Hero } from "@/components/sections/hero";
import { Features } from "@/components/sections/features";
import { How } from "@/components/sections/how";
import { Compare } from "@/components/sections/compare";
import { Privacy } from "@/components/sections/privacy";
import { Install } from "@/components/sections/install";
import { Cta } from "@/components/sections/cta";
import { Footer } from "@/components/sections/footer";

export default function Home() {
  return (
    <>
      {/* Animated backdrop (node constellation + aurora + grain) and all the
          cursor/scroll interactions are wired up here, one client island. */}
      <SiteFx />

      <Navbar />

      <main id="main">
        <span id="top" aria-hidden="true" />
        <Hero />
        <Features />
        <How />
        <Compare />
        <Privacy />
        <Install />
        <Cta />
      </main>

      <Footer />
    </>
  );
}
