'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { TickerTape } from '@/components/layout/TickerTape';
import { useAuth } from '@/stores/auth';
import { useUi } from '@/stores/ui';
import { useMarketStream } from '@/hooks/useMarketStream';
import { get } from '@/lib/api';
import type { User } from '@shared/types/api';
import { Logo } from '@/components/layout/Logo';

function Stream() {
  useMarketStream();
  return null;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { hydrated, accessToken, setUser } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const setTheme = useUi((s) => s.setTheme);

  useEffect(() => {
    if (hydrated && !accessToken) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [hydrated, accessToken, router, path]);

  // refresh the profile once per session so role/preferences are current
  const me = useQuery({ queryKey: ['me'], queryFn: () => get<User>('/users/me'), enabled: !!accessToken, staleTime: 5 * 60_000 });
  useEffect(() => {
    if (me.data) {
      setUser(me.data);
      if (me.data.preferences?.theme) setTheme(me.data.preferences.theme);
    }
  }, [me.data, setUser, setTheme]);

  if (!hydrated || !accessToken) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-pulse">
          <Logo size={32} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Stream />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <TickerTape />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
