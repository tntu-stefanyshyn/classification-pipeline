import { PipelineHistoryItem } from '../../../../../../../../../graphql/types.generated';

export type HistoryItem = Pick<PipelineHistoryItem, 'createdAt' | 'message'>;

export interface HistoryTableProps {
  history: HistoryItem[];
}
