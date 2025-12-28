import type { FC } from 'react';
import {
  DashboardPage as DashboardPageView,
  type DashboardPageProps,
} from '../../../components/pages/DashboardPage';

const DashboardPage: FC<DashboardPageProps> = (props) => {
  return <DashboardPageView {...props} />;
};

export default DashboardPage;
