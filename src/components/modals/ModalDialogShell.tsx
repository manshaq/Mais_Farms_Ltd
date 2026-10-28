import React from 'react';
import { X, AlertCircle } from 'lucide-react';

interface ModalDialogShellProps {
  title: string;
  subtitle?: string;
  errorMsg: string | null;
  submitting: boolean;
  submitText?: string;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  children: React.ReactNode;
}

export const ModalDialogShell: React.FC<ModalDialogShellProps> = ({
  title,
  subtitle = 'Select any preset option or choose "Other (Type custom...)" to enter your own value.',
  errorMsg,
  submitting,
  submitText = 'Save Record',
  onClose,
  onSubmit,
  children,
}) => {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-sm p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-action-modal-title"
    >
      <div className="liquid-glass-modal rounded-2xl w-full max-w-2xl overflow-hidden my-8">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div>
            <h2 id="quick-action-modal-title" className="text-base font-bold text-slate-900">
              {title}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-200/60"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={onSubmit}
          className="p-6 space-y-4 text-xs max-h-[80vh] overflow-y-auto bg-white"
        >
          {errorMsg && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-800 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span className="font-medium">{errorMsg}</span>
            </div>
          )}

          {children}

          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="liquid-glass-btn-primary px-5 py-2 text-xs font-semibold rounded-xl disabled:opacity-50"
            >
              {submitting ? 'Saving Record...' : submitText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
