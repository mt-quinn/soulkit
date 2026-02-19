import { cn } from '@/lib/utils';

interface SliderProps {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
}

export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 1,
  step = 0.1,
  disabled,
  className,
}: SliderProps) {
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className={cn('relative flex w-full items-center', className)}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onValueChange(parseFloat(e.target.value))}
        className="w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${percentage}%, var(--input) ${percentage}%, var(--input) 100%)`,
          height: '4px',
          borderRadius: '2px',
          WebkitAppearance: 'none',
        }}
      />
    </div>
  );
}
