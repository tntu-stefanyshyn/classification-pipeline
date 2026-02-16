import type { AppSidebarNavItem } from '../AppSidebar.types';

export const navItems: AppSidebarNavItem[] = [
  {
    label: 'Огляд',
    hint: 'Огляд системи',
    to: '/app',
  },
  {
    label: 'Експерименти',
    hint: 'Список та створення',
    to: '/app/experiments',
  },
  {
    label: 'Файли',
    hint: 'Завантаження та список',
    to: '/app/files',
  },
];
