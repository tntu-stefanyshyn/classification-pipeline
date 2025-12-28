import type { FC } from 'react';
import {
  ExperimentDetailsPage as ExperimentDetailsPageView,
  type ExperimentDetailsPageProps,
} from '../../../components/pages/ExperimentDetailsPage';

const ExperimentDetailsPage: FC<ExperimentDetailsPageProps> = (props) => {
  return <ExperimentDetailsPageView {...props} />;
};

export default ExperimentDetailsPage;
