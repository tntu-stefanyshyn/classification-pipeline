import { useMemo, type FC } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Modal } from '../../../../ui/Modal';
import { DataTable } from '../../../../ui/DataTable';
import { useI18n } from '../../../../../i18n';
import { usePipelineInfoQuery } from './graphql';
import type {
  CompareModalProps,
  CompareRow,
  CompareRun,
  MetricCompareRow,
} from './CompareModal.types';
import {
  buildMetricRows,
  buildSettingsRows,
  formatDelta,
  formatScore,
  matricesOf,
  rowPercent,
} from './utils/compare';

const highlight = (differs: boolean) => (differs ? 'compare-diff' : undefined);

const CompareModal: FC<CompareModalProps> = ({ ids, onClose }) => {
  const { messages } = useI18n();
  const m = messages.computationCard;
  const options = { fetchPolicy: 'network-only' } as const;
  const a = usePipelineInfoQuery({ variables: { pipelineId: ids[0] }, ...options }).data?.pipeline;
  const b = usePipelineInfoQuery({ variables: { pipelineId: ids[1] }, ...options }).data?.pipeline;

  const settingsRows = useMemo(
    () =>
      a && b
        ? buildSettingsRows(
            a,
            b,
            {
              node: m.compareColumns.node,
              queue: messages.resultView.queue,
              duration: messages.resultView.duration,
              predictionSplit: m.compareColumns.predictionSplit,
              folds: m.compareColumns.folds,
              eegRows: messages.resultView.eegRows,
              channels: messages.resultView.channelNames,
              device: messages.resultView.device,
              finished: m.compareColumns.finished,
            },
            {
              queue: (run) => messages.statuses.computationQueue[run.queue],
              seconds: (run) =>
                Number.isFinite(run.computingResult?.duration)
                  ? `${run.computingResult?.duration?.toFixed(2)} ${messages.resultView.durationSeconds}`
                  : '—',
            }
          )
        : [],
    [a, b, m.compareColumns, messages]
  );
  const metricRows = useMemo(
    () =>
      a && b
        ? buildMetricRows(a, b, {
            accuracy: messages.metrics.accuracy,
            f1: messages.metrics.f1,
            rocAuc: messages.metrics.rocAuc,
          })
        : [],
    [a, b, messages.metrics]
  );

  const settingsColumns = useMemo<ColumnDef<CompareRow>[]>(
    () => [
      { header: '', accessorKey: 'label' },
      {
        header: m.compareRun('A'),
        id: 'a',
        cell: ({ row }) => (
          <span className={highlight(row.original.differs)}>{row.original.a}</span>
        ),
      },
      {
        header: m.compareRun('B'),
        id: 'b',
        cell: ({ row }) => (
          <span className={highlight(row.original.differs)}>{row.original.b}</span>
        ),
      },
    ],
    [m]
  );
  const metricColumns = useMemo<ColumnDef<MetricCompareRow>[]>(() => {
    const scoreCell = (mean: number | null, folds: number[]) => (
      <>
        {formatScore(mean)}
        <div className="muted small">{folds.map((fold) => formatScore(fold)).join(' · ')}</div>
      </>
    );
    return [
      { header: messages.resultView.metric, accessorKey: 'label' },
      {
        header: m.compareRun('A'),
        id: 'a',
        cell: ({ row }) => scoreCell(row.original.meanA, row.original.foldsA),
      },
      {
        header: m.compareRun('B'),
        id: 'b',
        cell: ({ row }) => scoreCell(row.original.meanB, row.original.foldsB),
      },
      {
        header: m.compareDelta,
        id: 'delta',
        cell: ({ row }) => (
          <span className={highlight(Boolean(row.original.delta))}>
            {formatDelta(row.original.delta)}
          </span>
        ),
      },
    ];
  }, [m, messages.resultView.metric]);

  const renderMatrices = (run: CompareRun, other: CompareRun) =>
    matricesOf(run).map((matrix, foldIndex) => (
      <div className="result-confusion" key={foldIndex}>
        <table className="confusion-table">
          <thead>
            <tr>
              <th
                colSpan={matrix[0]?.length ?? 1}
              >{`${messages.resultView.fold} ${foldIndex + 1}`}</th>
            </tr>
          </thead>
          <tbody>
            {matrix.map((matrixRow, rowIndex) => (
              <tr key={rowIndex}>
                {matrixRow.map((cell, columnIndex) => {
                  const mine = rowPercent(cell, matrixRow);
                  const otherRow = matricesOf(other)[foldIndex]?.[rowIndex];
                  const theirs = otherRow ? rowPercent(otherRow[columnIndex], otherRow) : null;
                  const differs = theirs === null || Math.abs(mine - theirs) >= 0.01;
                  return (
                    <td key={columnIndex} className={highlight(differs)}>
                      {mine.toFixed(2)}%
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ));

  return (
    <Modal open title={m.compareTitle} className="modal-wide" onClose={onClose}>
      {a && b ? (
        <div className="result-details">
          <div className="result-section">
            <h4 className="result-section-title">{m.compareSettings}</h4>
            <DataTable
              data={settingsRows}
              columns={settingsColumns}
              pageSize={settingsRows.length}
              className="compare-table"
            />
          </div>
          <div className="result-section">
            <h4 className="result-section-title">{m.compareMetrics}</h4>
            <DataTable
              data={metricRows}
              columns={metricColumns}
              pageSize={metricRows.length}
              className="compare-table"
            />
            <p className="muted small">{m.compareFoldHint}</p>
          </div>
          <div className="result-section">
            <h4 className="result-section-title">{messages.resultView.confusionTitle}</h4>
            <div className="compare-grid">
              <div>
                <p className="item-title">{m.compareRun('A')}</p>
                {renderMatrices(a, b)}
              </div>
              <div>
                <p className="item-title">{m.compareRun('B')}</p>
                {renderMatrices(b, a)}
              </div>
            </div>
          </div>
        </div>
      ) : (
        messages.resultView.loading
      )}
    </Modal>
  );
};

export default CompareModal;
