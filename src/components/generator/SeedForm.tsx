import type { SchemaField } from '@/types';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';

interface SeedFormProps {
  fields: SchemaField[];
  seeds: Record<string, unknown>;
  onSeedsChange: (seeds: Record<string, unknown>) => void;
  prefix?: string;
}

export function SeedForm({ fields, seeds, onSeedsChange, prefix = '' }: SeedFormProps) {
  const seedableFields = fields.filter((f) => f.seedable);

  if (seedableFields.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic py-2">
        No seedable fields in this schema. All fields will be randomly generated.
      </p>
    );
  }

  const getKey = (field: SchemaField) => prefix ? `${prefix}.${field.key}` : field.key;

  const setValue = (field: SchemaField, value: unknown) => {
    const key = getKey(field);
    const updated = { ...seeds };
    if (value === '' || value === undefined || value === null) {
      delete updated[key];
    } else {
      updated[key] = value;
    }
    onSeedsChange(updated);
  };

  return (
    <div className="space-y-3">
      {seedableFields.map((field) => {
        const key = getKey(field);
        const value = seeds[key];

        return (
          <div key={key} className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {field.label}
              {field.description && (
                <span className="ml-1.5 opacity-60">- {field.description}</span>
              )}
            </label>
            {field.type === 'text' && (
              <Input
                value={(value as string) ?? ''}
                onChange={(e) => setValue(field, e.target.value)}
                placeholder={`Leave empty for random ${field.label.toLowerCase()}`}
                className="h-8 text-sm"
              />
            )}
            {field.type === 'number' && (
              <Input
                type="number"
                value={(value as number)?.toString() ?? ''}
                onChange={(e) => setValue(field, e.target.value ? Number(e.target.value) : '')}
                placeholder="Leave empty for random"
                className="h-8 text-sm"
              />
            )}
            {field.type === 'boolean' && (
              <div className="flex items-center gap-2">
                <Switch
                  checked={!!value}
                  onCheckedChange={(v) => setValue(field, v)}
                />
                <span className="text-sm">{value ? 'Yes' : 'No'}</span>
              </div>
            )}
            {field.type === 'enum' && (
              <Select
                value={(value as string) ?? ''}
                onValueChange={(v) => setValue(field, v)}
                options={[
                  { value: '', label: 'Random' },
                  ...(field.options ?? []).map((o) => ({ value: o, label: o })),
                ]}
              />
            )}
            {field.type === 'scale' && (
              <Select
                value={(value as string) ?? ''}
                onValueChange={(v) => setValue(field, v)}
                options={[
                  { value: '', label: 'Random' },
                  ...(field.levels ?? []).map((l) => ({ value: l, label: l })),
                ]}
              />
            )}
            {field.type === 'trait-list' && (
              <Input
                value={(value as string) ?? ''}
                onChange={(e) => setValue(field, e.target.value)}
                placeholder={`Leave empty for random (${field.traitCount ?? 5} traits)`}
                className="h-8 text-sm"
              />
            )}
            {field.type === 'references' && (
              <Input
                value={(value as string) ?? ''}
                onChange={(e) => setValue(field, e.target.value)}
                placeholder="Leave empty for random (e.g., Name (Source), ...)"
                className="h-8 text-sm"
              />
            )}
            {field.type === 'object' && field.fields && (
              <div className="pl-3 border-l-2 border-border">
                <SeedForm
                  fields={field.fields}
                  seeds={seeds}
                  onSeedsChange={onSeedsChange}
                  prefix={key}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
