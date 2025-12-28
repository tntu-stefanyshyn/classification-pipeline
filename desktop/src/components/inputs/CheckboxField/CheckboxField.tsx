import type { FC } from 'react';
import type { CheckboxFieldProps } from './CheckboxField.types';

const CheckboxField: FC<CheckboxFieldProps> = ({
  label,
  checked,
  onChange,
  id,
  name,
  disabled,
}) => {
  const inputId = id ?? name ?? label;

  return (
    <div className="form-group checkbox">
      <input
        id={inputId}
        name={name}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />
      <label htmlFor={inputId}>{label}</label>
    </div>
  );
};

export default CheckboxField;
