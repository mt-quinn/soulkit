import { useState } from 'react';
import { useProfileStore } from '@/stores/profileStore';
import { ProfileCard } from './ProfileCard';
import { ProfileViewer } from './ProfileViewer';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Clock, Search, X } from 'lucide-react';

export function HistoryList() {
  const { profiles, activeProfile, setActiveProfile } = useProfileStore();
  const [search, setSearch] = useState('');
  const [schemaFilter, setSchemaFilter] = useState('');

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

  return (
    <div className="flex h-full">
      {/* List */}
      <div className="w-80 shrink-0 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">History</h2>
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

      {/* Detail view */}
      <div className="flex-1 overflow-y-auto">
        {activeProfile ? (
          <div className="max-w-3xl mx-auto p-6">
            <ProfileViewer profile={activeProfile} />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-1">No profile selected</h3>
              <p className="text-sm text-muted-foreground">
                Select a profile from the list to view its details.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
