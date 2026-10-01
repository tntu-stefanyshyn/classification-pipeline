import { ObjectIdOrString } from '../../../types/context';
import { WorkflowStatus } from '../enums';

export type Transitions<T extends WorkflowStatus> = {
  from: T;
  to: T;
  sideEffect?: (params: { instanceId: ObjectIdOrString }) => Promise<void>;
}[];
