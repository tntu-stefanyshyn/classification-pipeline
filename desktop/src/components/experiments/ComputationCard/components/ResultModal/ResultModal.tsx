import { FC } from 'react';
import { Modal } from '../../../../ui/Modal';
import { ResultView } from './components';
import { ResultModalProps } from './ResultModal.types';
import { usePipelineInfoQuery } from './graphql/queries/generated/ExperimentRunInfo';

const ResultModal: FC<ResultModalProps> = ({ onClose, resultsPathId }) => {
  const { data } = usePipelineInfoQuery({
    variables: { pipelineId: resultsPathId as string },
    fetchPolicy: 'network-only',
    skip: !resultsPathId,
  });

  return (
    <Modal open={!!resultsPathId} title="Результати шляху" onClose={onClose}>
      {data?.pipeline ? <ResultView pipeline={data.pipeline} /> : 'Завантаження...'}
    </Modal>
  );
};

export default ResultModal;
