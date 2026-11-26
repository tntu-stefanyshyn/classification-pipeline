import { ReactNode } from 'react';
import { PipelineStatus } from '../../../../../graphql/types.generated';

export interface ChangePipelineStatusButtonProps {
  children: ReactNode;
  status: PipelineStatus;
  pipelineId: string;
  /** Accessible name of the icon button (its title and aria-label). */
  label: string;
}
