import { ReactNode } from 'react';

// Reserved for potential future use; currently unused after simplifying auth pages.
export function UnauthLayout({ children }: { children: ReactNode }) {
  return <main className="page unauth">{children}</main>;
}

export default UnauthLayout;
