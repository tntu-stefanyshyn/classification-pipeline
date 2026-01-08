import { FC } from 'react';
import { DataTable } from '../../../../../../../../ui/DataTable';
import { HistoryTableProps } from './HistoryTable.types';
import { historyColumns } from './utils/columns';

const HistoryTable: FC<HistoryTableProps> = ({ history }) => {
  return (
    <DataTable
      data={history.toReversed()}
      columns={historyColumns}
      emptyMessage="Історія поки що порожня."
      pageSize={6}
      pageSizeOptions={[6, 12, 24]}
      getRowId={(row) => row.createdAt}
      className="path-table"
    />
  );
};

export default HistoryTable;
