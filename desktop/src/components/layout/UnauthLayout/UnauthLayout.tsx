import type { FC } from 'react';
import type { UnauthLayoutProps } from './UnauthLayout.types';

// Reserved for potential future use; currently unused after simplifying auth pages.
const UnauthLayout: FC<UnauthLayoutProps> = ({ children }) => {
  return <main className="page unauth">{children}</main>;
};

export default UnauthLayout;
