import { useFormikContext } from 'formik';
import type { SubmitButtonProps } from './SubmitButton.types';

export function SubmitButton({ label, loadingLabel }: SubmitButtonProps) {
  const { isSubmitting, isValid } = useFormikContext();

  return (
    <button className="btn primary btn-block" type="submit" disabled={!isValid || isSubmitting}>
      {isSubmitting ? (loadingLabel ?? label) : label}
    </button>
  );
}

export default SubmitButton;
