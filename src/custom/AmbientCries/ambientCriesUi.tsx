import React, { useState } from 'react';
import styled from 'styled-components';
import { Input } from '@components/inputs';

/**
 * Shared presentational pieces for the Ambient Cries surfaces (the global
 * dashboard page and the per-zone block). Kept in one place so both surfaces
 * read the same way.
 */

export const Hint = styled.p`
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme }) => theme.colors.text400};
  margin: -4px 0 4px;
`;

export const NarrowInput = styled(Input)`
  width: 96px;
`;

export const PairRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;

  & span.sep {
    ${({ theme }) => theme.fonts.normalRegular};
    color: ${({ theme }) => theme.colors.text400};
  }
`;

export const AddButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 8px;
  border-radius: 8px;
  border: 1px dashed ${({ theme }) => theme.colors.dark24};
  background-color: transparent;
  color: ${({ theme }) => theme.colors.text400};
  ${({ theme }) => theme.fonts.normalMedium};
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease, background-color 120ms ease;

  & svg {
    width: 12px;
    height: 12px;
  }
  & svg path {
    fill: currentColor;
  }

  &:hover {
    border-color: ${({ theme }) => theme.colors.primaryBase};
    color: ${({ theme }) => theme.colors.primaryBase};
    background-color: ${({ theme }) => theme.colors.primarySoft}18;
  }
`;

type NumberFieldProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number | 'any';
  integer?: boolean;
  narrow?: boolean;
  placeholder?: string;
};

/**
 * A number input that keeps its own raw text while focused, so clearing it
 * mid-edit doesn't snap to a default. Only finite parses are pushed up; the value
 * is clamped to [min, max] when given. Mirrors the SOS panel's NumberField.
 */
export const NumberField = ({ value, onChange, min, max, step, integer, narrow, placeholder }: NumberFieldProps) => {
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
      placeholder={placeholder}
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
