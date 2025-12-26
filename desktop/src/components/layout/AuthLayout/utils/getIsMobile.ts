export const getIsMobile = () => (typeof window !== 'undefined' ? window.innerWidth < 960 : true);
