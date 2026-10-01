import { ColumnDef } from '@tanstack/react-table';
import { HistoryItem } from '../HistoryTable.types';
import { getMessages, localeService } from '../../../../../../../../../../i18n';

export const historyColumns = () => {
  const messages = getMessages(localeService.getLocale());
  return [
    {
      header: messages.historyTable.createdAt,
      id: 'createdAt',
      cell: ({
        row: {
          original: { createdAt },
        },
      }) => <span>{createdAt.toLocaleString()}</span>,
    },
    {
      header: messages.historyTable.message,
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
};
