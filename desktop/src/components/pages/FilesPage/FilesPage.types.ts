import type { UploadedFileUsageQuery, UploadedFilesQuery } from './graphql';

export type FilesPageProps = {
  onLogout: () => void;
};

export type FileRow = UploadedFilesQuery['uploadedFiles'][number];

export type PendingDelete = {
  file: FileRow;
  usage: UploadedFileUsageQuery['uploadedFileUsage'];
};
