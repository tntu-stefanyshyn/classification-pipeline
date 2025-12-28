import { useEffect, useState, type FC } from 'react';
import type { FullscreenLayoutProps } from './FullscreenLayout.types';

const FullscreenLayout: FC<FullscreenLayoutProps> = ({
  badge,
  title,
  subtitle,
  actions,
  children,
}) => {
  const [theme] = useState<'light' | 'dark'>(() =>
    localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'
  );

  useEffect(() => {
    document.body.classList.toggle('theme-dark', theme === 'dark');
  }, [theme]);

  return (
    <main className="page fullscreen">
      <section className="panel dashboard">
        <div className="panel-header">
          {badge && <p className="badge">{badge}</p>}
          <h1>{title}</h1>
          {subtitle && <p className="subtitle">{subtitle}</p>}
        </div>

        {actions ? <div className="actions top-actions">{actions}</div> : null}

        {children}
      </section>
    </main>
  );
};

export default FullscreenLayout;
