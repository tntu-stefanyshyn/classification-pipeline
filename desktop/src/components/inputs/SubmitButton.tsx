type SubmitButtonProps = {
  label: string;
  loadingLabel?: string;
  loading?: boolean;
  disabled?: boolean;
};

export function SubmitButton({
  label,
  loadingLabel,
  loading = false,
  disabled = false,
}: SubmitButtonProps) {
  return (
    <button className="btn primary btn-block" type="submit" disabled={disabled || loading}>
      {loading ? (loadingLabel ?? label) : label}
    </button>
  );
}

export default SubmitButton;
