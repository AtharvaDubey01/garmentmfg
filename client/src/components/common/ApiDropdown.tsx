import React, { useEffect, useState } from 'react';

export interface DropdownOption {
  value: string | number;
  label: string;
}

export interface ApiDropdownProps {
  id?: string;
  name?: string;
  value: string | number;
  onChange: (val: string) => void;
  apiEndpoint?: string;
  staticOptions?: DropdownOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  valueKey?: string;
  labelKey?: string;
}

export const ApiDropdown: React.FC<ApiDropdownProps> = ({
  id,
  name,
  value,
  onChange,
  apiEndpoint,
  staticOptions = [],
  placeholder = '-- Select --',
  required = false,
  disabled = false,
  valueKey = 'id',
  labelKey = 'name',
}) => {
  const [options, setOptions] = useState<DropdownOption[]>(staticOptions);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (staticOptions.length > 0) {
      setOptions(staticOptions);
      return;
    }

    if (apiEndpoint) {
      setLoading(true);
      fetch(apiEndpoint, { credentials: 'include' })
        .then((res) => res.json())
        .then((data) => {
          const list = Array.isArray(data) ? data : data.data || [];
          const formatted = list.map((item: any) => ({
            value: item[valueKey] !== undefined ? item[valueKey] : item.id,
            label: item[labelKey] !== undefined ? item[labelKey] : item.name,
          }));
          setOptions(formatted);
        })
        .catch((err) => {
          console.error(`Error loading dropdown from ${apiEndpoint}:`, err);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [apiEndpoint, staticOptions.length]);

  return (
    <select
      id={id}
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      disabled={disabled || loading}
      style={{
        width: '100%',
        padding: '9px 12px',
        borderRadius: '8px',
        border: '1px solid var(--border-color)',
        backgroundColor: disabled ? '#e9ecef' : '#ffffff',
        color: 'var(--text-main)',
        fontSize: '0.9rem',
        fontFamily: 'inherit',
        outline: 'none',
      }}
    >
      <option value="">{loading ? 'Loading options...' : placeholder}</option>
      {options.map((opt) => (
        <option key={String(opt.value)} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
};
