import type { ReactNode } from 'react';

export type FullscreenLayoutProps = {
  badge?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};
