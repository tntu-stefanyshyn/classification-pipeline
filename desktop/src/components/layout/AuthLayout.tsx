import { ReactNode } from 'react';

type AuthLayoutProps = {
  badge?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function AuthLayout({ badge, title, subtitle, actions, children }: AuthLayoutProps) {
  return (
    <main className="page">
      <section className="panel dashboard">
        <div className="panel-header">
          {badge && <p className="badge">{badge}</p>}
          <h1>{title}</h1>
          {subtitle && <p className="subtitle">{subtitle}</p>}
        </div>

        {children}

        {actions && <div className="actions">{actions}</div>}
      </section>
    </main>
  );
}

export default AuthLayout;
