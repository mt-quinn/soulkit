import { useState } from 'react';
import type { GeneratedProfile } from '@/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { toast } from '@/stores/toastStore';
import { useProfileStore } from '@/stores/profileStore';
import { useSchemaStore } from '@/stores/schemaStore';
import { formatDate, cn } from '@/lib/utils';
import { PROVIDER_CONFIGS } from '@/services/types';
import { resolveGeneratedProfileDisplayName } from '@/lib/profileIdentity';
import {
  Copy,
  Download,
  Trash2,
  Code,
  FileText,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

interface ProfileViewerProps {
  profile: GeneratedProfile;
}

export function ProfileViewer({ profile }: ProfileViewerProps) {
  const [showJson, setShowJson] = useState(false);
  const { deleteProfile } = useProfileStore();
  const { presets } = useSchemaStore();
  const schema = presets.find((preset) => preset.id === profile.schemaId) ?? null;
  const displayName = resolveGeneratedProfileDisplayName(profile, { schema });

  const handleCopy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(profile.profile, null, 2));
    toast('Copied', 'Profile JSON copied to clipboard.', 'success');
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const name = displayName || 'character';
    a.download = `${name.toLowerCase().replace(/\s+/g, '-')}-${profile.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Exported', 'Profile saved as JSON file.', 'success');
  };

  const handleDelete = async () => {
    await deleteProfile(profile.id);
    toast('Deleted', 'Profile has been removed.', 'default');
  };

  const providerName = PROVIDER_CONFIGS[profile.provider]?.name ?? profile.provider;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold">
            {displayName}
          </h3>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <Badge variant="secondary" className="text-[10px]">{providerName}</Badge>
            <span>{profile.model}</span>
            <span>T: {profile.temperature.toFixed(1)}</span>
            <span>{formatDate(profile.generatedAt)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={handleCopy} title="Copy JSON">
            <Copy className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleExport} title="Export JSON">
            <Download className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setShowJson(!showJson)} title="Toggle JSON view">
            {showJson ? <FileText className="h-4 w-4" /> : <Code className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={handleDelete} title="Delete" className="text-muted-foreground hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {showJson ? (
        <Card>
          <CardContent className="p-4">
            <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto text-foreground/80">
              {JSON.stringify(profile.profile, null, 2)}
            </pre>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <RenderObject data={profile.profile} />
        </div>
      )}
    </div>
  );
}

function RenderObject({ data, depth = 0 }: { data: Record<string, unknown>; depth?: number }) {
  return (
    <>
      {Object.entries(data).map(([key, value]) => (
        <RenderField key={key} fieldKey={key} value={value} depth={depth} />
      ))}
    </>
  );
}

function RenderField({ fieldKey, value, depth }: { fieldKey: string; value: unknown; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const label = fieldKey.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

  if (value === null || value === undefined) return null;

  // Object
  if (typeof value === 'object' && !Array.isArray(value)) {
    return (
      <Card className={cn(depth > 0 && 'shadow-none')}>
        <CardHeader
          className="cursor-pointer py-3"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2">
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <CardTitle className="text-sm">{label}</CardTitle>
          </div>
        </CardHeader>
        {expanded && (
          <CardContent className="pt-0 space-y-2">
            <RenderObject data={value as Record<string, unknown>} depth={depth + 1} />
          </CardContent>
        )}
      </Card>
    );
  }

  // Array
  if (Array.isArray(value)) {
    if (value.length === 0) return null;

    // Array of primitives
    if (typeof value[0] !== 'object') {
      const items = value.map((item) => String(item));
      const looksNumbered = items.every((item) => /^\d+\.\s+/.test(item));

      if (looksNumbered) {
        return (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{label}</label>
            <ol className="list-decimal list-inside space-y-0.5 text-sm">
              {items.map((item, i) => (
                <li key={i}>{item.replace(/^\d+\.\s+/, '')}</li>
              ))}
            </ol>
          </div>
        );
      }

      return (
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{label}</label>
          <div className="flex flex-wrap gap-1.5">
            {items.map((item, i) => (
              <Badge key={i} variant="outline" className="text-xs font-normal">
                {item}
              </Badge>
            ))}
          </div>
        </div>
      );
    }

    // Array of objects
    return (
      <Card className={cn(depth > 0 && 'shadow-none')}>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">{label}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {value.map((item, i) => (
            <Card key={i} className="shadow-none">
              <CardContent className="p-3 space-y-1">
                <RenderObject data={item as Record<string, unknown>} depth={depth + 1} />
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>
    );
  }

  // Boolean
  if (typeof value === 'boolean') {
    return (
      <div className="flex items-center justify-between py-1">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <Badge variant={value ? 'default' : 'secondary'} className="text-[10px]">
          {value ? 'Yes' : 'No'}
        </Badge>
      </div>
    );
  }

  // Number
  if (typeof value === 'number') {
    return (
      <div className="flex items-center justify-between py-1">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <span className="text-sm font-mono">{value}</span>
      </div>
    );
  }

  // String (long text vs short text)
  const text = String(value);
  if (text.length > 100) {
    return (
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <label className="text-xs font-medium text-muted-foreground shrink-0">{label}</label>
      <span className="text-sm text-right">{text}</span>
    </div>
  );
}
