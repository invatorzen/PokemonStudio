import React, { useEffect, useRef, useState } from 'react';

import { Input } from '@components/inputs';

/**
 * A number input that accepts decimals for grotto odds/weights. A plain
 * controlled `type=number` bound to a number drops a trailing "." or "0"
 * mid-typing (parseFloat("0.") === 0 rewrites the field to "0"), so this keeps
 * the raw string locally and only pushes a parsed, non-negative number up.
 */
type Props = {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
};

export const GrottoWeightInput = ({ value, onChange, className, onClick }: Props) => {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);

  // Reflect external changes (e.g. a different creature loaded) unless the user
  // is mid-edit or the current text already parses to the same value.
  useEffect(() => {
    if (focused.current) return;
    if (text !== '' && parseFloat(text) === value) return;
    setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Input
      type="number"
      min="0"
      step="any"
      className={className}
      value={text}
      onClick={onClick}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        setText(String(value));
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const n = parseFloat(raw);
        onChange(Number.isFinite(n) && n >= 0 ? n : 0);
      }}
    />
  );
};
