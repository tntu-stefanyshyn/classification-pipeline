import { useFormikContext } from 'formik';
import { Alert } from '../../ui/Alert/Alert';

export function FormError() {
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
}

export default FormError;
