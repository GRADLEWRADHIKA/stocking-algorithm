'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useUi } from '@/stores/ui';
import { ApiError } from '@/lib/api';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: false,
            retry: (n, e) => !(e instanceof ApiError && [400, 401, 403, 404, 422].includes(e.status)) && n < 2,
          },
        },
      }),
  );
  const theme = useUi((s) => s.theme);

  useEffect(() => {
    const el = document.documentElement;
    el.classList.remove('dark', 'light');
    el.classList.add(theme);
  }, [theme]);

  return (
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="user">
        <Tooltip.Provider delayDuration={250}>
          {children}
          <Toaster
            theme={theme}
            position="bottom-right"
            toastOptions={{ className: '!bg-surface !border-line !text-ink !rounded-card', descriptionClassName: '!text-muted' }}
          />
        </Tooltip.Provider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
