import React from 'react';

export interface QuickPreset {
  label: string;
  delta?: number;
  value?: number;
}

interface TouchStepperProps {
  label: React.ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
  disabled?: boolean;
  minLabel?: string;
  maxLabel?: string;
  description?: React.ReactNode;
  quickPresets?: QuickPreset[];
  ariaLabel?: string;
  color?: 'blue' | 'purple' | 'amber';
}

export const TouchStepper: React.FC<TouchStepperProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  disabled = false,
  minLabel,
  maxLabel,
  description,
  quickPresets,
  ariaLabel,
  color = 'blue',
}) => {
  const effectiveMax = Math.max(min, max);
  const clampedValue = Math.max(min, Math.min(effectiveMax, value));

  const handleStep = (delta: number) => {
    if (disabled) return;
    const next = Math.max(min, Math.min(effectiveMax, Math.round((clampedValue + delta) / step) * step));
    onChange(next);
  };

  const handleSlider = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = Math.max(min, Math.min(effectiveMax, Number(event.target.value) || min));
    onChange(next);
  };

  const handlePreset = (preset: QuickPreset) => {
    if (disabled) return;
    if (preset.value !== undefined) {
      onChange(Math.max(min, Math.min(effectiveMax, preset.value)));
    } else if (preset.delta !== undefined) {
      handleStep(preset.delta);
    }
  };

  const labelString = typeof label === 'string' ? label : ariaLabel || '';

  return (
    <div className={`touch-stepper-box theme-${color} ${disabled ? 'is-disabled' : ''}`}>
      <div className="touch-stepper-title">{label}</div>
      <div className="touch-stepper-row">
        <button
          type="button"
          className="touch-circle-btn"
          disabled={disabled || clampedValue <= min}
          onClick={() => handleStep(-step)}
          aria-label={`${labelString} ${step} 감소`}
        >
          −
        </button>
        <input
          type="range"
          min={min}
          max={effectiveMax}
          step={step}
          value={clampedValue}
          disabled={disabled || min >= effectiveMax}
          onChange={handleSlider}
          className="touch-range-slider"
          aria-label={labelString}
        />
        <button
          type="button"
          className="touch-circle-btn"
          disabled={disabled || clampedValue >= effectiveMax}
          onClick={() => handleStep(step)}
          aria-label={`${labelString} ${step} 증가`}
        >
          ＋
        </button>
      </div>
      <div className="touch-stepper-info">
        <span className="touch-stepper-bound">{minLabel ?? `${min.toLocaleString()}${unit}`}</span>
        <strong className="touch-stepper-current">{clampedValue.toLocaleString()}{unit}</strong>
        <span className="touch-stepper-bound">{maxLabel ?? `한도 ${effectiveMax.toLocaleString()}${unit}`}</span>
      </div>
      {quickPresets && quickPresets.length > 0 && (
        <div className="touch-stepper-presets">
          {quickPresets.map((preset, index) => (
            <button
              key={index}
              type="button"
              disabled={disabled}
              className="touch-preset-chip"
              onClick={() => handlePreset(preset)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
      {description && <div className="touch-stepper-note">{description}</div>}
    </div>
  );
};
