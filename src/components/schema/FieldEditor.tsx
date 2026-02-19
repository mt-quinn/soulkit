import { useState } from 'react';
import type { SchemaField, FieldType, GenerationHint } from '@/types';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

const fieldTypeOptions: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'enum', label: 'Enum (choices)' },
  { value: 'scale', label: 'Scale (ordered)' },
  { value: 'trait-list', label: 'Trait List' },
  { value: 'references', label: 'References' },
  { value: 'ranked-likes', label: 'Ranked Likes' },
  { value: 'ranked-dislikes', label: 'Ranked Dislikes' },
  { value: 'array', label: 'Array (list)' },
  { value: 'object', label: 'Object (section)' },
];

const hintOptions: { value: string; label: string }[] = [
  { value: '', label: 'None' },
  { value: 'identity', label: 'Identity' },
  { value: 'narrative', label: 'Narrative' },
  { value: 'behavioral', label: 'Behavioral' },
  { value: 'calibration', label: 'Calibration' },
];

const hintDescriptions: Record<string, string> = {
  identity: 'Core identity — distinctive names, archetypes',
  narrative: 'Prose with causal depth — backstory, description',
  behavioral: 'Actionable LLM directives — quirks, instructions',
  calibration: 'Reference points — known characters, anchors',
};

interface FieldEditorProps {
  field: SchemaField;
  onChange: (field: SchemaField) => void;
  onDelete: () => void;
  depth?: number;
  allFieldKeys?: string[];
}

export function FieldEditor({ field, onChange, onDelete, depth = 0, allFieldKeys = [] }: FieldEditorProps) {
  const [expanded, setExpanded] = useState(depth === 0);
  const hasChildren = field.type === 'object' || (field.type === 'array' && field.arrayItemType === 'object');

  const update = (partial: Partial<SchemaField>) => {
    onChange({ ...field, ...partial });
  };

  const handleTypeChange = (type: FieldType) => {
    const updated: Partial<SchemaField> = { type };
    if (type === 'enum') updated.options = field.options?.length ? field.options : ['Option 1'];
    if (type === 'scale') updated.levels = field.levels?.length ? field.levels : ['Low', 'Medium', 'High'];
    if (type === 'trait-list') { updated.traitCount = field.traitCount ?? 5; updated.traitConstraint = field.traitConstraint ?? ''; }
    if (type === 'references') updated.referenceCount = field.referenceCount ?? 3;
    if (type === 'ranked-likes' || type === 'ranked-dislikes') {
      updated.rankedItemCount = field.rankedItemCount ?? 5;
      updated.rankedDescriptor = field.rankedDescriptor ?? '';
    }
    if (type === 'object') updated.fields = field.fields?.length ? field.fields : [];
    if (type === 'array') updated.arrayItemType = field.arrayItemType ?? 'text';
    // Clear irrelevant props
    if (type !== 'enum') updated.options = undefined;
    if (type !== 'scale') updated.levels = undefined;
    if (type !== 'trait-list') { updated.traitCount = undefined; updated.traitConstraint = undefined; }
    if (type !== 'references') updated.referenceCount = undefined;
    if (type !== 'ranked-likes' && type !== 'ranked-dislikes') {
      updated.rankedItemCount = undefined;
      updated.rankedDescriptor = undefined;
    }
    if (type !== 'object') updated.fields = type === 'array' && field.arrayItemType === 'object' ? field.fields : undefined;
    if (type !== 'array') updated.arrayItemType = undefined;
    onChange({ ...field, ...updated });
  };

  const addChildField = () => {
    const newField: SchemaField = {
      key: `field_${Date.now()}`,
      label: 'New Field',
      type: 'text',
      description: '',
      seedable: false,
    };
    update({ fields: [...(field.fields ?? []), newField] });
  };

  const updateChild = (index: number, child: SchemaField) => {
    const children = [...(field.fields ?? [])];
    children[index] = child;
    update({ fields: children });
  };

  const deleteChild = (index: number) => {
    const children = [...(field.fields ?? [])];
    children.splice(index, 1);
    update({ fields: children });
  };

  // Scale level helpers
  const addLevel = () => update({ levels: [...(field.levels ?? []), ''] });
  const updateLevel = (i: number, v: string) => { const l = [...(field.levels ?? [])]; l[i] = v; update({ levels: l }); };
  const deleteLevel = (i: number) => { const l = [...(field.levels ?? [])]; l.splice(i, 1); update({ levels: l }); };

  // Enum option helpers
  const addEnumOption = () => update({ options: [...(field.options ?? []), ''] });
  const updateEnumOption = (i: number, v: string) => { const o = [...(field.options ?? [])]; o[i] = v; update({ options: o }); };
  const deleteEnumOption = (i: number) => { const o = [...(field.options ?? [])]; o.splice(i, 1); update({ options: o }); };

  return (
    <div className={cn('rounded-md border border-border bg-card/50', depth > 0 && 'ml-4')}>
      {/* Header row */}
      <div className="flex items-center gap-2 p-3">
        <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 cursor-grab" />

        <button onClick={() => setExpanded(!expanded)} className="shrink-0 cursor-pointer">
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </button>

        <Input
          value={field.label}
          onChange={(e) => update({ label: e.target.value, key: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') })}
          className="h-7 text-sm font-medium flex-1 min-w-0"
          placeholder="Field label"
        />

        <Select
          value={field.type}
          onValueChange={(v) => handleTypeChange(v as FieldType)}
          options={fieldTypeOptions}
          className="w-36 shrink-0"
        />

        {field.generationHint && (
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {field.generationHint}
          </Badge>
        )}

        <Badge variant="outline" className="shrink-0 text-[10px]">
          {field.seedable ? 'seedable' : 'auto'}
        </Badge>

        <Button variant="ghost" size="icon" onClick={onDelete} className="shrink-0 h-7 w-7 text-muted-foreground hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border px-3 py-3 space-y-3">
          {/* Key + Seedable */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Key</label>
              <Input
                value={field.key}
                onChange={(e) => update({ key: e.target.value })}
                className="h-7 text-xs font-mono"
                placeholder="field_key"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Generation Hint</label>
              <Select
                value={field.generationHint ?? ''}
                onValueChange={(v) => update({ generationHint: (v || undefined) as GenerationHint | undefined })}
                options={hintOptions}
              />
            </div>
            <div className="space-y-1 flex items-end gap-3">
              <div className="flex items-center gap-2">
                <Switch checked={field.seedable} onCheckedChange={(seedable) => update({ seedable })} />
                <label className="text-xs text-muted-foreground">Seedable</label>
              </div>
            </div>
          </div>

          {field.generationHint && (
            <p className="text-[10px] text-muted-foreground italic">
              {hintDescriptions[field.generationHint]}
            </p>
          )}

          {/* Description */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Description (LLM hint)</label>
            <Input
              value={field.description}
              onChange={(e) => update({ description: e.target.value })}
              className="h-7 text-xs"
              placeholder="Describe what this field should contain..."
            />
          </div>

          {/* Dependencies */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Depends On (comma-separated field keys)</label>
            <Input
              value={(field.dependsOn ?? []).join(', ')}
              onChange={(e) => {
                const deps = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                update({ dependsOn: deps.length > 0 ? deps : undefined });
              }}
              className="h-7 text-xs font-mono"
              placeholder="e.g., archetype, chattiness, steering"
            />
          </div>

          {/* Scale levels */}
          {field.type === 'scale' && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Scale Levels (ordered low → high)</label>
              <div className="flex flex-wrap gap-2 items-center">
                {(field.levels ?? []).map((lvl, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <Input value={lvl} onChange={(e) => updateLevel(i, e.target.value)} className="h-7 text-xs w-28" />
                    {i < (field.levels?.length ?? 0) - 1 && <span className="text-muted-foreground text-xs">→</span>}
                    <button onClick={() => deleteLevel(i)} className="text-muted-foreground hover:text-destructive cursor-pointer">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addLevel} className="h-7 text-xs">
                  <Plus className="h-3 w-3 mr-1" /> Add Level
                </Button>
              </div>
            </div>
          )}

          {/* Enum options */}
          {field.type === 'enum' && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Enum Options</label>
              <div className="flex flex-wrap gap-2">
                {(field.options ?? []).map((opt, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <Input value={opt} onChange={(e) => updateEnumOption(i, e.target.value)} className="h-7 text-xs w-28" />
                    <button onClick={() => deleteEnumOption(i)} className="text-muted-foreground hover:text-destructive cursor-pointer">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addEnumOption} className="h-7 text-xs">
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
            </div>
          )}

          {/* Trait-list config */}
          {field.type === 'trait-list' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Number of traits</label>
                <Input
                  type="number"
                  value={field.traitCount ?? 5}
                  onChange={(e) => update({ traitCount: parseInt(e.target.value) || 5 })}
                  className="h-7 text-xs w-20"
                  min={1}
                  max={20}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Constraint (optional)</label>
                <Input
                  value={field.traitConstraint ?? ''}
                  onChange={(e) => update({ traitConstraint: e.target.value || undefined })}
                  className="h-7 text-xs"
                  placeholder="e.g., communication style adjectives"
                />
              </div>
            </div>
          )}

          {/* References config */}
          {field.type === 'references' && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Number of references</label>
              <Input
                type="number"
                value={field.referenceCount ?? 3}
                onChange={(e) => update({ referenceCount: parseInt(e.target.value) || 3 })}
                className="h-7 text-xs w-20"
                min={1}
                max={10}
              />
            </div>
          )}

          {/* Ranked list config */}
          {(field.type === 'ranked-likes' || field.type === 'ranked-dislikes') && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Number of ranked items</label>
                <Input
                  type="number"
                  value={field.rankedItemCount ?? 5}
                  onChange={(e) => update({ rankedItemCount: parseInt(e.target.value) || 5 })}
                  className="h-7 text-xs w-24"
                  min={1}
                  max={20}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Descriptor</label>
                <Input
                  value={field.rankedDescriptor ?? ''}
                  onChange={(e) => update({ rankedDescriptor: e.target.value || undefined })}
                  className="h-7 text-xs"
                  placeholder="e.g., foods, people, date behaviors"
                />
              </div>
            </div>
          )}

          {/* Array item type */}
          {field.type === 'array' && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Array Item Type</label>
              <Select
                value={field.arrayItemType ?? 'text'}
                onValueChange={(v) => {
                  const itemType = v as FieldType;
                  const updated: Partial<SchemaField> = { arrayItemType: itemType };
                  if (itemType === 'object') updated.fields = field.fields?.length ? field.fields : [];
                  update(updated);
                }}
                options={fieldTypeOptions.filter(
                  (t) =>
                    t.value !== 'array' &&
                    t.value !== 'scale' &&
                    t.value !== 'trait-list' &&
                    t.value !== 'references' &&
                    t.value !== 'ranked-likes' &&
                    t.value !== 'ranked-dislikes'
                )}
                className="w-48"
              />
            </div>
          )}

          {/* Nested fields */}
          {hasChildren && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">
                  {field.type === 'object' ? 'Section Fields' : 'Object Fields'}
                </label>
                <Button variant="outline" size="sm" onClick={addChildField} className="h-6 text-[10px]">
                  <Plus className="h-3 w-3 mr-1" /> Add Field
                </Button>
              </div>
              {(field.fields ?? []).map((child, i) => (
                <FieldEditor
                  key={`${child.key}-${i}`}
                  field={child}
                  onChange={(updated) => updateChild(i, updated)}
                  onDelete={() => deleteChild(i)}
                  depth={depth + 1}
                  allFieldKeys={allFieldKeys}
                />
              ))}
              {(!field.fields || field.fields.length === 0) && (
                <p className="text-xs text-muted-foreground py-2 text-center">No fields yet. Click "Add Field" to start.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
