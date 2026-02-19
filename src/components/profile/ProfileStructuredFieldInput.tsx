import type { FieldType, SchemaField } from '@/types';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Plus, Trash2 } from 'lucide-react';

interface ProfileStructuredFieldInputProps {
  field?: SchemaField;
  value: unknown;
  disabled?: boolean;
  onChange: (value: unknown) => void;
  depth?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function keyToLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function inferArrayItemType(items: unknown[]): FieldType {
  for (const item of items) {
    if (item === null || item === undefined) continue;
    if (Array.isArray(item)) return 'array';
    if (isRecord(item)) return 'object';
    if (typeof item === 'number') return 'number';
    if (typeof item === 'boolean') return 'boolean';
    return 'text';
  }
  return 'text';
}

function inferFieldType(value: unknown): FieldType {
  if (Array.isArray(value)) return 'array';
  if (isRecord(value)) return 'object';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'text';
}

function inferFieldsFromObject(objectValue: Record<string, unknown>): SchemaField[] {
  return Object.entries(objectValue).map(([key, childValue]) => {
    const childType = inferFieldType(childValue);
    const field: SchemaField = {
      key,
      label: keyToLabel(key),
      type: childType,
      description: '',
      seedable: false,
    };

    if (childType === 'object' && isRecord(childValue)) {
      field.fields = inferFieldsFromObject(childValue);
    } else if (childType === 'array' && Array.isArray(childValue)) {
      const itemType = inferArrayItemType(childValue);
      field.arrayItemType = itemType;
      if (itemType === 'object') {
        const firstObject = childValue.find((item) => isRecord(item));
        field.fields = firstObject && isRecord(firstObject) ? inferFieldsFromObject(firstObject) : [];
      }
    }

    return field;
  });
}

function defaultValueForField(field?: SchemaField): unknown {
  if (!field) return '';

  switch (field.type) {
    case 'text':
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'enum':
      return field.options?.[0] ?? '';
    case 'scale':
      return field.levels?.[0] ?? '';
    case 'trait-list':
      return '';
    case 'references':
      return '';
    case 'ranked-likes':
    case 'ranked-dislikes':
      return [];
    case 'array':
      return [];
    case 'object': {
      const initial: Record<string, unknown> = {};
      (field.fields ?? []).forEach((child) => {
        initial[child.key] = defaultValueForField(child);
      });
      return initial;
    }
    default:
      return '';
  }
}

function toListItems(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item ?? ''));
  if (typeof value === 'string') {
    const byNewline = value
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
    if (byNewline.length > 1) return byNewline;
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function parseRankedItems(value: unknown): string[] {
  return toListItems(value)
    .map((item) => item.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean);
}

function formatRankedItems(items: string[]): string[] {
  return items.map((item, index) => `${index + 1}. ${item.trim()}`);
}

interface StringListEditorProps {
  items: string[];
  disabled: boolean;
  onChange: (items: string[]) => void;
  addLabel?: string;
  newItemValue?: string;
  multiline?: boolean;
  ranked?: boolean;
  expectedCount?: number;
  descriptor?: string;
}

function StringListEditor({
  items,
  disabled,
  onChange,
  addLabel = 'Add item',
  newItemValue = '',
  multiline = false,
  ranked = false,
  expectedCount,
  descriptor,
}: StringListEditorProps) {
  const updateItem = (index: number, nextValue: string) => {
    const next = [...items];
    next[index] = nextValue;
    onChange(next);
  };

  const removeItem = (index: number) => {
    const next = items.filter((_, itemIndex) => itemIndex !== index);
    onChange(next);
  };

  const addItem = () => onChange([...items, newItemValue]);

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/20 p-2.5">
      {(descriptor || expectedCount) && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {descriptor && <Badge variant="outline" className="text-[10px]">topic: {descriptor}</Badge>}
          {typeof expectedCount === 'number' && expectedCount > 0 && (
            <Badge variant="outline" className="text-[10px]">target: {expectedCount}</Badge>
          )}
        </div>
      )}

      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={`${index}-${item.slice(0, 12)}`} className="flex items-start gap-2">
            {ranked && (
              <Badge variant="secondary" className="mt-1 h-6 min-w-6 justify-center px-1 text-[10px]">
                {index + 1}
              </Badge>
            )}
            <div className="flex-1">
              {multiline ? (
                <Textarea
                  value={item}
                  onChange={(event) => updateItem(index, event.target.value)}
                  className="min-h-[72px] text-sm leading-relaxed"
                  disabled={disabled}
                />
              ) : (
                <Input
                  value={item}
                  onChange={(event) => updateItem(index, event.target.value)}
                  className="h-9 text-sm"
                  disabled={disabled}
                />
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeItem(index)}
              disabled={disabled}
              title="Remove item"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={addItem}
        disabled={disabled}
        className="h-7 text-[11px]"
      >
        <Plus className="h-3.5 w-3.5" />
        {addLabel}
      </Button>
    </div>
  );
}

function NumberListEditor({
  items,
  disabled,
  onChange,
}: {
  items: number[];
  disabled: boolean;
  onChange: (items: number[]) => void;
}) {
  const updateItem = (index: number, nextValue: number) => {
    const next = [...items];
    next[index] = Number.isFinite(nextValue) ? nextValue : 0;
    onChange(next);
  };
  const removeItem = (index: number) => onChange(items.filter((_, itemIndex) => itemIndex !== index));
  const addItem = () => onChange([...items, 0]);

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/20 p-2.5">
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <Badge variant="secondary" className="h-6 min-w-6 justify-center px-1 text-[10px]">
              {index + 1}
            </Badge>
            <Input
              type="number"
              value={Number.isFinite(item) ? String(item) : '0'}
              onChange={(event) => updateItem(index, Number(event.target.value))}
              className="h-9 flex-1 text-sm font-mono"
              disabled={disabled}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeItem(index)}
              disabled={disabled}
              title="Remove item"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={addItem}
        disabled={disabled}
        className="h-7 text-[11px]"
      >
        <Plus className="h-3.5 w-3.5" />
        Add number
      </Button>
    </div>
  );
}

function BooleanListEditor({
  items,
  disabled,
  onChange,
}: {
  items: boolean[];
  disabled: boolean;
  onChange: (items: boolean[]) => void;
}) {
  const updateItem = (index: number, nextValue: boolean) => {
    const next = [...items];
    next[index] = nextValue;
    onChange(next);
  };
  const removeItem = (index: number) => onChange(items.filter((_, itemIndex) => itemIndex !== index));
  const addItem = () => onChange([...items, false]);

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/20 p-2.5">
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={item}
                onChange={(event) => updateItem(index, event.target.checked)}
                className="h-4 w-4 accent-primary"
                disabled={disabled}
              />
              Item {index + 1}
            </label>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeItem(index)}
              disabled={disabled}
              title="Remove item"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={addItem}
        disabled={disabled}
        className="h-7 text-[11px]"
      >
        <Plus className="h-3.5 w-3.5" />
        Add boolean
      </Button>
    </div>
  );
}

function ObjectFieldEditor({
  field,
  value,
  disabled,
  onChange,
  depth,
}: {
  field?: SchemaField;
  value: unknown;
  disabled: boolean;
  onChange: (value: unknown) => void;
  depth: number;
}) {
  const objectValue = isRecord(value) ? value : {};
  const childFields = field?.fields && field.fields.length > 0
    ? field.fields
    : inferFieldsFromObject(objectValue);

  const updateChild = (childKey: string, childValue: unknown) => {
    onChange({ ...objectValue, [childKey]: childValue });
  };

  if (childFields.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
        No nested fields to edit yet.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/20 p-2.5">
      {childFields.map((childField) => (
        <div key={childField.key} className="space-y-1.5 rounded-md border border-border/70 bg-background/40 p-2.5">
          <div className="text-xs text-muted-foreground">{childField.label}</div>
          <ProfileStructuredFieldInput
            field={childField}
            value={objectValue[childField.key]}
            disabled={disabled}
            onChange={(childValue) => updateChild(childField.key, childValue)}
            depth={depth + 1}
          />
        </div>
      ))}
    </div>
  );
}

function ObjectArrayEditor({
  field,
  value,
  disabled,
  onChange,
  depth,
}: {
  field?: SchemaField;
  value: unknown;
  disabled: boolean;
  onChange: (value: unknown) => void;
  depth: number;
}) {
  const arrayValue = Array.isArray(value) ? value : [];
  const firstObject = arrayValue.find((item) => isRecord(item));
  const itemFields = field?.fields && field.fields.length > 0
    ? field.fields
    : firstObject && isRecord(firstObject)
      ? inferFieldsFromObject(firstObject)
      : [];

  const updateItem = (index: number, nextObject: Record<string, unknown>) => {
    const next = [...arrayValue];
    next[index] = nextObject;
    onChange(next);
  };

  const removeItem = (index: number) => {
    onChange(arrayValue.filter((_, itemIndex) => itemIndex !== index));
  };

  const addItem = () => {
    const nextObject: Record<string, unknown> = {};
    itemFields.forEach((itemField) => {
      nextObject[itemField.key] = defaultValueForField(itemField);
    });
    onChange([...arrayValue, nextObject]);
  };

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/20 p-2.5">
      {arrayValue.map((item, index) => {
        const objectItem = isRecord(item) ? item : {};
        return (
          <div key={index} className="space-y-2 rounded-md border border-border/70 bg-background/40 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <Badge variant="secondary" className="text-[10px]">Item {index + 1}</Badge>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeItem(index)}
                disabled={disabled}
                title="Remove item"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <ObjectFieldEditor
              field={field ? { ...field, type: 'object', fields: itemFields } : undefined}
              value={objectItem}
              disabled={disabled}
              onChange={(nextValue) => updateItem(index, isRecord(nextValue) ? nextValue : {})}
              depth={depth + 1}
            />
          </div>
        );
      })}
      <Button
        variant="outline"
        size="sm"
        onClick={addItem}
        disabled={disabled}
        className="h-7 text-[11px]"
      >
        <Plus className="h-3.5 w-3.5" />
        Add item
      </Button>
    </div>
  );
}

function ArrayFieldEditor({
  field,
  value,
  disabled,
  onChange,
  depth,
}: {
  field?: SchemaField;
  value: unknown;
  disabled: boolean;
  onChange: (value: unknown) => void;
  depth: number;
}) {
  const arrayValue = Array.isArray(value) ? value : [];
  const itemType = field?.arrayItemType ?? inferArrayItemType(arrayValue);

  if (itemType === 'object') {
    return (
      <ObjectArrayEditor
        field={field}
        value={arrayValue}
        disabled={disabled}
        onChange={onChange}
        depth={depth}
      />
    );
  }

  if (itemType === 'number') {
    const items = arrayValue.map((item) => (typeof item === 'number' && Number.isFinite(item) ? item : Number(item) || 0));
    return <NumberListEditor items={items} disabled={disabled} onChange={onChange} />;
  }

  if (itemType === 'boolean') {
    const items = arrayValue.map((item) => Boolean(item));
    return <BooleanListEditor items={items} disabled={disabled} onChange={onChange} />;
  }

  const items = arrayValue.map((item) => String(item ?? ''));
  const multiline = items.some((item) => item.length > 90);
  return (
    <StringListEditor
      items={items}
      disabled={disabled}
      onChange={onChange}
      addLabel="Add list item"
      newItemValue="New item"
      multiline={multiline}
    />
  );
}

export function ProfileStructuredFieldInput({
  field,
  value,
  disabled = false,
  onChange,
  depth = 0,
}: ProfileStructuredFieldInputProps) {
  const resolvedType = field?.type ?? inferFieldType(value);

  if (resolvedType === 'number') {
    const displayValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
    return (
      <Input
        type="number"
        value={String(displayValue)}
        onChange={(event) => {
          const next = Number(event.target.value);
          onChange(Number.isFinite(next) ? next : 0);
        }}
        className="h-9 text-sm font-mono"
        disabled={disabled}
      />
    );
  }

  if (resolvedType === 'boolean') {
    const checked = value === true;
    return (
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 accent-primary"
          disabled={disabled}
        />
        {checked ? 'True' : 'False'}
      </label>
    );
  }

  if (resolvedType === 'enum' || resolvedType === 'scale') {
    const options = (resolvedType === 'enum' ? field?.options : field?.levels) ?? [];
    if (options.length === 0) {
      const textValue = typeof value === 'string' ? value : value == null ? '' : String(value);
      return (
        <Input
          value={textValue}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 text-sm"
          disabled={disabled}
        />
      );
    }
    const stringValue = typeof value === 'string' ? value : '';
    const mergedOptions = [...options];
    if (stringValue && !mergedOptions.includes(stringValue)) {
      mergedOptions.unshift(stringValue);
    }
    return (
      <Select
        value={stringValue}
        onValueChange={(nextValue) => onChange(nextValue)}
        options={mergedOptions.map((option) => ({ value: option, label: option }))}
        placeholder="Select value"
        disabled={disabled}
      />
    );
  }

  if (resolvedType === 'trait-list' || resolvedType === 'references') {
    const items = toListItems(value);
    return (
      <StringListEditor
        items={items}
        disabled={disabled}
        onChange={(nextItems) => onChange(nextItems.map((item) => item.trim()).filter(Boolean).join(', '))}
        addLabel={resolvedType === 'trait-list' ? 'Add trait' : 'Add reference'}
        newItemValue={resolvedType === 'trait-list' ? 'New trait' : 'New reference'}
      />
    );
  }

  if (resolvedType === 'ranked-likes' || resolvedType === 'ranked-dislikes') {
    const items = parseRankedItems(value);
    return (
      <StringListEditor
        items={items}
        disabled={disabled}
        onChange={(nextItems) => onChange(formatRankedItems(nextItems.map((item) => item.trim()).filter(Boolean)))}
        addLabel="Add ranked item"
        newItemValue="New ranked item"
        multiline
        ranked
        expectedCount={field?.rankedItemCount}
        descriptor={field?.rankedDescriptor}
      />
    );
  }

  if (resolvedType === 'array') {
    return (
      <ArrayFieldEditor
        field={field}
        value={value}
        disabled={disabled}
        onChange={onChange}
        depth={depth + 1}
      />
    );
  }

  if (resolvedType === 'object') {
    return (
      <ObjectFieldEditor
        field={field}
        value={value}
        disabled={disabled}
        onChange={onChange}
        depth={depth + 1}
      />
    );
  }

  const textValue = typeof value === 'string' ? value : value == null ? '' : String(value);
  const useTextarea = textValue.length > 140 || textValue.includes('\n');
  if (useTextarea) {
    return (
      <Textarea
        value={textValue}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[92px] text-sm leading-relaxed"
        disabled={disabled}
      />
    );
  }

  return (
    <Input
      value={textValue}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 text-sm"
      disabled={disabled}
    />
  );
}
