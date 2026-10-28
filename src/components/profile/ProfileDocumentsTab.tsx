import React, { useState } from 'react';
import { Animal, AttachmentRecord } from '../../types/mais';
import { SelectWithCustom } from '../SelectWithCustom';

interface ProfileDocumentsTabProps {
  animal: Animal;
  attachments: AttachmentRecord[];
  canEdit: boolean;
  onUploadAttachment: (payload: {
    animalId: string;
    fileName: string;
    fileType: string;
    fileSizeKb: number;
    notes: string;
  }) => Promise<void>;
}

export const ProfileDocumentsTab: React.FC<ProfileDocumentsTabProps> = ({
  animal,
  attachments,
  canEdit,
  onUploadAttachment,
}) => {
  const [docName, setDocName] = useState('');
  const [docType, setDocType] = useState('Veterinary Report');
  const [docNotes, setDocNotes] = useState('');
  const [submittingDoc, setSubmittingDoc] = useState(false);

  const handleDocSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docName.trim()) return;
    setSubmittingDoc(true);
    try {
      await onUploadAttachment({
        animalId: animal.id,
        fileName: docName.trim(),
        fileType: docType,
        fileSizeKb: 380,
        notes: docNotes.trim(),
      });
      setDocName('');
      setDocNotes('');
    } finally {
      setSubmittingDoc(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="border border-slate-200/80 rounded-xl p-4 bg-white/80">
        <h3 className="text-sm font-bold text-slate-900 mb-3">
          Attached Files &amp; Certificates ({attachments.length})
        </h3>
        {attachments.length === 0 ? (
          <p className="text-xs text-slate-500">
            No files attached to {animal.currentTag} yet.
          </p>
        ) : (
          <div className="divide-y divide-slate-200 text-xs">
            {attachments.map((att) => (
              <div key={att.id} className="py-2.5 flex items-center justify-between gap-4">
                <div>
                  <p className="font-mono font-semibold text-slate-900">{att.fileName}</p>
                  <p className="text-slate-500 mt-0.5">
                    {att.fileType} · {att.fileSizeKb} KB · Uploaded {att.uploadedAt} by{' '}
                    {att.uploadedBy} · {att.notes}
                  </p>
                </div>
                <span className="font-mono text-slate-500">{att.id}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {canEdit && (
        <form
          onSubmit={handleDocSubmit}
          className="border border-slate-200/80 rounded-xl p-4 bg-white/80 space-y-3"
        >
          <h4 className="text-xs font-bold text-slate-900">Attach Supporting File</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Filename
              </label>
              <input
                type="text"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                placeholder="Enter document filename"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
              />
            </div>
            <SelectWithCustom
              label="Category"
              value={docType}
              onChange={(v) => setDocType(v)}
              options={[
                'Veterinary Report',
                'Invoice / Receipt',
                'Pedigree Certificate',
                'Lab Result',
                'Photo',
              ]}
              placeholder="Type custom file category..."
            />
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Notes
              </label>
              <input
                type="text"
                value={docNotes}
                onChange={(e) => setDocNotes(e.target.value)}
                placeholder="Optional document notes"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={submittingDoc}
            className="px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800"
          >
            {submittingDoc ? 'Attaching...' : 'Save File'}
          </button>
        </form>
      )}
    </div>
  );
};
