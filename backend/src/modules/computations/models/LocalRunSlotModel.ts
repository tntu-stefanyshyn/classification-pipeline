import { getModelForClass } from '@typegoose/typegoose';
import { LocalRunSlot } from '../classes/LocalRunSlot';

export const localRunSlotsCollectionName = 'local_run_slots';

export const LocalRunSlotModel = getModelForClass(LocalRunSlot, {
  schemaOptions: { collection: localRunSlotsCollectionName },
});
