import type { ReactNode } from 'react';

export type AlertVariant = 'info' | 'warning' | 'error' | 'success';

export type AlertProps = {
  variant?: AlertVariant;
  className?: string;
  children: ReactNode;
};
