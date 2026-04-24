import { useMemo, useState, type MouseEvent } from 'react';
import type { PaginationState } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { DataTableProps } from './DataTable.types';
import { defaultLabels } from './constants/defaultLabels';
import { isInteractiveTarget } from './utils/isInteractiveTarget';

const DataTable = <TData,>({
  data,
  columns,
  pageSize = 6,
  pageSizeOptions,
  emptyMessage = 'Немає даних.',
  labels,
  className,
  getRowId,
  onRowClick,
}: DataTableProps<TData>) => {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });

  const resolvedLabels = useMemo(() => ({ ...defaultLabels, ...labels }), [labels]);
  const resolvedPageSizes = useMemo(() => {
    const fallback = [pageSize, pageSize * 2, pageSize * 3];
    const options = pageSizeOptions?.length ? pageSizeOptions : fallback;
    const normalized = Array.from(new Set(options.filter((value) => value > 0)));
    if (!normalized.includes(pageSize)) {
      normalized.push(pageSize);
    }
    return normalized.sort((a, b) => a - b);
  }, [pageSize, pageSizeOptions]);

  const table = useReactTable({
    data,
    columns,
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId,
  });

  const pageCount = table.getPageCount();
  const containerClassName = ['data-table-block', className].filter(Boolean).join(' ');
  const rowClassName = onRowClick ? 'clickable' : undefined;

  const handleRowClick = (event: MouseEvent, row: TData) => {
    if (!onRowClick) return;
    if (event.defaultPrevented) return;
    if (isInteractiveTarget(event.target)) return;
    onRowClick(row);
  };

  const getColumnClassName = (meta: unknown) =>
    typeof meta === 'object' && meta !== null && 'className' in meta
      ? String((meta as { className?: string }).className ?? '')
      : undefined;

  return (
    <div className={containerClassName}>
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className={getColumnClassName(header.column.columnDef.meta)}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="table-empty">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={rowClassName}
                  onClick={(event) => handleRowClick(event, row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={getColumnClassName(cell.column.columnDef.meta)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data.length > 0 && (
        <div className="table-footer">
          <div className="pagination">
            <button
              className="btn ghost small"
              type="button"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              {resolvedLabels.previous}
            </button>
            <button
              className="btn ghost small"
              type="button"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              {resolvedLabels.next}
            </button>
            <span className="pagination-info">
              {resolvedLabels.page} {pagination.pageIndex + 1} {resolvedLabels.of}{' '}
              {Math.max(pageCount, 1)}
            </span>
          </div>
          <label className="page-size">
            {resolvedLabels.rowsPerPage}
            <select
              value={pagination.pageSize}
              onChange={(event) => table.setPageSize(Number(event.target.value))}
            >
              {resolvedPageSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
};

export default DataTable;
