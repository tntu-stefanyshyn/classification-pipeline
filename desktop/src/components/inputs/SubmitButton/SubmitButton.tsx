import { useFormikContext } from 'formik';
import type { FC } from 'react';
import type { SubmitButtonProps } from './SubmitButton.types';

const SubmitButton: FC<SubmitButtonProps> = ({ label, loadingLabel }) => {
  const { isSubmitting, isValid } = useFormikContext();

  return (
    <button className="btn primary btn-block" type="submit" disabled={!isValid || isSubmitting}>
      {isSubmitting ? (loadingLabel ?? label) : label}
    </button>
  );
};

export default SubmitButton;
