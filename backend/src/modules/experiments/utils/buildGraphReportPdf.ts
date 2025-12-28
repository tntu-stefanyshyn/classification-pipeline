import puppeteer from 'puppeteer';
import type { GraphNode } from '../classes/GraphNode';
import { buildGraphPaths } from './buildGraphPaths';

type GraphReportInput = {
  experimentId: string;
  experimentName: string;
  createdAt?: Date;
  nodes: GraphNode[];
};

export const buildGraphReportPdf = async (input: GraphReportInput): Promise<Buffer> =>
  (async () => {
    const nodes = input.nodes ?? [];
    const paths = buildGraphPaths(nodes);
    const nodeById = new Map(nodes.map((node) => [String(node._id), node]));

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
