import { CreditCard, Users, Wallet, Car, BarChart3, History, FileSpreadsheet, Plane, Monitor } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const menuItems = [
  {
    name: 'Credit Card',
    path: '/credit-card',
    icon: CreditCard,
  },
  {
    name: 'Rippling Expenses',
    path: '/rippling-expenses',
    icon: FileSpreadsheet,
  },
  {
    name: 'Michael Card',
    path: '/michael-card',
    icon: Wallet,
  },
  {
    name: 'Uber',
    path: '/uber',
    icon: Car,
  },
  {
    name: 'Consolidated Expenses',
    path: '/expenses-ytd',
    icon: BarChart3,
  },
  {
    name: 'Travel Dashboard',
    path: '/travel',
    icon: Plane,
  },
  {
    name: 'IT Subscriptions',
    path: '/it-subscriptions',
    icon: Monitor,
  },
];

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-16 h-[calc(100vh-4rem)] w-64 border-r border-border/50 bg-background/80 backdrop-blur-lg">
      <nav className="p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-soft'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )
                }
              >
                <item.icon className="w-5 h-5" />
                {item.name}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
