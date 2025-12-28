import type { UploadedFilesQuery } from './graphql';

export type FilesPageProps = {
  onLogout: () => void;
};

export type FileRow = UploadedFilesQuery['uploadedFiles'][number];
