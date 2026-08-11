import React, { useEffect, useRef, useState } from 'react';

import { Input } from '@components/inputs';

/**
 * A number input for an ally's `rate` (a positive integer weight). A plain
 * controlled `type=number` bound to a number rewrites the field to "1" the
 * instant it is cleared, so this keeps the raw string locally and only pushes a
 * parsed, clamped (>= 1) integer up.
 */
type Props = {
  value: number;
  onChange: (value: number) => void;
  className?: string;
};

export const SosRateInput = ({ value, onChange, className }: Props) => {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);

  // Reflect external changes unless the user is mid-edit or the current text
  // already parses to the same value.
  useEffect(() => {
    if (focused.current) return;
    if (text !== '' && parseInt(text, 10) === value) return;
    setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Input
      type="number"
      min="1"
      step="1"
      className={className}
      value={text}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        setText(String(value));
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const n = parseInt(raw, 10);
        onChange(Number.isFinite(n) && n >= 1 ? n : 1);
      }}
    />
  );
};
