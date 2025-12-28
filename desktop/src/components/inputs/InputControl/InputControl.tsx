import type { FC } from 'react';
import type { InputControlProps } from './InputControl.types';

const InputControl: FC<InputControlProps> = ({
  label,
  value,
  onChange,
  name,
  id,
  type = 'text',
  placeholder,
  autoComplete,
  min,
  max,
  step,
  disabled,
  required,
  error,
  onBlur,
}) => {
  const inputId = id ?? name ?? label;
  const hasError = Boolean(error);

  return (
    <div className="form-group">
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        autoComplete={autoComplete}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        required={required}
        className={hasError ? 'input-error' : ''}
      />
      <p className="error error-space">{hasError ? error : '\u00A0'}</p>
    </div>
  );
};

export default InputControl;
