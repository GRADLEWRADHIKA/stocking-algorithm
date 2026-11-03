'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useAuth } from '@/stores/auth';
import { Logo } from '@/components/layout/Logo';
import { Hero } from '@/components/landing/Hero';
import { LiveDemo } from '@/components/landing/LiveDemo';
import { Cta, Footer, HowItWorks, MobileApp, Stack } from '@/components/landing/Sections';
import { useDemoSignal, useLatestSignals } from '@/components/landing/data';

function Nav() {
  const { hydrated, accessToken } = useAuth();
  const authed = hydrated && !!accessToken;
  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between bg-ground px-4 md:px-8"
    >
      <Link href="/" className="flex items-center gap-2" aria-label="QuantDesk home">
        <Logo size={24} />
        <span className="text-[15px] font-semibold tracking-tight">QuantDesk</span>
      </Link>
      <nav className="flex items-center gap-5 text-[15px] md:gap-7" aria-label="Landing">
        <a href="#demo" className="hidden text-muted transition-colors hover:text-ink md:inline">
          Live demo
        </a>
        <a href="#how" className="hidden text-muted transition-colors hover:text-ink md:inline">
          How it works
        </a>
        <a href="#mobile" className="hidden text-muted transition-colors hover:text-ink sm:inline">
          App
        </a>
        <Link
          href={authed ? '/dashboard' : '/login'}
          className="rounded-ctl bg-accent px-4 py-2 font-medium text-ground transition-[filter,transform] hover:brightness-110 active:scale-[0.97]"
        >
          {authed ? 'Open terminal' : 'Log in'}
        </Link>
      </nav>
    </motion.header>
  );
}

export default function Landing() {
  // one signal feeds the hero reel and the how-it-works evidence
  // the hero shows the most recent actionable signal from the last scan; Supertrend on INFY if there is none
  const latest = useLatestSignals().data?.find((s) => s.action !== 'HOLD');
  const fallback = useDemoSignal({ symbol: 'INFY', strategy_key: 'supertrend', timeframe: '1d', params: {} }).data;
  const signal = latest ?? fallback;
  return (
    <div className="min-h-screen bg-ground pt-16">
      <Nav />
      <main>
        <Hero signal={signal} />
        <LiveDemo />
        <HowItWorks signal={signal} />
        <MobileApp />
        <Stack />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}
