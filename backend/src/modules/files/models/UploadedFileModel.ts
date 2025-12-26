import { getModelForClass } from '@typegoose/typegoose';

import { UploadedFile } from '../classes/UploadedFile';

export const uploadedFilesCollectionName = 'uploaded_files';

export const UploadedFileModel = getModelForClass(UploadedFile, {
  schemaOptions: { collection: uploadedFilesCollectionName },
});
