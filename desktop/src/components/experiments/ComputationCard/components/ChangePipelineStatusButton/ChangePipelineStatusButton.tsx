import React, { FC } from 'react';
import { useChangePipelineStatusMutation } from './graphql/mutations/generated/ChangePipelineStatus';
import { toast } from 'react-toastify';
import { ChangePipelineStatusButtonProps } from './ChangePipelineStatusButton.types';
import { Button } from '../../../../ui/Button';

const ChangePipelineStatusButton: FC<ChangePipelineStatusButtonProps> = ({
  children,
  status,
  pipelineId,
}) => {
  const [changeExperimentStatus, { loading }] = useChangePipelineStatusMutation({
    variables: { input: { pipelineId, status } },
    onError: (error) => {
      toast.error(error.message || 'Помилка при зміні статусу шляху');
    },
  });

  return (
    <Button className="icon" onClick={() => changeExperimentStatus()} loading={loading}>
      {children}
    </Button>
  );
};

export default ChangePipelineStatusButton;
