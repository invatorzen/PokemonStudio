import React, { useState } from 'react';
import styled from 'styled-components';
import { Input } from '@components/inputs';

/**
 * Shared presentational pieces for the Crafting surfaces (Categories tab, Recipes
 * tab, and the recursive condition editor). Kept in one place so every surface
 * reads the same way.
 */

/** Muted helper/hint line. */
export const HelpText = styled.span`
  ${({ theme }) => theme.fonts.normalSmall};
  color: ${({ theme }) => theme.colors.text400};
  display: block;
  margin-top: 4px;
`;

/** Muted status line (no project / loading / empty / error). */
export const EmptyState = styled.span`
  ${({ theme }) => theme.fonts.normalMedium};
  color: ${({ theme }) => theme.colors.text400};
`;

/** A bordered card used for a category / recipe / condition node. */
export const Card = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  background-color: ${({ theme }) => theme.colors.dark14};
  border: 1px solid ${({ theme }) => theme.colors.dark20};
  border-radius: 8px;
`;

/** A labelled vertical field group. */
export const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
`;

/** A responsive row of fields. */
export const Row = styled.div`
  display: flex;
  gap: 16px;
  flex-wrap: wrap;

  & > * {
    flex: 1;
    min-width: 160px;
  }
`;

/** Narrower number input for compact numeric fields. */
export const NarrowInput = styled(Input)`
  width: 120px;
`;

/** Blue-tinted dashed add button (matches the Ambient Cries add affordance). */
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

/** A compact inline add button (auto width) for adding a leaf/group within a node. */
export const SmallAddButton = styled(AddButton)`
  width: auto;
  padding: 6px 12px;
  white-space: nowrap;
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
 * is clamped to [min, max] when given. Mirrors the Ambient Cries NumberField.
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
