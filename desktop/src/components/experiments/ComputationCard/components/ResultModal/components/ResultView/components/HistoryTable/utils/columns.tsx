import { ColumnDef } from '@tanstack/react-table';
import { HistoryItem } from '../HistoryTable.types';

export const historyColumns = [
  {
    header: 'Дата створення',
    id: 'createdAt',
    cell: ({
      row: {
        original: { createdAt },
      },
    }) => <span>{createdAt.toLocaleString()}</span>,
  },
  {
    header: 'Повідомлення',
    id: 'message',
    cell: ({
      row: {
        original: { message },
      },
    }) => {
      return <span>{message}</span>;
    },
  },
] satisfies ColumnDef<HistoryItem>[];
