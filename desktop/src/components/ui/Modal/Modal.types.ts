import type { ReactNode } from 'react';

export type ModalProps = {
  open: boolean;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  onClose: () => void;
};
