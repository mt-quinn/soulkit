import type { GeneratedProfile } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { cn, formatDate } from '@/lib/utils';
import { PROVIDER_CONFIGS } from '@/services/types';
import { resolveGeneratedProfileDisplayName } from '@/lib/profileIdentity';
import { useSchemaStore } from '@/stores/schemaStore';
import { Copy, Trash2 } from 'lucide-react';

interface ProfileCardProps {
  profile: GeneratedProfile;
  active?: boolean;
  onClick?: () => void;
  compact?: boolean;
  onDuplicate?: () => void;
  onDelete?: () => void;
}

export function ProfileCard({ profile, active, onClick, compact, onDuplicate, onDelete }: ProfileCardProps) {
  const { presets } = useSchemaStore();
  const schema = presets.find((preset) => preset.id === profile.schemaId) ?? null;
  const displayName = resolveGeneratedProfileDisplayName(profile, { schema });

  const providerName = PROVIDER_CONFIGS[profile.provider]?.name ?? profile.provider;

  return (
    <Card
      onClick={onClick}
      className={cn(
        'group cursor-pointer transition-all hover:border-primary/50',
        active && 'border-primary ring-1 ring-primary/30',
        compact && 'p-0'
      )}
    >
      <CardHeader className={compact ? 'p-3 pb-1' : undefined}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className={cn('whitespace-normal break-words leading-snug', compact ? 'text-sm' : 'text-base')}>
              {displayName}
            </CardTitle>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {profile.schemaName}
            </p>
          </div>
          <div className="flex items-start gap-1.5 shrink-0">
            {(onDuplicate || onDelete) && (
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {onDuplicate && (
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onDuplicate();
                    }}
                    className="p-1 rounded hover:bg-background/50 cursor-pointer"
                    title="Duplicate profile"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete();
                    }}
                    className="p-1 rounded hover:bg-background/50 text-destructive cursor-pointer"
                    title="Delete profile"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              {providerName}
            </Badge>
          </div>
        </div>
      </CardHeader>
      {!compact && (
        <CardContent className="pt-0">
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span>{profile.model}</span>
            <span>T: {profile.temperature.toFixed(1)}</span>
            <span>{formatDate(profile.generatedAt)}</span>
          </div>
          {Object.keys(profile.seeds).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {Object.entries(profile.seeds).slice(0, 4).map(([key, val]) => (
                <Badge key={key} variant="outline" className="text-[10px]">
                  {key}: {String(val)}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
