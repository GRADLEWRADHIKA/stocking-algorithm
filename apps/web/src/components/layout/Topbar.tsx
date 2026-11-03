'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import * as Popover from '@radix-ui/react-popover';
import * as D from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, LogOut, Menu, Moon, Settings, Sun, User as UserIcon, X } from 'lucide-react';
import { useMarketStatus, useNotificationMutations, useNotifications, useUpdatePreferences } from '@/hooks/queries';
import { useAuth } from '@/stores/auth';
import { useLive } from '@/stores/live';
import { useUi } from '@/stores/ui';
import { post } from '@/lib/api';
import { relative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { SymbolSearch } from './SymbolSearch';
import { SidebarContent } from './Sidebar';

function SessionStatus() {
  const { data } = useMarketStatus();
  const connected = useLive((s) => s.connected);
  const session = data?.session ?? 'CLOSED';
  const label = session === 'OPEN' ? 'Session open' : session === 'PRE_OPEN' ? 'Pre-open' : 'Session closed';
  return (
    <div className="hidden items-center gap-3 text-xs md:flex">
      <span className="flex items-center gap-1.5 text-muted" title="Simulated NSE session clock, Asia/Kolkata">
        <span className={cn('h-1.5 w-1.5 rounded-full', session === 'OPEN' ? 'animate-pulse-dot bg-up' : 'bg-faint')} />
        {label}
      </span>
      <span className="flex items-center gap-1.5 text-muted" title="WebSocket connection to the local simulator">
        <span className={cn('h-1.5 w-1.5 rounded-full', connected ? 'bg-up' : 'bg-down')} />
        {connected ? 'Stream live' : 'Stream offline'}
      </span>
    </div>
  );
}

function Notifications() {
  const { data } = useNotifications();
  const { read, readAll } = useNotificationMutations();
  const unread = (data ?? []).filter((n) => !n.is_read).length;
  return (
    <Popover.Root>
      <Popover.Trigger className="relative rounded-ctl p-2 text-muted transition-colors hover:bg-raised hover:text-ink" aria-label={`Notifications, ${unread} unread`}>
        <Bell className="h-4 w-4" />
        <AnimatePresence>
          {unread > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="num absolute right-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-0.5 text-[9px] font-semibold text-ground"
            >
              {unread > 9 ? '9+' : unread}
            </motion.span>
          )}
        </AnimatePresence>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="z-50 w-[360px] max-w-[calc(100vw-24px)] rounded-card border border-line bg-surface shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1">
          <div className="panel-head">
            <span className="panel-title">Notifications</span>
            {unread > 0 && (
              <button className="text-xs text-muted hover:text-ink" onClick={() => readAll.mutate()}>
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-[360px] overflow-y-auto">
            {(data ?? []).length === 0 && <li className="px-4 py-8 text-center text-xs text-muted">No notifications yet. Alerts and order fills appear here.</li>}
            {(data ?? []).slice(0, 30).map((n) => (
              <li key={n.id} className="border-t border-rule first:border-t-0">
                <button onClick={() => !n.is_read && read.mutate(n.id)} className="flex w-full gap-3 px-4 py-3 text-left hover:bg-raised/60">
                  <span className={cn('mt-1.5 h-1.5 w-1.5 flex-none rounded-full', n.is_read ? 'bg-transparent' : 'bg-accent')} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-ink">{n.title}</span>
                    <span className="block text-xs text-muted">{n.body}</span>
                  </span>
                  <span className="flex-none text-[11px] text-faint">{relative(n.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-rule px-4 py-2 text-right">
            <Link href="/watchlist#alerts" className="text-xs text-muted hover:text-ink">
              Manage alerts
            </Link>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useUi();
  const token = useAuth((s) => s.accessToken);
  const prefs = useUpdatePreferences();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      onClick={() => {
        setTheme(next);
        if (token) prefs.mutate({ theme: next });
      }}
      className="rounded-ctl p-2 text-muted transition-colors hover:bg-raised hover:text-ink"
      aria-label={`Switch to ${next} theme`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={theme} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.18 }} className="block">
          {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

function UserMenu() {
  const { user, refreshToken, clear } = useAuth();
  const router = useRouter();
  const initials = (user?.full_name || user?.email || '?')
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const logout = async () => {
    try {
      if (refreshToken) await post('/auth/logout', { refresh_token: refreshToken });
    } catch {
      /* token may already be invalid */
    }
    clear();
    router.replace('/login');
  };
  return (
    <Dropdown.Root>
      <Dropdown.Trigger className="flex h-8 w-8 items-center justify-center rounded-full bg-raised text-[11px] font-semibold text-ink ring-1 ring-line transition hover:ring-faint" aria-label="Account menu">
        {initials}
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={8} className="z-50 min-w-[220px] rounded-card border border-line bg-surface p-1 shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <div className="px-3 py-2">
            <div className="text-[13px] font-medium">{user?.full_name}</div>
            <div className="text-xs text-muted">{user?.email}</div>
            <div className="mt-1 text-[11px] text-faint">{user?.role === 'ADMIN' ? 'Administrator' : 'Paper-trading account'}</div>
          </div>
          <Dropdown.Separator className="my-1 h-px bg-rule" />
          <Dropdown.Item asChild>
            <Link href="/settings" className="flex items-center gap-2 rounded px-3 py-2 text-[13px] text-muted outline-none data-[highlighted]:bg-raised data-[highlighted]:text-ink">
              <UserIcon className="h-3.5 w-3.5" /> Profile
            </Link>
          </Dropdown.Item>
          <Dropdown.Item asChild>
            <Link href="/settings" className="flex items-center gap-2 rounded px-3 py-2 text-[13px] text-muted outline-none data-[highlighted]:bg-raised data-[highlighted]:text-ink">
              <Settings className="h-3.5 w-3.5" /> Settings
            </Link>
          </Dropdown.Item>
          <Dropdown.Item onSelect={logout} className="flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-[13px] text-muted outline-none data-[highlighted]:bg-raised data-[highlighted]:text-down">
            <LogOut className="h-3.5 w-3.5" /> Log out
          </Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Trigger className="rounded-ctl p-2 text-muted hover:bg-raised hover:text-ink lg:hidden" aria-label="Open navigation">
        <Menu className="h-4 w-4" />
      </D.Trigger>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <D.Content className="fixed inset-y-0 left-0 z-50 w-[260px] border-r border-line bg-ground data-[state=open]:animate-in data-[state=open]:slide-in-from-left">
          <D.Title className="sr-only">Navigation</D.Title>
          <D.Close className="absolute right-3 top-4 rounded p-1 text-muted hover:text-ink" aria-label="Close navigation">
            <X className="h-4 w-4" />
          </D.Close>
          <SidebarContent collapsed={false} onNavigate={() => setOpen(false)} />
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function Topbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ground/95 backdrop-blur-none">
      <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
        <MobileNav />
        <div className="w-full max-w-[420px]">
          <SymbolSearch />
        </div>
        <div className="ml-auto flex items-center gap-1 sm:gap-3">
          <SessionStatus />
          <Notifications />
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
