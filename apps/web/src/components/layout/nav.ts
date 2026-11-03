import {
  Activity,
  BarChart3,
  Bot,
  BriefcaseBusiness,
  CandlestickChart,
  FlaskConical,
  LayoutDashboard,
  ListChecks,
  Search,
  Settings,
  Shield,
  Star,
  Workflow,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  match?: string[];
  admin?: boolean;
}

export const NAV_GROUPS: NavItem[][] = [
  [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/markets', label: 'Markets', icon: BarChart3 },
    { href: '/explorer', label: 'Stock Explorer', icon: Search },
    { href: '/watchlist', label: 'Watchlist', icon: Star },
  ],
  [
    { href: '/terminal', label: 'Analysis Terminal', icon: CandlestickChart, match: ['/terminal', '/stocks'] },
    { href: '/strategies', label: 'Strategies', icon: Workflow },
    { href: '/backtesting', label: 'Backtesting', icon: FlaskConical },
    { href: '/signals', label: 'Signals', icon: Activity },
  ],
  [
    { href: '/paper-trading', label: 'Paper Trading', icon: ListChecks },
    { href: '/portfolio', label: 'Portfolio', icon: BriefcaseBusiness },
    { href: '/assistant', label: 'AI Assistant', icon: Bot },
  ],
];

export const NAV_FOOT: NavItem[] = [
  { href: '/admin', label: 'Admin', icon: Shield, admin: true },
  { href: '/settings', label: 'Settings', icon: Settings },
];
