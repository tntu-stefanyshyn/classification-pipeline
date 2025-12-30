import React, { FC } from 'react';
import { Button } from '../../ui/Button';
import { useChangeExperimentStatusMutation } from './graphql/mutations/generated/ChangeExperimentStatus';
import { ExperimentStatus } from '../ExperimentGraphConstructor';
import { useParams } from 'react-router-dom';

const ChangeExperimentStatusButton: FC = () => {
  const { id: experimentId } = useParams() as { id: string };
  const [changeExperimentStatus, { loading }] = useChangeExperimentStatusMutation({
    variables: { input: { experimentId, status: ExperimentStatus.computing } },
  });

  return (
    <Button onClick={() => changeExperimentStatus()} loading={loading}>
      Перейти до обчислень
    </Button>
  );
};

export default ChangeExperimentStatusButton;
