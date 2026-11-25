import { prop } from '@typegoose/typegoose';

export enum ExperimentOperation {
  optimization = 'optimization',
  rerun = 'rerun',
}

/**
 * The one operation that may change the runs and the status of an experiment at a time: an
 * optimization attempt or the admission of a re-run. Not exposed through GraphQL.
 */
export class ExperimentOperationLock {
  /** Identifies the holder; only it can release the lock. */
  @prop({ required: true })
  token!: string;

  @prop({ required: true, enum: ExperimentOperation, type: () => String })
  operation!: ExperimentOperation;

  /** A lease: a holder that died stops blocking the experiment once it has passed. */
  @prop({ required: true })
  expiresAt!: Date;
}
