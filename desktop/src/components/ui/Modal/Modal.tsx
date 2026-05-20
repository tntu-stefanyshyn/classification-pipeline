import { useEffect, type FC } from 'react';
import { createPortal } from 'react-dom';
import type { ModalProps } from './Modal.types';
import { useI18n } from '../../../i18n';

const Modal: FC<ModalProps> = ({ open, title, children, footer, className, onClose }) => {
  const { messages } = useI18n();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    if (open) {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className={className ? `modal ${className}` : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>{title ? <h3 className="modal-title">{title}</h3> : null}</div>
          <button
            className="modal-close"
            type="button"
            onClick={onClose}
            aria-label={messages.common.close}
          >
            ×
          </button>
        </header>

        <div className="modal-body">{children}</div>

        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body
  );
};

export default Modal;
