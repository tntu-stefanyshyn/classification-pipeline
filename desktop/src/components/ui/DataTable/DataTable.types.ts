import type { ColumnDef } from '@tanstack/react-table';

export type DataTableLabels = {
  page: string;
  of: string;
  rowsPerPage: string;
  previous: string;
  next: string;
};

export type DataTableProps<TData> = {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  pageSize?: number;
  pageSizeOptions?: number[];
  emptyMessage?: string;
  labels?: Partial<DataTableLabels>;
  className?: string;
  getRowId?: (row: TData, index: number) => string;
  onRowClick?: (row: TData) => void;
};
