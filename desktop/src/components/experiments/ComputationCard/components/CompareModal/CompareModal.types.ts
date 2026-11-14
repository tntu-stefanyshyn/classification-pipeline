export interface CompareModalProps {
  /** Exactly two runs; the caller mounts the modal only then. */
  ids: string[];
  onClose: () => void;
}
