import { useEffect, useMemo, useState, type FC } from 'react';
import { AppSidebar } from '../AppSidebar';
import { getIsMobile } from './utils/getIsMobile';
import type { AuthLayoutProps, ThemeMode } from './AuthLayout.types';

const AuthLayout: FC<AuthLayoutProps> = ({
  badge,
  title,
  subtitle,
  actions,
  children,
  onLogout,
}) => {
  const [theme, setTheme] = useState<ThemeMode>(() =>
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
};

export default AuthLayout;
