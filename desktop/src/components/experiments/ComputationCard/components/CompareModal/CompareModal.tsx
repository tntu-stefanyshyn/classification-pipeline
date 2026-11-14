import { type FC } from 'react';
import { Modal } from '../../../../ui/Modal';
import { useI18n } from '../../../../../i18n';
import { getLocalizedTechnologyLabel } from '../../../../../utils/technologyLabel';
import { usePipelineInfoQuery } from '../ResultModal/graphql/queries/generated/ExperimentRunInfo';
import type { PipelineInfoQuery } from '../ResultModal/graphql/queries/generated/ExperimentRunInfo';
import { CompareModalProps } from './CompareModal.types';

type Run = NonNullable<PipelineInfoQuery['pipeline']>;

const mean = (values?: number[] | null) =>
  values?.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

const fmt = (value: number | null | undefined) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(4) : '—';

const matricesOf = (run: Run) => {
  const result = run.computingResult;
  if (result?.confusionMatrixes?.length) return result.confusionMatrixes;
  return result?.confusionMatrix?.length ? [result.confusionMatrix] : [];
};

// Row-normalised, as in the single-run view, so folds with different sample counts compare fairly.
const percent = (cell: number, row: number[]) => {
  const total = row.reduce((sum, value) => sum + Number(value), 0);
  return total > 0 ? (Number(cell) / total) * 100 : 0;
};

const CompareModal: FC<CompareModalProps> = ({ ids, onClose }) => {
  const { locale, messages } = useI18n();
  const m = messages.computationCard;
  const options = { fetchPolicy: 'network-only' } as const;
  const a = usePipelineInfoQuery({ variables: { pipelineId: ids[0] }, ...options }).data?.pipeline;
  const b = usePipelineInfoQuery({ variables: { pipelineId: ids[1] }, ...options }).data?.pipeline;

  const pathLabel = (run: Run) =>
    run.pathNodes
      ?.map(
        (node) => getLocalizedTechnologyLabel(node.label || node.technology, locale) || node.label
      )
      .join('->');

  const info = (run: Run) => [
    pathLabel(run),
    messages.statuses.computationQueue[run.queue],
    Number.isFinite(run.computingResult?.duration)
      ? `${run.computingResult?.duration?.toFixed(2)} ${messages.resultView.durationSeconds}`
      : '—',
    run.computingResult?.sampleCount ?? '—',
    run.computingResult?.channelNames?.join(', ') || '—',
    run.machineInfo?.hostname || '—',
    new Date(run.updatedAt).toLocaleString(),
  ];
  const infoLabels = [
    m.compareColumns.pipeline,
    messages.resultView.queue,
    messages.resultView.duration,
    messages.resultView.eegRows,
    messages.resultView.channelNames,
    messages.resultView.device,
    m.compareColumns.finished,
  ];

  const metrics = (run: Run) => [
    run.computingResult?.accuracyScores,
    run.computingResult?.f1Scores,
    run.computingResult?.rocAucScores,
  ];
  const metricLabels = [messages.metrics.accuracy, messages.metrics.f1, messages.metrics.rocAuc];

  const renderMatrices = (run: Run, other: Run) =>
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
            {matrix.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, columnIndex) => {
                  const mine = percent(cell, row);
                  const otherRow = matricesOf(other)[foldIndex]?.[rowIndex];
                  const theirs = otherRow ? percent(otherRow[columnIndex], otherRow) : null;
                  const differs = theirs === null || Math.abs(mine - theirs) >= 0.01;
                  return (
                    <td key={columnIndex} className={differs ? 'compare-diff' : undefined}>
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
            <table className="confusion-table compare-table">
              <thead>
                <tr>
                  <th />
                  <th>{m.compareRun('A')}</th>
                  <th>{m.compareRun('B')}</th>
                </tr>
              </thead>
              <tbody>
                {infoLabels.map((label, index) => {
                  const [left, right] = [String(info(a)[index]), String(info(b)[index])];
                  return (
                    <tr key={label}>
                      <th>{label}</th>
                      <td className={left === right ? undefined : 'compare-diff'}>{left}</td>
                      <td className={left === right ? undefined : 'compare-diff'}>{right}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="result-section">
            <h4 className="result-section-title">{m.compareMetrics}</h4>
            <table className="confusion-table compare-table">
              <thead>
                <tr>
                  <th />
                  <th>{m.compareRun('A')}</th>
                  <th>{m.compareRun('B')}</th>
                  <th>{m.compareDelta}</th>
                </tr>
              </thead>
              <tbody>
                {metricLabels.map((label, index) => {
                  const [valuesA, valuesB] = [metrics(a)[index], metrics(b)[index]];
                  const [meanA, meanB] = [mean(valuesA), mean(valuesB)];
                  const delta = meanA !== null && meanB !== null ? meanB - meanA : null;
                  return (
                    <tr key={label}>
                      <th>{label}</th>
                      <td>
                        {fmt(meanA)}
                        <div className="muted small">{valuesA?.map((v) => fmt(v)).join(' · ')}</div>
                      </td>
                      <td>
                        {fmt(meanB)}
                        <div className="muted small">{valuesB?.map((v) => fmt(v)).join(' · ')}</div>
                      </td>
                      <td className={delta ? 'compare-diff' : undefined}>
                        {delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(4)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
