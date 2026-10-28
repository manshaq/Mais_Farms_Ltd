import React, { useState, useEffect } from 'react';

interface SelectWithCustomProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
  className?: string;
  selectAriaLabel?: string;
}

const CUSTOM_SENTINEL = '__CUSTOM_OTHER__';

export const SelectWithCustom: React.FC<SelectWithCustomProps> = ({
  label,
  value,
  onChange,
  options,
  placeholder = 'Type custom value...',
  required = false,
  className = '',
  selectAriaLabel,
}) => {
  const isPreset = options.includes(value);
  const [isCustomMode, setIsCustomMode] = useState<boolean>(!isPreset && value !== '');

  useEffect(() => {
    if (value && !options.includes(value)) {
      setIsCustomMode(true);
    }
  }, [value, options]);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.value;
    if (selected === CUSTOM_SENTINEL) {
      setIsCustomMode(true);
      if (options.includes(value)) {
        onChange('');
      }
    } else {
      setIsCustomMode(false);
      onChange(selected);
    }
  };

  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
          {label} {required && <span className="text-emerald-700">*</span>}
        </label>
      )}
      <div className="space-y-2">
        <select
          aria-label={selectAriaLabel || label}
          value={isCustomMode ? CUSTOM_SENTINEL : value}
          onChange={handleSelectChange}
          className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-600/25 focus:border-emerald-700"
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
          <option value={CUSTOM_SENTINEL}>Other (Type custom...)</option>
        </select>

        {isCustomMode && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              required={required}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              autoFocus
              className="w-full px-3 py-2 text-xs bg-emerald-50/40 border border-emerald-600/50 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
            />
            <button
              type="button"
              onClick={() => {
                setIsCustomMode(false);
                onChange(options[0] || '');
              }}
              className="px-2.5 py-2 text-[11px] font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg bg-white shrink-0"
            >
              Preset
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
