import { getModelForClass } from '@typegoose/typegoose';

import { UploadedFile } from '../classes/UploadedFile';

export const UploadedFileModel = getModelForClass(UploadedFile);
