import { VoiceChat } from '../client/VoiceChat';
import { ExamplesCarousel } from "./components/ExamplesCarousel";
import { FAQ } from "./components/FAQ";
import { FeaturesGrid } from "./components/FeaturesGrid";
import { Footer } from "./components/Footer";
import { Hero } from "./components/Hero";
import { SchemaMarkup } from "./components/SchemaMarkup";
import { Testimonials } from "./components/Testimonials";
import {
  examples,
  faqs,
  features,
  footerNavigation,
  testimonials,
} from "./contentSections";
import { AIReady } from "./ExampleHighlightedFeature";

export function LandingPage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <SchemaMarkup />
      <main className="isolate p-4">
        <Hero />
        
        {/* Visible debug container */}
        <div className="my-12 p-6 border-2 border-emerald-500 rounded-xl bg-slate-900 text-center max-w-xl mx-auto shadow-2xl">
          <h2 className="text-xl font-bold text-emerald-400 mb-2">Alpha Voice Control Center</h2>
          <VoiceChat />
        </div>

        <ExamplesCarousel examples={examples} />
        <AIReady />
        <FeaturesGrid features={features} />
        <Testimonials testimonials={testimonials} />
        <FAQ faqs={faqs} />
      </main>
      <Footer footerNavigation={footerNavigation} />
    </div>
  );
}

export default LandingPage;
