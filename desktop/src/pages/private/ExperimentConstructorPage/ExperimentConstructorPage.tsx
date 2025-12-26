import { useParams } from 'react-router-dom';
import { ExperimentGraphConstructor } from '../../../components/experiments/ExperimentGraphConstructor/ExperimentGraphConstructor';

export function ExperimentConstructorPage() {
  const params = useParams();
  const id = params.id ?? '';

  return <ExperimentGraphConstructor experimentId={id} />;
}

export default ExperimentConstructorPage;
