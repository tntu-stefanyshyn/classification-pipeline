import { forwardRef } from 'react';
import type { FileInputProps } from './FileInput.types';

const FileInput = forwardRef<HTMLInputElement, FileInputProps>(
  ({ accept, onChange, multiple, id, name, disabled, className, hidden = true }, ref) => (
    <input
      ref={ref}
      id={id}
      name={name}
      type="file"
      accept={accept}
      onChange={onChange}
      multiple={multiple}
      disabled={disabled}
      className={className}
      style={hidden ? { display: 'none' } : undefined}
    />
  )
);

FileInput.displayName = 'FileInput';

export default FileInput;
