import { useEffect, useMemo, useRef, useState } from 'react';
import { useProfileStore } from '@/stores/profileStore';
import { useSchemaStore } from '@/stores/schemaStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useLlmBarStore } from '@/stores/llmBarStore';
import { ProfileCard } from './ProfileCard';
import { ProfileRefinePanel } from './ProfileRefinePanel';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { resolveGeneratedProfileDisplayName } from '@/lib/profileIdentity';
import { toast } from '@/stores/toastStore';
import { Clock, Search, X } from 'lucide-react';

interface HistoryListProps {
  isActive?: boolean;
}

export function HistoryList({ isActive = true }: HistoryListProps) {
  const { profiles, activeProfile, setActiveProfile, duplicateProfile, deleteProfile } = useProfileStore();
  const { presets } = useSchemaStore();
  const { hasApiKey, settings, setDeleteWarningSuppressed } = useSettingsStore();
  const { setConfig, resetConfig } = useLlmBarStore();

  const [search, setSearch] = useState('');
  const [schemaFilter, setSchemaFilter] = useState('');
  const [externalCommand, setExternalCommand] = useState<{ id: number; text: string } | null>(null);
  const [isProfileBusy, setIsProfileBusy] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [skipDeleteWarningChecked, setSkipDeleteWarningChecked] = useState(false);

  const commandSeq = useRef(0);

  const schemaNames = [...new Set(profiles.map((p) => p.schemaName))];

  const filtered = profiles.filter((p) => {
    if (schemaFilter && p.schemaName !== schemaFilter) return false;
    if (search) {
      const query = search.toLowerCase();
      const profileStr = JSON.stringify(p.profile).toLowerCase();
      const nameMatch = p.schemaName.toLowerCase().includes(query);
      return nameMatch || profileStr.includes(query);
    }
    return true;
  });

  const activeProfileName = useMemo(() => {
    if (!activeProfile) return null;
    const schema = presets.find((preset) => preset.id === activeProfile.schemaId) ?? null;
    return resolveGeneratedProfileDisplayName(activeProfile, { schema, fallback: activeProfile.schemaName });
  }, [activeProfile, presets]);

  const pendingDeleteProfileName = useMemo(() => {
    if (!pendingDeleteId) return '';
    const profile = profiles.find((item) => item.id === pendingDeleteId);
    if (!profile) return '';
    const schema = presets.find((preset) => preset.id === profile.schemaId) ?? null;
    return resolveGeneratedProfileDisplayName(profile, { schema, fallback: profile.schemaName });
  }, [pendingDeleteId, presets, profiles]);

  const handleDuplicate = async (id: string) => {
    const duplicated = await duplicateProfile(id);
    if (!duplicated) {
      toast('Duplicate failed', 'Could not duplicate that profile.', 'error');
      return;
    }
    setActiveProfile(duplicated.id);
    toast('Profile duplicated', 'A copy was added to Profiles.', 'success');
  };

  const handleDelete = async () => {
    if (!pendingDeleteId) return;
    if (skipDeleteWarningChecked) {
      await setDeleteWarningSuppressed('profiles', true);
    }
    await deleteProfile(pendingDeleteId);
    setSkipDeleteWarningChecked(false);
    setPendingDeleteId(null);
    setDeleteDialogOpen(false);
    toast('Profile deleted', 'The profile has been removed.', 'default');
  };

  const requestDeleteProfile = async (id: string) => {
    if (settings.ui.skipDeleteConfirmations.profiles) {
      await deleteProfile(id);
      toast('Profile deleted', 'The profile has been removed.', 'default');
      return;
    }
    setSkipDeleteWarningChecked(false);
    setPendingDeleteId(id);
    setDeleteDialogOpen(true);
  };

  useEffect(() => {
    if (!isActive) return;

    if (!activeProfile) {
      setConfig({
        chips: [{ id: 'view', label: 'Profiles' }],
        placeholder: 'Select a profile to run AI commands.',
        submitLabel: 'Refine',
        disabled: true,
        disabledReason: 'Pick a profile from the list first.',
        busy: false,
        onSubmit: undefined,
      });
      return;
    }

    if (!hasApiKey()) {
      setConfig({
        chips: [
          { id: 'view', label: 'Profiles' },
          { id: 'schema', label: `Schema: ${activeProfile.schemaName}` },
          { id: 'profile', label: `Profile: ${activeProfileName ?? activeProfile.id.slice(0, 8)}` },
        ],
        placeholder: 'Add your OpenAI key in Settings to refine profiles.',
        submitLabel: 'Refine',
        disabled: true,
        disabledReason: 'Open Settings and add an API key.',
        busy: false,
        onSubmit: undefined,
      });
      return;
    }

    setConfig({
      chips: [
        { id: 'view', label: 'Profiles' },
        { id: 'schema', label: `Schema: ${activeProfile.schemaName}` },
        { id: 'profile', label: `Profile: ${activeProfileName ?? activeProfile.id.slice(0, 8)}` },
        { id: 'mode', label: 'Mode: Refine' },
      ],
      placeholder: 'Refine this profile. Targets and locks come from field chips.',
      submitLabel: 'Refine',
      disabled: false,
      disabledReason: undefined,
      busy: isProfileBusy,
      onSubmit: (prompt) => {
        commandSeq.current += 1;
        setExternalCommand({ id: commandSeq.current, text: prompt });
      },
    });
  }, [activeProfile, activeProfileName, hasApiKey, isActive, isProfileBusy, setConfig]);

  useEffect(() => {
    if (!isActive) return;
    return () => resetConfig();
  }, [isActive, resetConfig]);

  return (
    <div className="flex h-full">
      <div className="w-80 shrink-0 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Profiles</h2>
            <span className="text-xs text-muted-foreground">
              {filtered.length} profile{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search profiles..."
              className="h-8 text-xs pl-8 pr-8"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {schemaNames.length > 1 && (
            <Select
              value={schemaFilter}
              onValueChange={setSchemaFilter}
              options={[
                { value: '', label: 'All schemas' },
                ...schemaNames.map((n) => ({ value: n, label: n })),
              ]}
            />
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {filtered.map((profile) => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              active={activeProfile?.id === profile.id}
              onClick={() => setActiveProfile(profile.id)}
              onDuplicate={() => void handleDuplicate(profile.id)}
              onDelete={() => void requestDeleteProfile(profile.id)}
              compact
            />
          ))}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Clock className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                {profiles.length === 0
                  ? 'No profiles generated yet.'
                  : 'No profiles match your search.'}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeProfile ? (
          <div className="max-w-3xl mx-auto p-6 space-y-4">
            <ProfileRefinePanel
              profile={activeProfile}
              externalCommand={externalCommand}
              onBusyChange={setIsProfileBusy}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-1">No profile selected</h3>
              <p className="text-sm text-muted-foreground">
                Select a profile from the list to view and edit it.
              </p>
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) {
            setPendingDeleteId(null);
            setSkipDeleteWarningChecked(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Profile</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Are you sure you want to delete "{pendingDeleteProfileName}"? This action cannot be undone.
          </p>
          <label className="flex items-center gap-2 text-xs text-muted-foreground pb-2">
            <input
              type="checkbox"
              checked={skipDeleteWarningChecked}
              onChange={(event) => setSkipDeleteWarningChecked(event.target.checked)}
              className="h-3.5 w-3.5 accent-primary"
            />
            Do not show this again
          </label>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setDeleteDialogOpen(false);
                setPendingDeleteId(null);
                setSkipDeleteWarningChecked(false);
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
