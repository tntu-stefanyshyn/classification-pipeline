import { ComputationHistoryEntry } from '../../../../../../../../../graphql/types.generated';

export type HistoryItem = Pick<ComputationHistoryEntry, 'createdAt' | 'message'>;

export interface HistoryTableProps {
  history: HistoryItem[];
}
