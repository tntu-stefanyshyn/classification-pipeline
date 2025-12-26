import { useFormikContext } from 'formik';

export function FormError() {
  const { errors } = useFormikContext<{ form: string }>();
  const error = errors.form?.trim();

  if (error) {
    return (
      <div className="alert error-alert" style={{ marginBottom: '0.75rem' }}>
        {error}
      </div>
    );
  }
  return null;
}

export default FormError;
