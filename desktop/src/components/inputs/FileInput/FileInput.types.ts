import type { ChangeEvent } from 'react';

export type FileInputProps = {
  accept?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  multiple?: boolean;
  id?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
  hidden?: boolean;
};
