import { FC } from 'react';
import { ButtonProps } from './Button.types';

const Button: FC<ButtonProps> = ({ children, loading, disabled, ...props }) => {
  return (
    <button
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
