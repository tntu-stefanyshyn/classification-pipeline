import type { Messages } from '../../../../i18n/en';
import { ReportDownloadError } from './downloadExperimentReport';

/** What to tell the user when the report could not be downloaded. */
export const getReportErrorMessage = (error: unknown, messages: Messages) => {
  if (error instanceof ReportDownloadError) {
    if (error.status === 401) return messages.reportDownload.unauthorized;
    if (error.status === 404) return messages.reportDownload.notFound;
    return messages.reportDownload.failed;
  }
  // fetch rejects only when the backend cannot be reached.
  return messages.errors.network;
};
