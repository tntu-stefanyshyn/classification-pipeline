import type { UnauthLayoutProps } from './UnauthLayout.types';

// Reserved for potential future use; currently unused after simplifying auth pages.
export function UnauthLayout({ children }: UnauthLayoutProps) {
  return <main className="page unauth">{children}</main>;
}

export default UnauthLayout;
