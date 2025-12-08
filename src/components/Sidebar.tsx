import { CreditCard, Users } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const menuItems = [
  {
    name: 'Credit Card',
    path: '/credit-card',
    icon: CreditCard,
  },
  {
    name: 'Rippling',
    path: '/rippling',
    icon: Users,
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
