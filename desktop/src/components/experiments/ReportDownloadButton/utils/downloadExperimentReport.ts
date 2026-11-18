import { config } from '../../../../config/config';
import { refreshSession } from '../../../../graphql/session';
import { tokenService } from '../../../../services/tokenService';

/** The backend answered the report request with an error status. */
export class ReportDownloadError extends Error {
  constructor(readonly status: number) {
    super(`Report request failed with status ${status}`);
    this.name = 'ReportDownloadError';
  }
}

/**
 * The session could not be refreshed for now: the backend answered the refresh with an error that
 * does not end the session. The user is still signed in, so the download can be tried again.
 */
export class ReportSessionUnavailableError extends Error {
  constructor() {
    super('The session could not be refreshed, so the report was not requested again');
    this.name = 'ReportSessionUnavailableError';
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

const requestReport = (experimentId: string, token: string | null) =>
  fetch(getReportUrl(experimentId), {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

/**
 * Downloads the PDF report with the access token and saves it as a file. A plain link cannot
 * send the `Authorization` header the endpoint requires.
 *
 * A 401 is handled like an UNAUTHENTICATED GraphQL answer: the session the request was sent in
 * is refreshed and the request repeated once with the new access token. A session that expired,
 * or that ended meanwhile, leaves the 401. A refresh that failed for now and kept the session
 * rejects with `ReportSessionUnavailableError`; one that cannot reach the backend rejects with
 * that network error.
 *
 * The report belongs to the session it was requested in: after a sign-out or another sign-in the
 * answer is dropped and no file is saved.
 */
export const downloadExperimentReport = async (experimentId: string) => {
  const generation = tokenService.getGeneration();
  const token = tokenService.getToken();
  let response = await requestReport(experimentId, token);
  if (response.status === 401) {
    const outcome = await refreshSession(generation, token);
    if (outcome === 'unavailable') throw new ReportSessionUnavailableError();
    // The retry stays in the session of the first attempt, never another account's token.
    if (outcome === 'refreshed' && tokenService.getGeneration() === generation) {
      response = await requestReport(experimentId, tokenService.getToken());
    }
  }
  if (!response.ok) throw new ReportDownloadError(response.status);
  const report = await response.blob();
  // Checked after the body was read: the user may sign out or in while it is still arriving.
  if (tokenService.getGeneration() !== generation) return;
  saveFile(report, getReportFilename(experimentId));
};
