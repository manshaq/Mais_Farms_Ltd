import React, { useState } from 'react';
import { MaisDatabaseState } from '../../types/mais';
import { SelectWithCustom } from '../SelectWithCustom';
import { ModalDialogShell } from './ModalDialogShell';

interface RecordWeightModalProps {
  db: MaisDatabaseState;
  preselectedAnimalId?: string | null;
  onClose: () => void;
  onRecordWeight: (animalId: string, payload: any) => Promise<void>;
}

export const RecordWeightModal: React.FC<RecordWeightModalProps> = ({
  db,
  preselectedAnimalId,
  onClose,
  onRecordWeight,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [weightAnimalId, setWeightAnimalId] = useState(
    preselectedAnimalId || db.animals[0]?.id || ''
  );
  const [weightDate, setWeightDate] = useState(todayStr);
  const [weightKg, setWeightKg] = useState('');
  const [weightStage, setWeightStage] = useState('Routine');
  const [bcsScore, setBcsScore] = useState('3.0');
  const [weightNotes, setWeightNotes] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!weightAnimalId) {
      setErrorMsg('Please register and select an animal first.');
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await onRecordWeight(weightAnimalId, {
        measurementDate: weightDate,
        weightKg: Number(weightKg),
        bodyConditionScore: Number(bcsScore),
        stage: weightStage,
        notes: weightNotes,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to record weight measurement.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalDialogShell
      title="Record Live Weight & ADG"
      errorMsg={errorMsg}
      submitting={submitting}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {db.animals.length === 0 ? (
          <div className="md:col-span-2 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
            No animals registered yet. Please register an animal first before logging weights.
          </div>
        ) : (
          <>
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Select Animal <span className="text-emerald-700">*</span>
              </label>
              <select
                value={weightAnimalId}
                onChange={(e) => setWeightAnimalId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
              >
                {db.animals.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.currentTag} — {a.name} ({a.type})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Measurement Date <span className="text-emerald-700">*</span>
              </label>
              <input
                type="date"
                required
                value={weightDate}
                onChange={(e) => setWeightDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Live Weight (kg) <span className="text-emerald-700">*</span>
              </label>
              <input
                type="number"
                step="0.1"
                min="10"
                required
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder="Enter weight in kg"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <SelectWithCustom
              label="Measurement Stage"
              required
              value={weightStage}
              onChange={(v) => setWeightStage(v)}
              options={['Birth', 'Weaning', 'Yearling', 'Pre-Breeding', 'Routine', 'Market Check']}
              placeholder="Type custom growth stage..."
            />
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Body Condition Score (1.0 - 5.0)
              </label>
              <input
                type="number"
                step="0.25"
                min="1"
                max="5"
                value={bcsScore}
                onChange={(e) => setBcsScore(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Notes</label>
              <input
                type="text"
                value={weightNotes}
                onChange={(e) => setWeightNotes(e.target.value)}
                placeholder="Optional scale or growth notes"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          </>
        )}
      </div>
    </ModalDialogShell>
  );
};
