import type { FC } from 'react';
import {
  FilesPage as FilesPageView,
  type FilesPageProps,
} from '../../../components/pages/FilesPage';

const FilesPage: FC<FilesPageProps> = (props) => {
  return <FilesPageView {...props} />;
};

export default FilesPage;
