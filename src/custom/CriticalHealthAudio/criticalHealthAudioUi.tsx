import React, { useState } from 'react';
import styled from 'styled-components';
import { Input } from '@components/inputs';

/**
 * Shared presentational pieces for the Critical Health Audio dashboard page.
 * Kept fork-local so the feature stays self-contained.
 */

export const Hint = styled.p`
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme }) => theme.colors.text400};
  margin: -4px 0 4px;
`;

/** A small pill shown on the section that the `mode` selector currently uses. */
export const ActiveBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 16px;
  background-color: ${({ theme }) => theme.colors.primarySoft};
  color: ${({ theme }) => theme.colors.primaryBase};
  ${({ theme }) => theme.fonts.normalSmall};
`;

const NarrowInput = styled(Input)`
  width: 96px;
`;

type NumberFieldProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number | 'any';
  integer?: boolean;
  narrow?: boolean;
};

/**
 * A number input that keeps its own raw text while focused, so clearing it
 * mid-edit doesn't snap to a default. Only finite parses are pushed up; the value
 * is clamped to [min, max] when given. Mirrors the Ambient Cries NumberField.
 */
export const NumberField = ({ value, onChange, min, max, step, integer, narrow }: NumberFieldProps) => {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const display = focused ? text : String(value);

  const commit = (raw: string) => {
    const n = integer ? parseInt(raw, 10) : parseFloat(raw);
    if (!Number.isFinite(n)) return;
    let v = n;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    onChange(v);
  };

  const Component = narrow ? NarrowInput : Input;
  return (
    <Component
      type="number"
      min={min}
      max={max}
      step={step ?? (integer ? 1 : 'any')}
      value={display}
      onFocus={() => {
        setText(String(value));
        setFocused(true);
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setText(e.target.value);
        commit(e.target.value);
      }}
    />
  );
};

type PathFieldProps = {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
};

/**
 * Free-text field for a project-relative audio path without extension
 * (e.g. `audio/se/low_health`). The plugin resolves the extension at runtime, so
 * a Studio file picker — which returns absolute, extension-bearing paths and
 * copies into the project — is the wrong shape here; a plain path field matches
 * the contract exactly. Trims on the way out so stray whitespace never lands on
 * disk.
 */
export const PathField = ({ value, placeholder, onChange }: PathFieldProps) => (
  <Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value.trim())} />
);
