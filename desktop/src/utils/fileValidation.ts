const csvMimeTypes = new Set(['text/csv', 'application/vnd.ms-excel', 'text/plain']);

export const isCsvFilename = (filename: string) => filename.trim().toLowerCase().endsWith('.csv');

export const isCsvFile = (file: File) => {
  if (!isCsvFilename(file.name)) return false;
  if (!file.type) return true;
  return csvMimeTypes.has(file.type);
};
