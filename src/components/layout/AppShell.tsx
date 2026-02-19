import { useEffect } from 'react';
import { Sidebar } from './Sidebar';
import type { AppView } from '@/types';
import { Toaster } from '@/components/ui/Toaster';
import { UniversalCommandBar } from './UniversalCommandBar';
import { ConsolePopup } from './ConsolePopup';
import { useLlmBarStore } from '@/stores/llmBarStore';
import { useNavigationStore } from '@/stores/navigationStore';

interface AppShellProps {
  children: (view: AppView) => React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { activeView, setActiveView } = useNavigationStore();
  const { setConfig } = useLlmBarStore();

  useEffect(() => {
    if (activeView === 'settings') {
      setConfig({
        chips: [{ id: 'ctx', label: 'Settings' }],
        placeholder: 'LLM input unavailable in Settings.',
        submitLabel: 'Run',
        disabled: true,
        disabledReason: 'Switch to Create, Profiles, or Schemas.',
        onSubmit: undefined,
        busy: false,
      });
    } else {
      setConfig({
        chips: [{ id: 'ctx', label: activeView === 'generate' ? 'Create' : activeView === 'history' ? 'Profiles' : activeView === 'chat' ? 'Chat' : 'Schemas' }],
        placeholder: 'Type a command…',
        submitLabel: 'Run',
        disabled: true,
        disabledReason: 'Select a context to run this command.',
        onSubmit: undefined,
        busy: false,
      });
    }
  }, [activeView, setConfig]);

  const handleViewChange = (view: AppView) => {
    setActiveView(view);
  };

  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar activeView={activeView} onViewChange={handleViewChange} />
      <div className="relative flex-1 overflow-hidden">
        <main className="h-full overflow-hidden pb-28">
          {children(activeView)}
        </main>
        <ConsolePopup />
        <UniversalCommandBar />
      </div>
      <Toaster />
    </div>
  );
}
