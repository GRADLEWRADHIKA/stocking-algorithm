'use client';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useElementWidth } from '@/hooks/useElementWidth';
import { ChartFragment, IndicesFragment, ReadoutFragment, SignalFragment } from './Fragments';
import type { Signal } from '@shared/types/api';

/**
 * Sentence split by a frame: the two halves of the headline hold their place while a reel of live
 * product fragments advances through the centre column as the page scrolls (sticky stage).
 */
export function Hero({ signal }: { signal: Signal | undefined }) {
  const reduce = useReducedMotion();
  const track = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: track, offset: ['start start', 'end end'] });
  const [step, setStep] = useState(0);
  const [reel, reelW] = useElementWidth<HTMLDivElement>(504);
  const frameH = (reelW * 9) / 16;
  const symbol = signal?.symbol ?? 'INFY';

  const frames = [
    { key: 'signal', node: <SignalFragment s={signal} />, caption: 'Every signal lists the rules it checked, which ones held, and how its strength was scored.' },
    { key: 'chart', node: <ChartFragment symbol={symbol} />, caption: 'Candles, eleven indicators and a Supertrend trailing stop on every timeframe from 1 minute to 1 month.' },
    { key: 'indices', node: <IndicesFragment />, caption: 'Five indices and 51 NSE stocks streamed from a local, seeded market simulator, labelled as such.' },
    { key: 'readout', node: <ReadoutFragment symbol={symbol} />, caption: 'Nine strategies read the same chart at once, each with a strength score that is never passed off as a probability.' },
  ];

  useMotionValueEvent(scrollYProgress, 'change', (v) => setStep(Math.min(frames.length - 1, Math.max(0, Math.floor(v * frames.length * 0.999)))));

  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // phones have no pinned stage: the frame advances on a timer instead
  const [mobileStep, setMobileStep] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setMobileStep((s) => (s + 1) % frames.length), 4500);
    return () => clearInterval(t);
  }, [reduce, frames.length]);

  return (
    <section aria-labelledby="hero-title">
      {/* phone */}
      {!desktop && (
      <div className="px-4 pb-12 pt-6">
        <h1 className="text-[9vw] font-medium leading-[1.02] tracking-[-0.03em]">
          Signals that<span className="sr-only"> show their working.</span>
        </h1>
        <div className="my-5 aspect-[4/3]">
          <AnimatePresence mode="wait">
            <motion.div key={mobileStep} className="h-full" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.35 }}>
              {frames[mobileStep].node}
            </motion.div>
          </AnimatePresence>
        </div>
        <p className="text-right text-[9vw] font-medium leading-[1.02] tracking-[-0.03em]" aria-hidden>
          show their working.
        </p>
        <p className="mt-6 text-base text-ink">{frames[mobileStep].caption}</p>
      </div>
      )}
      {/* desktop: pinned story */}
      {desktop && (
      <div ref={track} className="relative h-[300vh]">
        <div className="sticky top-16 flex h-[calc(100vh-64px)] items-center overflow-hidden">
          <h1 id="hero-title" className="absolute inset-x-8 top-1/2 z-10 flex -translate-y-1/2 justify-between text-[clamp(34px,2.9vw,52px)] font-medium leading-none tracking-[-0.035em]">
            <motion.span initial={{ opacity: 0.4, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
              Signals that
            </motion.span>
            <motion.span initial={{ opacity: 0.4, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}>
              show their working.
            </motion.span>
          </h1>

          <div ref={reel} className="absolute left-1/2 top-1/2 w-[38vw] -translate-x-1/2 -translate-y-1/2 overflow-hidden" style={{ height: frameH + 168 }}>
            <motion.div
              className="flex flex-col gap-6 pt-[84px]"
              animate={{ y: -step * (frameH + 24) }}
              transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 22 }}
            >
              {frames.map((f, i) => (
                <motion.div
                  key={f.key}
                  className="w-full flex-none"
                  style={{ height: frameH }}
                  animate={{ opacity: i === step ? 1 : 0.45, scale: i === step ? 1 : 0.97 }}
                  transition={{ duration: 0.4 }}
                  aria-hidden={i !== step}
                >
                  {f.node}
                </motion.div>
              ))}
            </motion.div>
          </div>

          <div className="absolute bottom-8 left-8 max-w-[30vw]">
            <AnimatePresence mode="wait">
              <motion.p
                key={step}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.3 }}
                className="text-lg leading-snug text-ink"
              >
                {frames[step].caption}
              </motion.p>
            </AnimatePresence>
            <div className="mt-4 flex gap-1.5" aria-hidden>
              {frames.map((f, i) => (
                <span key={f.key} className={cn('h-0.5 w-6 rounded-full transition-colors duration-300', i === step ? 'bg-accent' : 'bg-line')} />
              ))}
            </div>
          </div>
          <p className="absolute bottom-8 right-8 max-w-[24vw] text-right text-[15px] text-muted">
            Quantitative analysis, backtesting and paper trading for NSE and BSE equities. Runs on your own machine.
          </p>
        </div>
      </div>

      )}
    </section>
  );
}
