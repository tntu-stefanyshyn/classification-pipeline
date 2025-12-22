import { ReactNode, useEffect, useMemo, useState } from 'react';
import { AppSidebar } from './Sidebar';

type AuthLayoutProps = {
  badge?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  onLogout?: () => void;
};

export function AuthLayout({
  badge,
  title,
  subtitle,
  actions,
  children,
  onLogout,
}: AuthLayoutProps) {
  const getIsMobile = () => (typeof window !== 'undefined' ? window.innerWidth < 960 : true);
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'
  );
  const [isMobile, setIsMobile] = useState(getIsMobile);
  const [sidebarOpen, setSidebarOpen] = useState(() => !getIsMobile());

  useEffect(() => {
    const handleResize = () => {
      const mobile = getIsMobile();
      setIsMobile(mobile);
      setSidebarOpen(!mobile);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('theme-dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const combinedActions = useMemo(
    () =>
      actions || isMobile ? (
        <div className="actions top-actions">
          {isMobile ? (
            <button
              className="btn ghost sidebar-toggle-mobile"
              type="button"
              onClick={() => setSidebarOpen((open) => !open)}
            >
              {sidebarOpen ? 'Закрити меню' : 'Меню'}
            </button>
          ) : null}
          {actions}
        </div>
      ) : null,
    [actions, isMobile, sidebarOpen]
  );

  return (
    <div className="app-shell">
      <AppSidebar
        onLogout={onLogout}
        isOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
        isMobile={isMobile}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
      />
      {sidebarOpen && isMobile ? (
        <button
          className="sidebar-scrim"
          type="button"
          onClick={() => setSidebarOpen(false)}
          aria-label="Закрити меню"
        />
      ) : null}
      <main className="page authed">
        <section className="panel dashboard">
          <div className="panel-header">
            {badge && <p className="badge">{badge}</p>}
            <h1>{title}</h1>
            {subtitle && <p className="subtitle">{subtitle}</p>}
          </div>

          {combinedActions}

          {children}
        </section>
      </main>
    </div>
  );
}

export default AuthLayout;
