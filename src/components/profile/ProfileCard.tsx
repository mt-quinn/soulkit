import type { GeneratedProfile } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { cn, formatDate } from '@/lib/utils';
import { PROVIDER_CONFIGS } from '@/services/types';

interface ProfileCardProps {
  profile: GeneratedProfile;
  active?: boolean;
  onClick?: () => void;
  compact?: boolean;
}

export function ProfileCard({ profile, active, onClick, compact }: ProfileCardProps) {
  const displayName =
    (profile.profile.name as string) ??
    (profile.profile.full_name as string) ??
    (profile.profile.character_name as string) ??
    'Unnamed Character';

  const providerName = PROVIDER_CONFIGS[profile.provider]?.name ?? profile.provider;

  return (
    <Card
      onClick={onClick}
      className={cn(
        'cursor-pointer transition-all hover:border-primary/50',
        active && 'border-primary ring-1 ring-primary/30',
        compact && 'p-0'
      )}
    >
      <CardHeader className={compact ? 'p-3 pb-1' : undefined}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className={cn('truncate', compact ? 'text-sm' : 'text-base')}>
              {displayName}
            </CardTitle>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {profile.schemaName}
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {providerName}
          </Badge>
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
