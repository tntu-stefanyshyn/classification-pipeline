import { useField } from 'formik';
import type { TextAreaFieldProps } from './TextAreaField.types';

export function TextAreaField({ name, label, placeholder, id, disabled }: TextAreaFieldProps) {
  const [field, meta] = useField(name);
  const hasError = Boolean(meta.touched && meta.error);
  const inputId = id ?? name;

  return (
    <div className="form-group">
      <label htmlFor={inputId}>{label}</label>
      <textarea
        {...field}
        id={inputId}
        placeholder={placeholder}
        disabled={disabled}
        className={hasError ? 'input-error' : ''}
      />
      <p className="error error-space">{hasError ? meta.error : '\u00A0'}</p>
    </div>
  );
}

export default TextAreaField;
