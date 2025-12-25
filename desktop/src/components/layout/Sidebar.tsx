import { NavLink } from 'react-router-dom';

type SidebarProps = {
  onLogout?: () => void;
  isOpen?: boolean;
  isMobile?: boolean;
  onCloseMobile?: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
};

export function AppSidebar({
  onLogout,
  isOpen = true,
  isMobile = false,
  onCloseMobile,
  theme,
  onToggleTheme,
}: SidebarProps) {
  const navItems = [
    {
      label: 'Дашборд',
      hint: 'Огляд системи',
      to: '/app',
    },
    {
      label: 'Експерименти',
      hint: 'Список та створення',
      to: '/app/experiments',
    },
    {
      label: 'Файли',
      hint: 'Завантаження та список',
      to: '/app/files',
    },
  ];

  return (
    <aside className={`app-sidebar ${isOpen ? 'open' : ''} ${isMobile ? 'mobile' : ''}`}>
      <div className="sidebar-inner">
        <div className="sidebar-brand">
          <div>
            <p className="sidebar-title">Дослідницька панель</p>
          </div>
          {isMobile ? (
            <button
              className="sidebar-close"
              type="button"
              onClick={onCloseMobile}
              aria-label="Закрити меню"
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
        <button className="sidebar-theme" type="button" onClick={onToggleTheme}>
          {theme === 'dark' ? 'Світла тема' : 'Темна тема'}
        </button>
        <button className="sidebar-logout" type="button" onClick={onLogout} disabled={!onLogout}>
          Вийти
        </button>
      </div>
    </aside>
  );
}
