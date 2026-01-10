import puppeteer from 'puppeteer';
import type { GraphNode } from '../classes/GraphNode';
import { buildGraphPaths } from './buildGraphPaths';

type GraphReportInput = {
  experimentId: string;
  experimentName: string;
  createdAt?: Date;
  nodes: GraphNode[];
  pipelines?: Array<{
    _id: string;
    queue?: string;
    pathNodeIds: string[];
    computingResult?: {
      accuracyScores?: number[];
      f1Scores?: number[];
      rocAucScores?: number[];
      sampleCount?: number;
      duration?: number;
      confusionMatrix?: number[][];
      confusionMatrixes?: number[][][];
    } | null;
    optimizationScores?: number[] | null;
    machineInfo?: Record<string, unknown> | null;
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

export const buildGraphReportPdf = async (input: GraphReportInput): Promise<Buffer> =>
  (async () => {
    const nodes = input.nodes ?? [];
    const paths = buildGraphPaths(nodes);
    const nodeById = new Map(nodes.map((node) => [String(node._id), node]));
    const pipelines = input.pipelines ?? [];
    const optimization = input.optimization;

    const escapeHtml = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const buildPathLabel = (path: string[]) =>
      path
        .map((nodeId) => {
          const node = nodeById.get(nodeId);
          return node?.technology || node?.label || nodeId;
        })
        .join(' -> ');

    const bestPipeline = pipelines.find((p) => p._id === optimization?.bestPipelineId) ?? null;
    const bestScore = optimization?.bestScore ?? bestPipeline?.optimizationScores?.at(-1) ?? null;

    const resolvedPaths = new Map(paths.map((path) => [path.join('.'), buildPathLabel(path)]));

    const pipelineDetails = pipelines.map((pipeline) => {
      const pathLabel =
        resolvedPaths.get(pipeline.pathNodeIds.join('.')) || buildPathLabel(pipeline.pathNodeIds);
      const latestScore =
        pipeline.optimizationScores && pipeline.optimizationScores.length > 0
          ? pipeline.optimizationScores[pipeline.optimizationScores.length - 1]
          : null;
      const metrics = pipeline.computingResult ?? {};
      const avg = (values?: number[] | null) =>
        values && values.length > 0
          ? (values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(4)
          : '—';
      return {
        ...pipeline,
        pathLabel,
        latestScore,
        metrics,
        avgAccuracy: avg(metrics.accuracyScores as number[] | undefined),
        avgF1: avg(metrics.f1Scores as number[] | undefined),
        avgRoc: avg(metrics.rocAucScores as number[] | undefined),
        sampleCount: metrics.sampleCount ?? '—',
        duration: metrics.duration ?? '—',
      };
    });

    const sortedByScore = [...pipelineDetails].sort((a, b) => {
      const ascore = typeof a.latestScore === 'number' ? a.latestScore : Number.POSITIVE_INFINITY;
      const bscore = typeof b.latestScore === 'number' ? b.latestScore : Number.POSITIVE_INFINITY;
      return ascore - bscore;
    });

    const chartMin =
      sortedByScore.length > 0
        ? Math.min(
            ...sortedByScore
              .map((p) => p.latestScore)
              .filter((v): v is number => typeof v === 'number')
          )
        : 0;
    const chartMax =
      sortedByScore.length > 0
        ? Math.max(
            ...sortedByScore
              .map((p) => p.latestScore)
              .filter((v): v is number => typeof v === 'number')
          )
        : 0;

    const renderBarWidth = (score: number | null) => {
      if (score === null) return '5%';
      if (!Number.isFinite(chartMin) || !Number.isFinite(chartMax) || chartMax === chartMin) {
        return '50%';
      }
      const normalized = 1 - (score - chartMin) / (chartMax - chartMin);
      const clamped = Math.max(0.05, Math.min(1, normalized));
      return `${(clamped * 100).toFixed(2)}%`;
    };

    const createdAt = input.createdAt ? new Date(input.createdAt).toLocaleString() : null;
    const rows =
      paths.length === 0
        ? '<tr><td colspan="2">No paths found in the graph.</td></tr>'
        : paths
            .map(
              (path, index) =>
                `<tr><td>${index + 1}</td><td>${escapeHtml(buildPathLabel(path))}</td></tr>`
            )
            .join('');

    const historyRows =
      optimization?.history && optimization.history.length > 0
        ? optimization.history
            .map(
              (item) => `
            <tr>
              <td>${item.createdAt ? escapeHtml(new Date(item.createdAt).toLocaleString()) : '—'}</td>
              <td>${escapeHtml(item.status ?? '—')}</td>
              <td>${escapeHtml(item.message ?? '—')}</td>
            </tr>`
            )
            .join('')
        : '<tr><td colspan="3">Історія оптимізації відсутня.</td></tr>';

    const pipelineBlocks =
      pipelineDetails.length === 0
        ? '<p class="muted">Для експерименту ще немає розрахованих пайплайнів.</p>'
        : pipelineDetails
            .map(
              (pipeline, index) => `
          <div class="pipeline-block">
            <div class="pipeline-head">
              <div>
                <div class="eyebrow">Пайплайн #${index + 1}</div>
                <div class="pipeline-title">${escapeHtml(pipeline.pathLabel)}</div>
              </div>
              <div class="badge">${escapeHtml(pipeline.queue ?? '—')}</div>
            </div>
            <div class="pipeline-grid">
              <div>
                <div class="label">Остання оцінка оптимізації</div>
                <div class="value">${pipeline.latestScore ?? '—'}</div>
              </div>
              <div>
                <div class="label">Середня точність</div>
                <div class="value">${pipeline.avgAccuracy}</div>
              </div>
              <div>
                <div class="label">Середній F1</div>
                <div class="value">${pipeline.avgF1}</div>
              </div>
              <div>
                <div class="label">Середній ROC-AUC</div>
                <div class="value">${pipeline.avgRoc}</div>
              </div>
              <div>
                <div class="label">Кількість зразків</div>
                <div class="value">${pipeline.sampleCount}</div>
              </div>
              <div>
                <div class="label">Тривалість, c</div>
                <div class="value">${pipeline.duration}</div>
              </div>
            </div>
            ${
              pipeline.machineInfo
                ? `<div class="machine">
              <div class="label">Машина</div>
              <div class="value">
                ${escapeHtml(
                  JSON.stringify(pipeline.machineInfo, null, 2)
                    .replace(/\\n/g, ' ')
                    .replace(/\s+/g, ' ')
                )}
              </div>
            </div>`
                : ''
            }
          </div>`
            )
            .join('');

    const chartBars =
      sortedByScore.length === 0
        ? '<p class="muted">Немає оцінених пайплайнів для побудови графіка.</p>'
        : sortedByScore
            .map(
              (pipeline, idx) => `
          <div class="chart-row">
            <div class="chart-rank">${idx + 1}</div>
            <div class="chart-body">
              <div class="chart-bar" style="width:${renderBarWidth(
                pipeline.latestScore ?? null
              )}"></div>
              <div class="chart-labels">
                <div>${escapeHtml(pipeline.pathLabel)}</div>
                <div class="muted">Score: ${pipeline.latestScore ?? '—'}</div>
              </div>
            </div>
          </div>`
            )
            .join('');

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Experiment Graph Report</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 40px; color: #111827; }
      h1 { font-size: 20px; margin: 0 0 8px; }
      .meta { font-size: 12px; margin-bottom: 16px; color: #475569; }
      .meta div { margin-bottom: 4px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: left; padding: 8px 6px; font-size: 12px; border-bottom: 1px solid #e2e8f0; }
      th { text-transform: uppercase; letter-spacing: 0.08em; font-size: 10px; color: #64748b; }
      .section { margin: 18px 0; }
      .section h2 { font-size: 16px; margin: 0 0 8px; }
      .muted { color: #64748b; font-size: 12px; }
      .eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; }
      .badge { display: inline-block; padding: 6px 10px; border-radius: 12px; background: #eef2ff; color: #3730a3; font-size: 11px; font-weight: 700; }
      .highlight { padding: 12px; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0; }
      .pipeline-block { padding: 12px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 12px; }
      .pipeline-title { font-weight: 700; font-size: 14px; }
      .pipeline-head { display: flex; justify-content: space-between; align-items: center; }
      .pipeline-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px 12px; margin-top: 10px; }
      .label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; }
      .value { font-size: 13px; font-weight: 600; color: #111827; word-break: break-word; }
      .machine { margin-top: 10px; font-size: 12px; }
      .chart-row { display: grid; grid-template-columns: 28px 1fr; gap: 8px; align-items: center; margin-bottom: 8px; }
      .chart-rank { font-weight: 700; color: #475569; }
      .chart-body { display: flex; flex-direction: column; gap: 4px; }
      .chart-bar { height: 12px; border-radius: 8px; background: linear-gradient(90deg, #22c55e, #16a34a); }
      .chart-labels { display: flex; justify-content: space-between; font-size: 12px; color: #0f172a; }
    </style>
  </head>
  <body>
    <h1>Experiment Graph Report</h1>
    <div class="meta">
      <div>Experiment: ${escapeHtml(input.experimentName)}</div>
      <div>Experiment ID: ${escapeHtml(input.experimentId)}</div>
      <div>Generated: ${escapeHtml(new Date().toLocaleString())}</div>
      ${createdAt ? `<div>Created: ${escapeHtml(createdAt)}</div>` : ''}
    </div>
    <div class="section highlight">
      <h2>Найкращий пайплайн</h2>
      ${
        bestPipeline
          ? `<div class="pipeline-grid">
              <div>
                <div class="label">Шлях</div>
                <div class="value">${escapeHtml(
                  resolvedPaths.get(bestPipeline.pathNodeIds.join('.')) ||
                    buildPathLabel(bestPipeline.pathNodeIds)
                )}</div>
              </div>
              <div>
                <div class="label">Score</div>
                <div class="value">${bestScore ?? '—'}</div>
              </div>
              <div>
                <div class="label">Черга</div>
                <div class="value">${escapeHtml(bestPipeline.queue ?? '—')}</div>
              </div>
            </div>`
          : '<p class="muted">Найкращий пайплайн ще не визначено.</p>'
      }
    </div>
    <div class="section">
      <h2>Оптимізація: історія</h2>
      <table>
        <thead>
          <tr><th>Час</th><th>Статус</th><th>Повідомлення</th></tr>
        </thead>
        <tbody>${historyRows}</tbody>
      </table>
    </div>
    <div class="section">
      <h2>Графік результатів оптимізації</h2>
      ${chartBars}
    </div>
    <div class="section">
      <h2>Деталі пайплайнів</h2>
      ${pipelineBlocks}
    </div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Path</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
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
        margin: { top: '40px', right: '32px', bottom: '40px', left: '32px' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  })();
