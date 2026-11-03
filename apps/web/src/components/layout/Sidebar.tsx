'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import * as Tooltip from '@radix-ui/react-tooltip';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUi } from '@/stores/ui';
import { useAuth } from '@/stores/auth';
import { NAV_FOOT, NAV_GROUPS, type NavItem } from './nav';
import { Logo } from './Logo';

function isActive(path: string, item: NavItem) {
  return (item.match ?? [item.href]).some((m) => path === m || path.startsWith(`${m}/`));
}

function Item({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const path = usePathname();
  const active = isActive(path, item);
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex h-8 items-center gap-2.5 rounded-ctl px-2.5 text-[13px] transition-colors',
        active ? 'bg-raised text-ink' : 'text-muted hover:bg-raised/60 hover:text-ink',
        collapsed && 'justify-center px-0',
      )}
    >
      {active && (
        <motion.span
          layoutId="nav-line"
          className="absolute -left-3 top-1.5 bottom-1.5 w-0.5 rounded-r bg-accent"
          transition={{ type: 'spring', stiffness: 500, damping: 38 }}
        />
      )}
      <Icon className={cn('h-4 w-4 flex-none transition-transform duration-200 group-hover:scale-110', active && 'text-ink')} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{link}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side="right" sideOffset={8} className="z-50 rounded border border-line bg-surface px-2 py-1 text-xs shadow-lg">
          {item.label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const user = useAuth((s) => s.user);
  const toggle = useUi((s) => s.toggleSidebar);
  return (
    <div className="flex h-full flex-col px-3 pb-3">
      <div className={cn('flex h-14 items-center gap-2', collapsed ? 'justify-center' : 'px-1')}>
        <Link href="/dashboard" className="flex items-center gap-2" onClick={onNavigate}>
          <Logo />
          {!collapsed && <span className="text-[15px] font-semibold tracking-tight">QuantDesk</span>}
        </Link>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto pt-2" aria-label="Main">
        {NAV_GROUPS.map((g, i) => (
          <div key={i} className="space-y-0.5">
            {g.map((it) => (
              <Item key={it.href} item={it} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>
      <div className="space-y-0.5 pt-3">
        {NAV_FOOT.filter((i) => !i.admin || user?.role === 'ADMIN').map((it) => (
          <Item key={it.href} item={it} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
        <button
          onClick={toggle}
          className={cn('hidden h-8 w-full items-center gap-2.5 rounded-ctl px-2.5 text-[13px] text-muted hover:bg-raised/60 hover:text-ink lg:flex', collapsed && 'justify-center px-0')}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!collapsed && 'Collapse'}
        </button>
      </div>
    </div>
  );
}

export function Sidebar() {
  const collapsed = useUi((s) => s.sidebarCollapsed);
  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 232 }}
      transition={{ type: 'spring', stiffness: 400, damping: 40 }}
      className="sticky top-0 hidden h-screen flex-none border-r border-line bg-ground lg:block"
    >
      <SidebarContent collapsed={collapsed} />
    </motion.aside>
  );
}
