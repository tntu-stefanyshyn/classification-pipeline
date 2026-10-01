import { FC } from 'react';
import { ButtonProps } from './Button.types';

const Button: FC<ButtonProps> = ({ children, loading, disabled, className = '', ...props }) => {
  return (
    <button
      className={['btn ghost', className].filter(Boolean).join(' ')}
      style={{
        opacity: disabled ? 0.7 : 1,
      }}
      {...props}
    >
      {children}
      {loading ? '...' : null}
    </button>
  );
};

export default Button;
