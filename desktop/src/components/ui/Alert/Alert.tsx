import type { FC, ReactNode } from 'react';
import type { AlertProps, AlertVariant } from './Alert.types';

const iconByVariant: Record<AlertVariant, ReactNode> = {
  info: (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 11v5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="8" r="1.1" fill="currentColor" />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 3.5l9 16H3l9-16z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path d="M12 9v5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
      <circle cx="12" cy="17" r="1.1" fill="currentColor" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M9 9l6 6M15 9l-6 6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  ),
  success: (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M8 12.5l3 3 5-6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  ),
};

const Alert: FC<AlertProps> = ({ variant = 'info', className, children }) => {
  const classes = ['alert', `alert-${variant}`, className].filter(Boolean).join(' ');
  const role = variant === 'error' ? 'alert' : 'status';

  return (
    <div className={classes} role={role}>
      <span className="alert-icon">{iconByVariant[variant]}</span>
      <span className="alert-text">{children}</span>
    </div>
  );
};

export default Alert;
