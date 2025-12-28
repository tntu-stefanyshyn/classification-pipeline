import { DashboardPage as DashboardPageView } from '../../../components/pages/DashboardPage/DashboardPage';
import type { DashboardPageProps } from '../../../components/pages/DashboardPage/DashboardPage.types';

export function DashboardPage(props: DashboardPageProps) {
  return <DashboardPageView {...props} />;
}

export default DashboardPage;
