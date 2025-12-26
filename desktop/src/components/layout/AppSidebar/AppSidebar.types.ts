export type AppSidebarProps = {
  onLogout?: () => void;
  isOpen?: boolean;
  isMobile?: boolean;
  onCloseMobile?: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
};

export type AppSidebarNavItem = {
  label: string;
  hint?: string;
  to: string;
};
