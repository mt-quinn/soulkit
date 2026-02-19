import { useState } from 'react';
import { Sidebar } from './Sidebar';
import type { AppView } from '@/types';
import { Toaster } from '@/components/ui/Toaster';

interface AppShellProps {
  children: (view: AppView) => React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [activeView, setActiveView] = useState<AppView>('generate');

  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />
      <main className="flex-1 overflow-hidden">
        {children(activeView)}
      </main>
      <Toaster />
    </div>
  );
}
