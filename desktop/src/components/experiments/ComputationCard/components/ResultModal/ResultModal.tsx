import { FC } from 'react';
import { Modal } from '../../../../ui/Modal';
import { useExperimentRunInfoQuery } from './graphql/queries/generated/ExperimentRunInfo';
import { ResultView } from './components';
import { ResultModalProps } from './ResultModal.types';

const ResultModal: FC<ResultModalProps> = ({ onClose, resultsPathId }) => {
  const { data } = useExperimentRunInfoQuery({
    variables: { experimentRunId: resultsPathId as string },
    fetchPolicy: 'network-only',
    skip: !resultsPathId,
  });

  return (
    <Modal open={!!resultsPathId} title="Результати шляху" onClose={onClose}>
      {data?.experimentRun ? <ResultView experimentRun={data.experimentRun} /> : 'Loading...'}
    </Modal>
  );
};

export default ResultModal;
