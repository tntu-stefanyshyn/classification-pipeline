import { FC } from 'react';
import { ButtonProps } from './Button.types';

const Button: FC<ButtonProps> = ({ children }) => {
  return <button>{children}</button>;
};

export default Button;
