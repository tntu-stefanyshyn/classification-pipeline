import { useField } from 'formik';
import type { TextAreaFieldProps } from './TextAreaField.types';

export function TextAreaField({ name, label, placeholder }: TextAreaFieldProps) {
  const [field, meta] = useField(name);
  const hasError = Boolean(meta.touched && meta.error);

  return (
    <div className="form-group">
      <label htmlFor={name}>{label}</label>
      <textarea
        {...field}
        id={name}
        placeholder={placeholder}
        className={hasError ? 'input-error' : ''}
      />
      <p className="error error-space">{hasError ? meta.error : '\u00A0'}</p>
    </div>
  );
}

export default TextAreaField;
