import type { FC } from 'react';
import {
  ExperimentsPage as ExperimentsPageView,
  type ExperimentsPageProps,
} from '../../../components/pages/ExperimentsPage';

const ExperimentsPage: FC<ExperimentsPageProps> = (props) => {
  return <ExperimentsPageView {...props} />;
};

export default ExperimentsPage;
