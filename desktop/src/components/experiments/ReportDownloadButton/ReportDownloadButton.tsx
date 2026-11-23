import { useState, type FC } from 'react';
import { toast } from 'react-toastify';
import { useI18n } from '../../../i18n';
import type { ReportDownloadButtonProps } from './ReportDownloadButton.types';
import { downloadExperimentReport } from './utils/downloadExperimentReport';
import { getReportErrorMessage } from './utils/getReportErrorMessage';

const ReportDownloadButton: FC<ReportDownloadButtonProps> = ({
  experimentId,
  className = 'btn ghost',
}) => {
  const { messages } = useI18n();
  const [downloading, setDownloading] = useState(false);

  const handleClick = async () => {
    setDownloading(true);
    try {
      await downloadExperimentReport(experimentId);
    } catch (error) {
      toast.error(getReportErrorMessage(error, messages));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button className={className} type="button" onClick={handleClick} disabled={downloading}>
      {downloading ? messages.reportDownload.downloading : messages.common.downloadPdf}
    </button>
  );
};

export default ReportDownloadButton;
