import { useParams } from 'react-router-dom';
import type { FC } from 'react';
import { ExperimentGraphConstructor } from '../../experiments/ExperimentGraphConstructor';

const ExperimentConstructorPage: FC = () => {
  const params = useParams();
  const id = params.id ?? '';

  return <ExperimentGraphConstructor experimentId={id} />;
};

export default ExperimentConstructorPage;
