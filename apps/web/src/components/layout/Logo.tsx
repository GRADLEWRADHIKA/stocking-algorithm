/** QuantDesk mark: a candle body whose wick becomes a rising step line. */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="1" y="1" width="22" height="22" rx="6" fill="rgb(var(--ink))" />
      <path d="M8 6.5v11" stroke="rgb(var(--ground))" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="6" y="9" width="4" height="5.5" rx="1" fill="rgb(var(--ground))" />
      <path d="M12.5 15.5l2.5-3 2 1.5 2.5-4" fill="none" stroke="rgb(var(--accent))" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <Logo />
      <span className="text-[15px] font-semibold tracking-tight">QuantDesk</span>
    </span>
  );
}
