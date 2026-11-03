'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** The Analysis Terminal opens on the last analysed symbol. */
export default function TerminalPage() {
  const router = useRouter();
  useEffect(() => {
    let s = 'RELIANCE';
    try {
      s = localStorage.getItem('quantdesk-last-symbol') || s;
    } catch {
      /* storage unavailable */
    }
    router.replace(`/stocks/${s}?tab=chart`);
  }, [router]);
  return null;
}
