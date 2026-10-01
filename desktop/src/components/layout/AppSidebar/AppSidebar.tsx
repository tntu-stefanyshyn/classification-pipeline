import { NavLink } from 'react-router-dom';
import type { FC } from 'react';
import type { AppSidebarProps } from './AppSidebar.types';
import { useI18n } from '../../../i18n';

const AppSidebar: FC<AppSidebarProps> = ({
  onLogout,
  isOpen = true,
  isMobile = false,
  onCloseMobile,
  theme,
  onToggleTheme,
}) => {
  const { locale, setLocale, messages } = useI18n();
  const navItems = [
    {
      label: messages.sidebar.nav.dashboard.label,
      hint: messages.sidebar.nav.dashboard.hint,
      to: '/app',
    },
    {
      label: messages.sidebar.nav.experiments.label,
      hint: messages.sidebar.nav.experiments.hint,
      to: '/app/experiments',
    },
    {
      label: messages.sidebar.nav.files.label,
      hint: messages.sidebar.nav.files.hint,
      to: '/app/files',
    },
  ];

  return (
    <aside className={`app-sidebar ${isOpen ? 'open' : ''} ${isMobile ? 'mobile' : ''}`}>
      <div className="sidebar-inner">
        <div className="sidebar-brand">
          <div>
            <p className="sidebar-title">{messages.sidebar.title}</p>
          </div>
          {isMobile ? (
            <button
              className="sidebar-close"
              type="button"
              onClick={onCloseMobile}
              aria-label={messages.sidebar.closeMenu}
            >
              ×
            </button>
          ) : null}
        </div>

        <nav className="sidebar-nav">
          {navItems.map(({ label, hint, to }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            >
              <span className="sidebar-link-label">{label}</span>
              {hint ? <span className="sidebar-link-hint">{hint}</span> : null}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-locale">
          <span className="sidebar-locale-label">{messages.locale.label}</span>
          <div className="sidebar-locale-switch" role="group" aria-label={messages.locale.label}>
            {(['uk', 'en'] as const).map((nextLocale) => (
              <button
                key={nextLocale}
                className={`sidebar-locale-button${locale === nextLocale ? ' active' : ''}`}
                type="button"
                onClick={() => setLocale(nextLocale)}
              >
                {messages.locale[nextLocale]}
              </button>
            ))}
          </div>
        </div>
        <button className="sidebar-theme" type="button" onClick={onToggleTheme}>
          {theme === 'dark' ? messages.sidebar.themeLight : messages.sidebar.themeDark}
        </button>
        <button className="sidebar-logout" type="button" onClick={onLogout} disabled={!onLogout}>
          {messages.sidebar.logout}
        </button>
      </div>
    </aside>
  );
};

export default AppSidebar;
