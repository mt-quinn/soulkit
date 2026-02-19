import { cn } from '@/lib/utils';
import type { AppView } from '@/types';
import { Sparkles, Layers, Clock, Settings } from 'lucide-react';

interface SidebarProps {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
}

const navItems: { view: AppView; label: string; icon: typeof Sparkles }[] = [
  { view: 'generate', label: 'Generate', icon: Sparkles },
  { view: 'schemas', label: 'Schemas', icon: Layers },
  { view: 'history', label: 'History', icon: Clock },
  { view: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <Sparkles className="h-4 w-4 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-base font-bold tracking-tight">Soulkit</h1>
          <p className="text-[10px] text-muted-foreground leading-none">Character Generator</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2">
        <ul className="flex flex-col gap-1">
          {navItems.map(({ view, label, icon: Icon }) => (
            <li key={view}>
              <button
                onClick={() => onViewChange(view)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer',
                  activeView === view
                    ? 'bg-sidebar-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border px-5 py-3">
        <p className="text-[10px] text-muted-foreground">v0.1.0</p>
      </div>
    </aside>
  );
}
