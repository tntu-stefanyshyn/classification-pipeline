import { useField } from 'formik';
import type { InputFieldProps } from './InputField.types';

export function InputField({
  name,
  label,
  type = 'text',
  placeholder,
  autoComplete,
  id,
  disabled,
}: InputFieldProps) {
  const [field, meta] = useField(name);
  const hasError = Boolean(meta.touched && meta.error);
  const inputId = id ?? name;

  return (
    <div className="form-group">
      <label htmlFor={inputId}>{label}</label>
      <input
        {...field}
        id={inputId}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        className={hasError ? 'input-error' : ''}
      />
      <p className="error error-space">{hasError ? meta.error : '\u00A0'}</p>
    </div>
  );
}

export default InputField;
