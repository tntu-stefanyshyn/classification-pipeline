import type { ReactNode } from 'react';

export type AuthLayoutProps = {
  badge?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  onLogout?: () => void;
};

export type ThemeMode = 'light' | 'dark';
