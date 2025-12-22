import { useFormikContext } from 'formik';

type SubmitButtonProps = {
  label: string;
  loadingLabel?: string;
};

export function SubmitButton({ label, loadingLabel }: SubmitButtonProps) {
  const { isSubmitting, isValid } = useFormikContext();

  return (
    <button className="btn primary btn-block" type="submit" disabled={!isValid || isSubmitting}>
      {isSubmitting ? (loadingLabel ?? label) : label}
    </button>
  );
}

export default SubmitButton;
