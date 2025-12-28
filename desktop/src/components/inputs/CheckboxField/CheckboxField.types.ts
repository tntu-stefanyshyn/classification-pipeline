import type { ChangeEvent } from 'react';

export type CheckboxFieldProps = {
  label: string;
  checked: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  id?: string;
  name?: string;
  disabled?: boolean;
};
