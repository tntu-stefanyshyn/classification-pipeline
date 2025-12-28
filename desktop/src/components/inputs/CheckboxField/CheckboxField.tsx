import type { CheckboxFieldProps } from './CheckboxField.types';

export function CheckboxField({
  label,
  checked,
  onChange,
  id,
  name,
  disabled,
}: CheckboxFieldProps) {
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
}

export default CheckboxField;
