import puppeteer from 'puppeteer';
import type { GraphNode } from '../classes/GraphNode';
import { buildGraphPaths } from './buildGraphPaths';

type GraphReportInput = {
  experimentId: string;
  experimentName: string;
  description?: string | null;
  createdAt?: Date;
  nodes: GraphNode[];
  graph?: {
    settings?: {
      metrics?: {
        accuracy?: number;
        f1?: number;
        rocAuc?: number;
        ntps?: number;
      } | null;
      queues?: string[];
      folds?: number;
      hyperOptimizationMinutesPerPipeline?: number;
      predictDataPercent?: number;
    } | null;
    computationMode?: string | null;
  } | null;
  file?: {
    filename?: string;
    sizeMb?: number;
    status?: string;
    uploadedAt?: Date;
    uploadedByName?: string;
  } | null;
  pipelines?: Array<{
    _id: string;
    queue?: string;
    pathNodeIds: string[];
    computingResult?: {
      accuracyScores?: number[];
      f1Scores?: number[];
      rocAucScores?: number[];
      optimizationIntermediateScores?: number[];
      sampleCount?: number;
      duration?: number;
      confusionMatrix?: number[][];
      confusionMatrixes?: number[][][];
      channelNames?: string[];
    } | null;
    optimizationScores?: number[] | null;
    machineInfo?: {
      hostname?: string;
      platform?: string;
      arch?: string;
      release?: string;
      cpuModel?: string;
      gpuModel?: string;
      cores?: number;
      memoryGb?: number;
      appVersion?: string;
      queue?: string;
      lastSeenAt?: Date;
    } | null;
    createdAt?: Date;
    updatedAt?: Date;
  }>;
  optimization?: {
    bestPipelineId?: string;
    bestScore?: number;
    progress?: number;
    status?: string;
    history?: Array<{ createdAt?: Date; message?: string; status?: string }>;
  };
};

const UK_LOCALE = 'uk-UA';

const queueLabels: Record<string, string> = {
  local: 'Локальна черга',
  cloud: 'Хмарна черга',
};

const stageLabels: Record<string, string> = {
  PREPROCESSING: 'Попередня обробка',
  DATA_ENHANCEMENT: 'Покращення даних',
  FEATURE_EXTRACTION: 'Видобування ознак',
  DIMENSIONALITY_REDUCTION: 'Зниження розмірності',
  CLASSIFICATION: 'Класифікація',
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const asNumberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const average = (values?: number[] | null): number | null => {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }
  const normalized = values.filter((value) => Number.isFinite(value));
  if (normalized.length === 0) {
    return null;
  }
  return normalized.reduce((sum, value) => sum + value, 0) / normalized.length;
};

const formatMatrixValue = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const calculateMatrixPercent = (value: unknown, rowTotal: number): number => {
  if (!Number.isFinite(rowTotal) || rowTotal <= 0) {
    return 0;
  }
  return (formatMatrixValue(value) / rowTotal) * 100;
};

const getConfusionCellStyle = (percent: number): string => {
  const ratio = Math.max(0, Math.min(percent, 100)) / 100;
  const hue = 4 + (130 - 4) * ratio;
  const saturation = 72;
  const lightness = 93 - ratio * 38;
  const textColor = ratio >= 0.58 ? '#ffffff' : '#0b1220';
  return `background-color: hsl(${hue.toFixed(1)} ${saturation}% ${lightness.toFixed(
    1
  )}%); color: ${textColor}; font-weight: 700;`;
};

const formatDate = (value?: Date | null) =>
  value ? new Date(value).toLocaleString(UK_LOCALE) : '—';

const formatNumber = (value: number | null | undefined, digits = 4) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';

const formatPercent = (value: number | null | undefined, digits = 2) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const fixed = (value * 100)
    .toFixed(digits)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*[1-9])0+$/, '$1');
  return `${fixed}%`;
};

const formatQueue = (queue?: string | null) => {
  if (!queue) return '—';
  return queueLabels[queue] ?? queue;
};

export const buildGraphReportPdf = async (input: GraphReportInput): Promise<Buffer> =>
  (async () => {
    const nodes = input.nodes ?? [];
    const paths = buildGraphPaths(nodes);
    const nodeById = new Map(nodes.map((node) => [String(node._id), node]));
    const pipelines = input.pipelines ?? [];
    const optimization = input.optimization;
    const settings = input.graph?.settings ?? null;

    const buildPathLabel = (path: string[]) =>
      path
        .map((nodeId) => {
          const node = nodeById.get(nodeId);
          return node?.technology || node?.label || nodeId;
        })
        .join(' -> ');

    const resolvedPaths = new Map(paths.map((path) => [path.join('.'), buildPathLabel(path)]));

    const pipelineDetails = pipelines.map((pipeline) => {
      const pathLabel =
        resolvedPaths.get(pipeline.pathNodeIds.join('.')) || buildPathLabel(pipeline.pathNodeIds);
      const latestScore =
        Array.isArray(pipeline.optimizationScores) && pipeline.optimizationScores.length > 0
          ? asNumberOrNull(pipeline.optimizationScores[pipeline.optimizationScores.length - 1])
          : null;
      const metrics = pipeline.computingResult ?? null;
      const confusionMatrices =
        Array.isArray(metrics?.confusionMatrixes) && metrics.confusionMatrixes.length > 0
          ? metrics.confusionMatrixes
          : Array.isArray(metrics?.confusionMatrix) && metrics.confusionMatrix.length > 0
            ? [metrics.confusionMatrix]
            : [];

      return {
        ...pipeline,
        pathLabel,
        latestScore,
        avgAccuracy: average(metrics?.accuracyScores),
        avgF1: average(metrics?.f1Scores),
        avgRoc: average(metrics?.rocAucScores),
        sampleCount: asNumberOrNull(metrics?.sampleCount),
        duration: asNumberOrNull(metrics?.duration),
        confusionMatrices,
        channelNames: metrics?.channelNames ?? [],
      };
    });

    const sortedByScore = [...pipelineDetails].sort((a, b) => {
      const ascore = typeof a.latestScore === 'number' ? a.latestScore : Number.POSITIVE_INFINITY;
      const bscore = typeof b.latestScore === 'number' ? b.latestScore : Number.POSITIVE_INFINITY;
      return ascore - bscore;
    });

    const bestPipelineById =
      (optimization?.bestPipelineId
        ? pipelineDetails.find((pipeline) => pipeline._id === optimization.bestPipelineId)
        : undefined) ?? null;
    const bestPipeline =
      bestPipelineById ??
      sortedByScore.find((pipeline) => typeof pipeline.latestScore === 'number') ??
      null;
    const bestScore = asNumberOrNull(optimization?.bestScore) ?? bestPipeline?.latestScore ?? null;

    const scoreValues = sortedByScore
      .map((pipeline) => pipeline.latestScore)
      .filter((score): score is number => typeof score === 'number');
    const scoreMin = scoreValues.length > 0 ? Math.min(...scoreValues) : null;
    const scoreMax = scoreValues.length > 0 ? Math.max(...scoreValues) : null;

    const renderMinimizeBarWidth = (value: number | null) => {
      if (value === null) return '8%';
      if (scoreMin === null || scoreMax === null || scoreMin === scoreMax) return '55%';
      const normalized = 1 - (value - scoreMin) / (scoreMax - scoreMin);
      const clamped = Math.max(0.08, Math.min(1, normalized));
      return `${(clamped * 100).toFixed(2)}%`;
    };

    const sampleCounts = pipelineDetails
      .map((pipeline) => pipeline.sampleCount)
      .filter((value): value is number => typeof value === 'number');
    const sampleSummary =
      sampleCounts.length === 0
        ? 'Немає розрахованих даних.'
        : Math.min(...sampleCounts) === Math.max(...sampleCounts)
          ? `${Math.min(...sampleCounts)} зразків`
          : `${Math.min(...sampleCounts)} - ${Math.max(...sampleCounts)} зразків (середнє: ${formatNumber(average(sampleCounts), 2)})`;

    const selectedQueues = (() => {
      const fromSettings = (settings?.queues ?? [])
        .map((queue) => String(queue))
        .filter((queue): queue is 'local' | 'cloud' => queue === 'local' || queue === 'cloud');
      if (fromSettings.length > 0) {
        return Array.from(new Set(fromSettings));
      }
      const mode = input.graph?.computationMode;
      if (mode === 'local') return ['local'] as Array<'local' | 'cloud'>;
      if (mode === 'cloud') return ['cloud'] as Array<'local' | 'cloud'>;
      if (mode === 'both') return ['local', 'cloud'] as Array<'local' | 'cloud'>;
      return [] as Array<'local' | 'cloud'>;
    })();
    const orderedModes: Array<'local' | 'cloud'> = ['local', 'cloud'];
    const environmentModes: Array<'local' | 'cloud'> = (() => {
      if (selectedQueues.length > 0) {
        return orderedModes.filter((mode) => selectedQueues.includes(mode));
      }
      const fromPipelines = Array.from(
        new Set(
          pipelineDetails
            .map((pipeline) => String(pipeline.queue ?? ''))
            .filter((queue): queue is 'local' | 'cloud' => queue === 'local' || queue === 'cloud')
        )
      );
      return orderedModes.filter((mode) => fromPipelines.includes(mode));
    })();
    const executionEnvironmentCards = environmentModes
      .map((mode) => {
        const [latestRunWithMachine] = [...pipelineDetails]
          .filter((pipeline) => pipeline.queue === mode && pipeline.machineInfo)
          .sort(
            (a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()
          );
        const executionMachine = latestRunWithMachine?.machineInfo ?? null;
        const machineDetails = executionMachine
          ? `
            <div class="execution-device-grid">
              <div><div class="label">Пристрій</div><div class="value">${escapeHtml(executionMachine.hostname ?? '—')}</div></div>
              <div><div class="label">Платформа</div><div class="value">${escapeHtml(
                executionMachine.platform ?? '—'
              )}</div></div>
              <div><div class="label">ОС / реліз</div><div class="value">${escapeHtml(
                [executionMachine.arch, executionMachine.release].filter(Boolean).join(' / ') || '—'
              )}</div></div>
              <div><div class="label">CPU</div><div class="value">${escapeHtml(
                `${executionMachine.cpuModel ?? '—'} (${typeof executionMachine.cores === 'number' ? executionMachine.cores : '—'} ядер)`
              )}</div></div>
              <div><div class="label">GPU</div><div class="value">${escapeHtml(executionMachine.gpuModel ?? '—')}</div></div>
              <div><div class="label">RAM</div><div class="value">${escapeHtml(
                typeof executionMachine.memoryGb === 'number'
                  ? `${formatNumber(executionMachine.memoryGb, 2)} ГБ`
                  : '—'
              )}</div></div>
              <div><div class="label">Версія застосунку</div><div class="value">${escapeHtml(
                executionMachine.appVersion ?? '—'
              )}</div></div>
              <div><div class="label">Останній контакт</div><div class="value">${escapeHtml(
                formatDate(executionMachine.lastSeenAt)
              )}</div></div>
            </div>
          `
          : '<p class="muted">Інформація про пристрій для цього режиму відсутня.</p>';
        return `
          <div class="execution-env-card">
            <div class="label">Режим виконання</div>
            <div class="value execution-mode-value">${escapeHtml(formatQueue(mode))}</div>
            ${machineDetails}
          </div>
        `;
      })
      .join('');
    const executionDeviceBlock =
      executionEnvironmentCards.length > 0
        ? `
          <div class="execution-env-grid ${
            environmentModes.length > 1 ? 'execution-env-grid-two' : 'execution-env-grid-one'
          }">
            ${executionEnvironmentCards}
          </div>
        `
        : '<p class="muted">Інформація про пристрій виконання відсутня.</p>';
    const fileExtension = (() => {
      const filename = input.file?.filename?.trim() ?? '';
      if (!filename || !filename.includes('.')) return '—';
      const ext = filename.split('.').pop()?.trim();
      return ext ? ext.toUpperCase() : '—';
    })();

    const graphConveyorsRows =
      paths.length === 0
        ? '<tr><td colspan="3">У графі не знайдено жодного конвеєра.</td></tr>'
        : paths
            .map((path, index) => {
              return `
                <tr>
                  <td>${index + 1}</td>
                  <td>${escapeHtml(buildPathLabel(path))}</td>
                  <td>${path.length}</td>
                </tr>
              `;
            })
            .join('');

    const renderPipelineStageSettings = (pipeline: (typeof pipelineDetails)[number]) => {
      const nodesInPipeline = (pipeline.pathNodeIds ?? [])
        .map((nodeId) => nodeById.get(String(nodeId)))
        .filter((node): node is GraphNode => Boolean(node));

      if (nodesInPipeline.length === 0) {
        return '<p class="muted">Етапи для конвеєра не знайдено.</p>';
      }

      const rowsHtml = nodesInPipeline
        .map((node) => {
          const stageLabel = stageLabels[String(node.stage)] ?? String(node.stage ?? '—');
          const paramsLabel =
            Array.isArray(node.settings) && node.settings.length > 0
              ? node.settings.map((item) => `${item.key}: ${item.value}`).join('; ')
              : 'Параметри не вказано';
          return `
            <tr>
              <td>${escapeHtml(stageLabel)}</td>
              <td>${escapeHtml(node.technology || node.label || '—')}</td>
              <td>${escapeHtml(paramsLabel)}</td>
            </tr>
          `;
        })
        .join('');

      return `
        <table class="table compact">
          <thead>
            <tr><th>Етап</th><th>Алгоритм</th><th>Параметри запуску</th></tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      `;
    };

    const renderIntermediateOptimizationScores = (pipeline: (typeof pipelineDetails)[number]) => {
      const scores = pipeline.computingResult?.optimizationIntermediateScores ?? [];
      if (!Array.isArray(scores) || scores.length === 0) {
        return '<p class="muted">Проміжні узагальнені значення метрик відсутні.</p>';
      }
      const rowsHtml = scores
        .map(
          (score, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${formatNumber(asNumberOrNull(score), 6)}</td>
          </tr>
        `
        )
        .join('');
      return `
        <table class="table compact">
          <thead>
            <tr><th>Крок</th><th>Узагальнена оцінка</th></tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      `;
    };

    const renderFoldMetrics = (pipeline: (typeof pipelineDetails)[number]) => {
      const accuracy = pipeline.computingResult?.accuracyScores ?? [];
      const f1 = pipeline.computingResult?.f1Scores ?? [];
      const roc = pipeline.computingResult?.rocAucScores ?? [];
      const folds = Math.max(accuracy.length, f1.length, roc.length);
      if (folds === 0) {
        return '<p class="muted">Проміжні значення метрик не отримано.</p>';
      }

      const rowsHtml = Array.from({ length: folds }, (_, index) => {
        const accuracyValue = asNumberOrNull(accuracy[index]);
        const f1Value = asNumberOrNull(f1[index]);
        const rocValue = asNumberOrNull(roc[index]);
        return `
          <tr>
            <td>${index + 1}</td>
            <td>${formatNumber(accuracyValue)}</td>
            <td>${formatNumber(f1Value)}</td>
            <td>${formatNumber(rocValue)}</td>
          </tr>
        `;
      }).join('');

      return `
        <table class="table compact">
          <thead>
            <tr><th>Крок</th><th>Точність</th><th>F1</th><th>ROC-AUC</th></tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      `;
    };

    const renderConfusionMatrices = (pipeline: (typeof pipelineDetails)[number]) => {
      if (!Array.isArray(pipeline.confusionMatrices) || pipeline.confusionMatrices.length === 0) {
        return '<p class="muted">Матриці невідповідностей відсутні.</p>';
      }

      const labels = pipeline.channelNames ?? [];
      return pipeline.confusionMatrices
        .map((matrix, matrixIndex) => {
          const rowCount = matrix.length;
          const colCount = matrix.reduce((max, row) => Math.max(max, row.length), 0);
          const size = Math.max(rowCount, colCount);
          if (size === 0) {
            return `
              <div class="matrix">
                <p class="muted">Крок ${matrixIndex + 1}: порожня матриця.</p>
              </div>
            `;
          }

          const header = Array.from({ length: size }, (_, colIndex) => {
            const label = labels[colIndex] ? escapeHtml(labels[colIndex]) : `Клас ${colIndex + 1}`;
            return `<th>${label}</th>`;
          }).join('');

          const body = Array.from({ length: size }, (_, rowIndex) => {
            const rowLabel = labels[rowIndex]
              ? escapeHtml(labels[rowIndex])
              : `Клас ${rowIndex + 1}`;
            const rowValues = Array.from({ length: size }, (_, colIndex) =>
              formatMatrixValue(matrix[rowIndex]?.[colIndex])
            );
            const rowTotal = rowValues.reduce((total, nextValue) => total + nextValue, 0);
            const cells = rowValues
              .map((value) => {
                const cellPercent = calculateMatrixPercent(value, rowTotal);
                return `<td style="${getConfusionCellStyle(cellPercent)}">${cellPercent.toFixed(
                  2
                )}%</td>`;
              })
              .join('');
            return `<tr><th>${rowLabel}</th>${cells}</tr>`;
          }).join('');

          return `
            <div class="matrix">
              <table class="table matrix-table">
                <thead>
                  <tr><th>Крок ${matrixIndex + 1}</th>${header}</tr>
                </thead>
                <tbody>${body}</tbody>
              </table>
            </div>
          `;
        })
        .join('');
    };

    const chartBars =
      sortedByScore.length === 0
        ? '<p class="muted">Немає оцінених конвеєрів для побудови графіка.</p>'
        : sortedByScore
            .map(
              (pipeline, index) => `
          <div class="chart-row">
            <div class="chart-rank">${index + 1}</div>
            <div class="chart-main">
              <div class="chart-bar score" style="width:${renderMinimizeBarWidth(
                pipeline.latestScore
              )}"></div>
              <div class="chart-labels">
                <div>${escapeHtml(pipeline.pathLabel)}</div>
                <div class="muted">Оцінка: ${formatNumber(pipeline.latestScore, 6)}</div>
              </div>
            </div>
          </div>`
            )
            .join('');

    const buildMetricChart = ({
      title,
      valueSelector,
      lowerIsBetter,
      digits,
    }: {
      title: string;
      valueSelector: (pipeline: (typeof pipelineDetails)[number]) => number | null;
      lowerIsBetter: boolean;
      digits: number;
    }) => {
      const points = pipelineDetails
        .map((pipeline) => ({
          pipeline,
          value: valueSelector(pipeline),
        }))
        .filter((item) => typeof item.value === 'number') as Array<{
        pipeline: (typeof pipelineDetails)[number];
        value: number;
      }>;

      if (points.length === 0) {
        return `
          <div class="metric-block">
            <h3>${escapeHtml(title)}</h3>
            <p class="muted">Немає достатньо даних для побудови графіка.</p>
          </div>
        `;
      }

      points.sort((a, b) => {
        if (lowerIsBetter) {
          return a.value - b.value;
        }
        return b.value - a.value;
      });

      const min = Math.min(...points.map((item) => item.value));
      const max = Math.max(...points.map((item) => item.value));

      const widthForValue = (value: number) => {
        if (min === max) return '55%';
        const normalized = lowerIsBetter
          ? 1 - (value - min) / (max - min)
          : (value - min) / (max - min);
        const clamped = Math.max(0.08, Math.min(1, normalized));
        return `${(clamped * 100).toFixed(2)}%`;
      };

      const rowsHtml = points
        .map(
          (item, index) => `
            <div class="chart-row">
              <div class="chart-rank">${index + 1}</div>
              <div class="chart-main">
                <div class="chart-bar metric" style="width:${widthForValue(item.value)}"></div>
                <div class="chart-labels">
                  <div>${escapeHtml(item.pipeline.pathLabel)}</div>
                  <div class="muted">${formatNumber(item.value, digits)}</div>
                </div>
              </div>
            </div>
          `
        )
        .join('');

      return `
        <div class="metric-block">
          <h3>${escapeHtml(title)}</h3>
          ${rowsHtml}
        </div>
      `;
    };

    const metricCharts = [
      buildMetricChart({
        title: 'Середня точність класифікації',
        valueSelector: (pipeline) => pipeline.avgAccuracy,
        lowerIsBetter: false,
        digits: 4,
      }),
      buildMetricChart({
        title: 'Середнє значення F1-міри',
        valueSelector: (pipeline) => pipeline.avgF1,
        lowerIsBetter: false,
        digits: 4,
      }),
      buildMetricChart({
        title: 'Середнє значення ROC-AUC',
        valueSelector: (pipeline) => pipeline.avgRoc,
        lowerIsBetter: false,
        digits: 4,
      }),
      buildMetricChart({
        title: 'Середній час виконання моделі, с',
        valueSelector: (pipeline) => pipeline.duration,
        lowerIsBetter: true,
        digits: 2,
      }),
    ].join('');

    type PipelineDetail = (typeof pipelineDetails)[number];
    const renderPipelineCards = ({
      pipeline,
      scoreLabel,
      scoreValue,
      titleIndex,
    }: {
      pipeline: PipelineDetail;
      scoreLabel: string;
      scoreValue: number | null;
      titleIndex?: number;
    }) => `
      <div class="pipeline-stack">
        <div class="pipeline-head">
          <div>
            <div class="pipeline-title">${titleIndex ? `${titleIndex}. ` : ''}${escapeHtml(
              pipeline.pathLabel
            )}</div>
          </div>
          <div class="badge">${escapeHtml(formatQueue(pipeline.queue))}</div>
        </div>

        <div class="pipeline-panels">
          <div class="pipeline-panel-card">
            <h3>Деталі конвеєра</h3>
            <table class="table compact">
              <tbody>
                <tr><th>Черга</th><td>${escapeHtml(formatQueue(pipeline.queue))}</td></tr>
                <tr><th>${escapeHtml(scoreLabel)}</th><td>${formatNumber(scoreValue, 6)}</td></tr>
                <tr><th>Кількість даних</th><td>${formatNumber(pipeline.sampleCount, 0)}</td></tr>
                <tr><th>Створено</th><td>${escapeHtml(formatDate(pipeline.createdAt))}</td></tr>
                <tr><th>Оновлено</th><td>${escapeHtml(formatDate(pipeline.updatedAt))}</td></tr>
              </tbody>
            </table>
            <div class="subsection">
              <h4>Параметри етапів</h4>
              ${renderPipelineStageSettings(pipeline)}
            </div>
          </div>

          <div class="pipeline-panel-card">
            <h3>Метрики</h3>
            <table class="table compact">
              <tbody>
                <tr><th>Середня точність</th><td>${formatNumber(pipeline.avgAccuracy)}</td></tr>
                <tr><th>Середній F1</th><td>${formatNumber(pipeline.avgF1)}</td></tr>
                <tr><th>Середній ROC-AUC</th><td>${formatNumber(pipeline.avgRoc)}</td></tr>
                <tr><th>Час виконання, с</th><td>${formatNumber(pipeline.duration, 2)}</td></tr>
              </tbody>
            </table>
            <div class="subsection">
              <h4>Проміжні метрики по кроках</h4>
              ${renderFoldMetrics(pipeline)}
            </div>
          </div>

          <div class="pipeline-panel-card">
            <h3>Матриця невідповідностей</h3>
            ${renderConfusionMatrices(pipeline)}
          </div>

          <div class="pipeline-panel-card">
            <h3>Проміжні оцінки оптимізації</h3>
            ${renderIntermediateOptimizationScores(pipeline)}
          </div>
        </div>
      </div>
    `;

    const pipelineBlocks =
      pipelineDetails.length === 0
        ? '<p class="muted">Для експерименту ще немає розрахованих конвеєрів.</p>'
        : pipelineDetails
            .map((pipeline, index) =>
              renderPipelineCards({
                pipeline,
                scoreLabel: 'Остання оцінка',
                scoreValue: pipeline.latestScore,
                titleIndex: index + 1,
              })
            )
            .join('');

    const bestPipelineSection = bestPipeline
      ? renderPipelineCards({
          pipeline: bestPipeline,
          scoreLabel: 'Найкраща оцінка',
          scoreValue: bestScore,
        })
      : '<p class="muted">Найефективніший конвеєр ще не визначено.</p>';

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Звіт експерименту</title>
    <style>
      :root { --card-bg: #f8fafc; }
      body { font-family: Arial, sans-serif; margin: 28px; color: #0f172a; }
      h1 { font-size: 22px; margin: 0 0 8px; }
      h2 { font-size: 19px; margin: 0 0 10px; }
      h3 { font-size: 15px; margin: 0 0 8px; }
      h4 { font-size: 14px; margin: 0 0 8px; }
      .meta { font-size: 12px; color: #475569; margin-bottom: 0; }
      .section { margin: 14px 0 18px; page-break-inside: avoid; }
      .section:first-of-type { margin-top: 0; }
      .card { background: var(--card-bg); border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; margin-bottom: 10px; }
      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
      .file-card { display: flex; flex-direction: column; gap: 8px; }
      .file-main { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0; }
      .file-name { font-size: 15px; font-weight: 700; color: #0f172a; line-height: 1.35; word-break: break-word; }
      .file-chip { border: 1px solid #cbd5e1; background: #f8fafc; color: #334155; border-radius: 999px; padding: 2px 8px; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; }
      .file-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 6px 12px; }
      .metric-weights-grid { display: grid; grid-template-columns: repeat(4, minmax(130px, 1fr)); gap: 8px 10px; margin-top: 8px; }
      .execution-env-grid { display: grid; gap: 10px; }
      .execution-env-grid-one { grid-template-columns: 1fr; }
      .execution-env-grid-two { grid-template-columns: 1fr 1fr; }
      .execution-env-card { padding: 0; }
      .execution-mode-value { margin-bottom: 8px; }
      .execution-device-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 10px; }
      .label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; }
      .value { font-size: 13px; font-weight: 600; color: #0f172a; word-break: break-word; }
      .muted { color: #64748b; font-size: 12px; }
      .alert { border-radius: 10px; border: 1px solid #f59e0b; background: #fffbeb; color: #92400e; padding: 10px 12px; font-size: 12px; margin-bottom: 10px; }
      .pipeline-stack { margin-bottom: 12px; page-break-inside: avoid; }
      .pipeline-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 10px; }
      .pipeline-title { font-size: 14px; font-weight: 700; }
      .badge { display: inline-block; padding: 5px 10px; border-radius: 999px; background: #e2e8f0; color: #0f172a; font-size: 11px; font-weight: 700; }
      .pipeline-panels { display: grid; grid-template-columns: 1fr; gap: 10px; }
      .pipeline-panel-card { border: 1px solid #e2e8f0; border-radius: 12px; background: var(--card-bg); padding: 10px; }
      .subsection { margin-top: 10px; padding-top: 8px; border-top: 1px dashed #cbd5e1; }
      .table { width: 100%; border-collapse: collapse; }
      .table th, .table td { text-align: left; border-bottom: 1px solid #e2e8f0; padding: 6px; font-size: 12px; }
      .table th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #475569; }
      .table.compact th, .table.compact td { padding: 4px 6px; font-size: 11px; }
      .matrix { margin-bottom: 10px; }
      .matrix-title { font-size: 12px; font-weight: 700; margin-bottom: 4px; }
      .matrix-table th, .matrix-table td { text-align: center; }
      .matrix-table thead th:first-child { width: 86px; min-width: 86px; max-width: 86px; white-space: normal; line-height: 1.2; }
      .matrix-table tbody th { width: 86px; min-width: 86px; max-width: 86px; white-space: normal; line-height: 1.2; word-break: break-word; text-align: left; }
      .chart-row { display: grid; grid-template-columns: 28px 1fr; gap: 8px; align-items: center; margin-bottom: 8px; }
      .chart-rank { font-size: 12px; font-weight: 700; color: #475569; }
      .chart-main { display: flex; flex-direction: column; gap: 3px; }
      .chart-bar { height: 10px; border-radius: 999px; }
      .chart-bar.score { background: linear-gradient(90deg, #0ea5e9, #2563eb); }
      .chart-bar.metric { background: linear-gradient(90deg, #0ea5e9, #2563eb); }
      .chart-labels { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; }
      .metric-block { border: 1px solid #e2e8f0; border-radius: 12px; background: var(--card-bg); padding: 10px; margin-bottom: 10px; }
      .toc-section { margin: 20px 0 18px; }
      .toc-title { font-size: 17px; font-weight: 700; margin: 0 0 8px; }
      .toc-list { margin: 0; padding-left: 22px; display: flex; flex-direction: column; gap: 10px; }
      .toc-list li { margin: 0; font-size: 15px; color: #0f172a; line-height: 1.35; }
      .toc-link { color: #0f172a; text-decoration: none; }
      .charts-sheet { page-break-after: always; }
      .charts-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
      .page-break { page-break-before: always; }
      @media print {
        .grid-2, .grid-3 { grid-template-columns: 1fr; }
        .charts-grid { grid-template-columns: 1fr; }
        .execution-device-grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <h1>Звіт за результатами експерименту</h1>
    <div class="meta">
      <div>Експеримент: ${escapeHtml(input.experimentName)}</div>
      <div>Сформовано: ${escapeHtml(new Date().toLocaleString(UK_LOCALE))}</div>
      <div>Створено: ${escapeHtml(formatDate(input.createdAt))}</div>
    </div>
    <div class="toc-section">
      <div class="toc-title">Зміст</div>
      <ol class="toc-list">
        <li><a class="toc-link" href="#section-intro">Вступ і контекст</a></li>
        <li><a class="toc-link" href="#section-best-pipeline">Найефективніший конвеєр</a></li>
        <li><a class="toc-link" href="#section-charts">Порівняльний графічний аналіз конвеєрів</a></li>
        <li><a class="toc-link" href="#section-details">Детальний розбір кожного конвеєра</a></li>
      </ol>
    </div>

    <div class="section">
      <h2 id="section-intro">1. Вступ і контекст</h2>
      <div class="card">
        <h3>Використаний файл</h3>
        ${
          input.file
            ? `
          <div class="file-card">
            <div class="file-main">
              <div>
                <div class="label">Файл</div>
                <div class="file-name">${escapeHtml(input.file.filename ?? '—')}</div>
              </div>
              <div class="file-chip">${escapeHtml(fileExtension)}</div>
            </div>
            <div class="file-meta">
              <div><div class="label">Тип файлу</div><div class="value">${escapeHtml(fileExtension)}</div></div>
              <div><div class="label">Розмір (МБ)</div><div class="value">${formatNumber(
                asNumberOrNull(input.file.sizeMb),
                2
              )}</div></div>
              <div><div class="label">Завантажено</div><div class="value">${escapeHtml(
                formatDate(input.file.uploadedAt)
              )}</div></div>
              <div><div class="label">Користувач</div><div class="value">${escapeHtml(
                input.file.uploadedByName ?? '—'
              )}</div></div>
            </div>
          </div>
        `
            : '<p class="muted">Файл для експерименту не привʼязано.</p>'
        }
      </div>
      <div class="card">
        <h3>Налаштування та обсяг даних</h3>
        <div class="grid-3">
          <div><div class="label">Кількість вузлів графа</div><div class="value">${nodes.length}</div></div>
          <div><div class="label">Кількість конвеєрів</div><div class="value">${pipelineDetails.length}</div></div>
          <div><div class="label">Кількість даних</div><div class="value">${escapeHtml(
            sampleSummary
          )}</div></div>
          <div><div class="label">Кількість кроків перехресної валідації</div><div class="value">${
            settings?.folds ?? '—'
          }</div></div>
          <div><div class="label">Час гіпероптимізації / конвеєр (хв)</div><div class="value">${
            settings?.hyperOptimizationMinutesPerPipeline ?? '—'
          }</div></div>
          <div><div class="label">Дані для предікту</div><div class="value">${
            typeof settings?.predictDataPercent === 'number'
              ? `${settings.predictDataPercent}%`
              : '—'
          }</div></div>
          <div><div class="label">Обрані режими виконання</div><div class="value">${escapeHtml(
            selectedQueues.length > 0
              ? selectedQueues.map((queue) => formatQueue(queue)).join(', ')
              : 'Не вказано'
          )}</div></div>
        </div>
        <div style="margin-top:10px;">
          <div class="label">Ваги метрик (%)</div>
          <div class="metric-weights-grid">
            <div><div class="label">Точність</div><div class="value">${formatPercent(asNumberOrNull(settings?.metrics?.accuracy), 2)}</div></div>
            <div><div class="label">F1</div><div class="value">${formatPercent(asNumberOrNull(settings?.metrics?.f1), 2)}</div></div>
            <div><div class="label">ROC-AUC</div><div class="value">${formatPercent(asNumberOrNull(settings?.metrics?.rocAuc), 2)}</div></div>
            <div><div class="label">NTPS</div><div class="value">${formatPercent(asNumberOrNull(settings?.metrics?.ntps), 2)}</div></div>
          </div>
        </div>
      </div>
      <div class="card">
        <h3>Середовище виконання</h3>
        ${executionDeviceBlock}
      </div>
      <div class="card">
        <h3>Конвеєри графа</h3>
        <table class="table">
          <thead>
            <tr><th>#</th><th>Назва конвеєра</th><th>Кількість вузлів</th></tr>
          </thead>
          <tbody>${graphConveyorsRows}</tbody>
        </table>
      </div>
    </div>

    <div class="section page-break">
      <h2 id="section-best-pipeline">2. Найефективніший конвеєр</h2>
      ${bestPipelineSection}
    </div>

    <div class="section page-break charts-sheet">
      <h2 id="section-charts">3. Порівняльний графічний аналіз конвеєрів</h2>
      <div class="charts-grid">
        <div class="metric-block">
          <h3>Значення цільової функції оптимізації</h3>
          <p class="muted">
            Нижче значення цільової функції відповідає вищій якості моделі.
          </p>
          ${chartBars}
        </div>
        ${metricCharts}
      </div>
    </div>

    <div class="section">
      <h2 id="section-details">4. Детальний розбір кожного конвеєра</h2>
      ${pipelineBlocks}
    </div>

  </body>
</html>`;

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '30px', right: '24px', bottom: '30px', left: '24px' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  })();
