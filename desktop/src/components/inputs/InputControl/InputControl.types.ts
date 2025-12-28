import type { ChangeEvent, FocusEvent } from 'react';

export type InputControlProps = {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  name?: string;
  id?: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
};
