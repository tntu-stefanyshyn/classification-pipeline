import { useFormikContext } from 'formik';
import type { FC } from 'react';
import { Alert } from '../../ui/Alert';

const FormError: FC = () => {
  const { errors } = useFormikContext<{ form: string }>();
  const error = errors.form?.trim();

  if (error) {
    return (
      <Alert variant="error" className="form-alert">
        {error}
      </Alert>
    );
  }
  return null;
};

export default FormError;
