import React, { FC } from 'react';
import { useChangePipelineStatusMutation } from './graphql/mutations/generated/ChangePipelineStatus';
import { toast } from 'react-toastify';
import { ChangePipelineStatusButtonProps } from './ChangePipelineStatusButton.types';
import { Button } from '../../../../ui/Button';
import { useI18n } from '../../../../../i18n';

const ChangePipelineStatusButton: FC<ChangePipelineStatusButtonProps> = ({
  children,
  status,
  pipelineId,
  label,
}) => {
  const { messages } = useI18n();
  const [changeExperimentStatus, { loading }] = useChangePipelineStatusMutation({
    variables: { input: { pipelineId, status } },
    onError: (error) => {
      toast.error(
        error.message ||
          `${messages.common.errorPrefix}: ${messages.computationCard.columns.status}`
      );
    },
  });

  return (
    <Button
      className="icon"
      onClick={() => changeExperimentStatus()}
      loading={loading}
      title={label}
      aria-label={label}
    >
      {children}
    </Button>
  );
};

export default ChangePipelineStatusButton;
