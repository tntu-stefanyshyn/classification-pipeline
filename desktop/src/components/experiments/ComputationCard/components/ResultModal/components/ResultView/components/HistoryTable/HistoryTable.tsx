import { FC } from 'react';
import { DataTable } from '../../../../../../../../ui/DataTable';
import { HistoryTableProps } from './HistoryTable.types';
import { historyColumns } from './utils/columns';
import { useI18n } from '../../../../../../../../../i18n';

const HistoryTable: FC<HistoryTableProps> = ({ history }) => {
  const { messages } = useI18n();
  return (
    <DataTable
      data={history.toReversed()}
      columns={historyColumns()}
      emptyMessage={messages.historyTable.empty}
      pageSize={6}
      pageSizeOptions={[6, 12, 24]}
      getRowId={(row) => row.createdAt}
      className="path-table"
    />
  );
};

export default HistoryTable;
