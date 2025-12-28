import { FilesPage as FilesPageView } from '../../../components/pages/FilesPage/FilesPage';
import type { FilesPageProps } from '../../../components/pages/FilesPage/FilesPage.types';

export function FilesPage(props: FilesPageProps) {
  return <FilesPageView {...props} />;
}

export default FilesPage;
