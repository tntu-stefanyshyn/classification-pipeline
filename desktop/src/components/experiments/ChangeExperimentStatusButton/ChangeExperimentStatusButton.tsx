import React, { FC } from 'react';
import { Button } from '../../ui/Button';
import { useChangeExperimentStatusMutation } from './graphql/mutations/generated/ChangeExperimentStatus';
import { useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ChangeExperimentStatusButtonProps } from './ChangeExperimentStatusButton.types';
import { useI18n } from '../../../i18n';

const ChangeExperimentStatusButton: FC<ChangeExperimentStatusButtonProps> = ({
  label,
  status,
  disabled,
}) => {
  const { messages } = useI18n();
  const { id: experimentId } = useParams() as { id: string };
  const [changeExperimentStatus, { loading }] = useChangeExperimentStatusMutation({
    variables: { input: { experimentId, status } },
    onError: (error) => {
      toast.error(
        error.message || `${messages.common.errorPrefix}: ${messages.experimentDetails.edit}`
      );
    },
  });

  return (
    <Button onClick={() => changeExperimentStatus()} loading={loading} disabled={disabled}>
      {label}
    </Button>
  );
};

export default ChangeExperimentStatusButton;
