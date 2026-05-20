import { FC } from 'react';
import { Modal } from '../../../../ui/Modal';
import { ResultView } from './components';
import { ResultModalProps } from './ResultModal.types';
import { usePipelineInfoQuery } from './graphql/queries/generated/ExperimentRunInfo';
import { useI18n } from '../../../../../i18n';

const ResultModal: FC<ResultModalProps> = ({ onClose, resultsPathId }) => {
  const { messages } = useI18n();
  const { data } = usePipelineInfoQuery({
    variables: { pipelineId: resultsPathId as string },
    fetchPolicy: 'network-only',
    skip: !resultsPathId,
  });

  return (
    <Modal
      open={!!resultsPathId}
      title={messages.resultView.modalTitle}
      className="modal-wide"
      onClose={onClose}
    >
      {data?.pipeline ? <ResultView pipeline={data.pipeline} /> : messages.resultView.loading}
    </Modal>
  );
};

export default ResultModal;
