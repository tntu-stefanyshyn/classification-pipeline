import { randomUUID } from 'crypto';
import { UploadedFile } from '../classes/UploadedFile';

type CreateFileInput = {
  filename: string;
  sizeMb: number;
  status?: string;
};

export class FileStore {
  private items: UploadedFile[] = [
    {
      id: 'file-1',
      filename: 'microscopy-scan.tiff',
      sizeMb: 248,
      status: 'processed',
      uploadedAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
    },
    {
      id: 'file-2',
      filename: 'cell-growth.csv',
      sizeMb: 32,
      status: 'queued',
      uploadedAt: new Date(Date.now() - 1000 * 60 * 60 * 6),
    },
    {
      id: 'file-3',
      filename: 'report-draft.pdf',
      sizeMb: 12,
      status: 'ready',
      uploadedAt: new Date(Date.now() - 1000 * 60 * 60 * 22),
    },
  ];

  list(): UploadedFile[] {
    return this.items;
  }

  create(input: CreateFileInput): UploadedFile {
    const filename = input.filename.trim();
    if (!filename) throw new Error('Filename is required');
    if (input.sizeMb <= 0) throw new Error('sizeMb must be positive');

    const file: UploadedFile = {
      id: randomUUID(),
      filename,
      sizeMb: input.sizeMb,
      status: input.status?.trim() || 'uploaded',
      uploadedAt: new Date(),
    };

    this.items.unshift(file);
    return file;
  }

  remove(id: string): UploadedFile {
    const index = this.items.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new Error('File not found');
    }
    const [removed] = this.items.splice(index, 1);
    return removed;
  }
}

export const fileStore = new FileStore();
