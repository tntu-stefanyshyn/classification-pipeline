import { useField } from 'formik';
import type { TextInputFieldProps } from './TextInputField.types';

export function TextInputField({ name, label, placeholder, type = 'text' }: TextInputFieldProps) {
  const [field, meta] = useField(name);
  const hasError = Boolean(meta.touched && meta.error);

  return (
    <div className="form-group">
      <label htmlFor={name}>{label}</label>
      <input
        {...field}
        id={name}
        type={type}
        placeholder={placeholder}
        className={hasError ? 'input-error' : ''}
      />
      <p className="error error-space">{hasError ? meta.error : '\u00A0'}</p>
    </div>
  );
}

export default TextInputField;
