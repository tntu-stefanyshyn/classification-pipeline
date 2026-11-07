import { config } from '../../../../config/config';
import { tokenService } from '../../../../services/tokenService';

/** The backend answered the report request with an error status. */
export class ReportDownloadError extends Error {
  constructor(readonly status: number) {
    super(`Report request failed with status ${status}`);
    this.name = 'ReportDownloadError';
  }
}

export const getReportUrl = (experimentId: string) => {
  const baseUrl = config.renderer.graphqlEndpoint.replace(/\/graphql\/?$/, '');
  return `${baseUrl}/experiments/${encodeURIComponent(experimentId)}/report`;
};

export const getReportFilename = (experimentId: string) => `experiment-${experimentId}-report.pdf`;

const saveFile = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked after the click has handed the file to the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

/**
 * Downloads the PDF report with the access token and saves it as a file. A plain link cannot
 * send the `Authorization` header the endpoint requires.
 */
export const downloadExperimentReport = async (experimentId: string) => {
  const token = tokenService.getToken();
  const response = await fetch(getReportUrl(experimentId), {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new ReportDownloadError(response.status);
  saveFile(await response.blob(), getReportFilename(experimentId));
};
