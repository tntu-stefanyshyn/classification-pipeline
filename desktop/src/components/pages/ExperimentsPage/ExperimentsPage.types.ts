import type { ExperimentsQuery } from './graphql';

export type ExperimentsPageProps = {
  onLogout: () => void;
};

export type ExperimentFormValues = {
  name: string;
  description: string;
  fileId: string;
};

export type ExperimentRow = ExperimentsQuery['experiments'][number];
