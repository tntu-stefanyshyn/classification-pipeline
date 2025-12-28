import { useField } from 'formik';
import type { FC } from 'react';
import type { TextAreaFieldProps } from './TextAreaField.types';

const TextAreaField: FC<TextAreaFieldProps> = ({ name, label, placeholder, id, disabled }) => {
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
};

export default TextAreaField;
