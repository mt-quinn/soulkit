import { useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { SchemaEditor } from '@/components/schema/SchemaEditor';
import { HistoryList } from '@/components/profile/HistoryList';
import { StudioPanel } from '@/components/studio/StudioPanel';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSchemaStore } from '@/stores/schemaStore';
import { useProfileStore } from '@/stores/profileStore';
import type { AppView } from '@/types';

function App() {
  const { loadSettings, loaded: settingsLoaded } = useSettingsStore();
  const { loadPresets, loaded: schemasLoaded } = useSchemaStore();
  const { loadProfiles, loaded: profilesLoaded } = useProfileStore();

  useEffect(() => {
    loadSettings();
    loadPresets();
    loadProfiles();
  }, [loadSettings, loadPresets, loadProfiles]);

  const allLoaded = settingsLoaded && schemasLoaded && profilesLoaded;

  if (!allLoaded) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-background">
        <div className="text-center">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading Soulkit...</p>
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      {(view: AppView) => {
        switch (view) {
          case 'generate':
            return <StudioPanel />;
          case 'schemas':
            return <SchemaEditor />;
          case 'history':
            return <HistoryList />;
          case 'settings':
            return <SettingsPage />;
          default:
            return <StudioPanel />;
        }
      }}
    </AppShell>
  );
}

export default App;
