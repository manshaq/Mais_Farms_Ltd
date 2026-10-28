import React, { useState } from 'react';
import {
  HealthSeverity,
  MaisDatabaseState,
} from '../../types/mais';
import { SelectWithCustom } from '../SelectWithCustom';
import { ModalDialogShell } from './ModalDialogShell';

interface RecordTreatmentModalProps {
  db: MaisDatabaseState;
  preselectedAnimalId?: string | null;
  onClose: () => void;
  onCreateHealthEpisode: (animalId: string, payload: any) => Promise<{ episode: { id: string } }>;
  onRecordTreatment: (episodeId: string, payload: any) => Promise<void>;
}

export const RecordTreatmentModal: React.FC<RecordTreatmentModalProps> = ({
  db,
  preselectedAnimalId,
  onClose,
  onCreateHealthEpisode,
  onRecordTreatment,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [treatAnimalId, setTreatAnimalId] = useState(
    preselectedAnimalId || db.animals[0]?.id || ''
  );
  const [episodeMode, setEpisodeMode] = useState<'new' | 'existing'>('new');
  const [existingEpisodeId, setExistingEpisodeId] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [diagnosisCat, setDiagnosisCat] = useState('Mastitis / Udder');
  const [severity, setSeverity] = useState<HealthSeverity>('Moderate');
  const [medicine, setMedicine] = useState('');
  const [dosage, setDosage] = useState('');
  const [route, setRoute] = useState('Intramuscular (IM)');
  const [durationDays, setDurationDays] = useState('3');
  const [withdrawalMilkDays, setWithdrawalMilkDays] = useState('0');
  const [withdrawalMeatDays, setWithdrawalMeatDays] = useState('0');
  const [veterinarian, setVeterinarian] = useState(db.users[0]?.fullName || 'Dr. Bello Aliyu');
  const [medicineCost, setMedicineCost] = useState('');
  const [consultationCost, setConsultationCost] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [treatmentOutcome, setTreatmentOutcome] = useState('Pending Follow-up');

  const animalOpenEpisodes = db.healthEpisodes.filter(
    (e) => e.animalId === treatAnimalId && e.status === 'Open'
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!treatAnimalId) {
      setErrorMsg('Please register and select an animal first.');
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);
    try {
      let targetEpisodeId = existingEpisodeId;
      if (episodeMode === 'new' || !targetEpisodeId) {
        const epRes = await onCreateHealthEpisode(treatAnimalId, {
          reportedDate: todayStr,
          symptoms,
          diagnosis,
          diagnosisCategory: diagnosisCat,
          severity,
          veterinarian,
        });
        targetEpisodeId = epRes.episode.id;
      }
      await onRecordTreatment(targetEpisodeId, {
        treatmentDate: todayStr,
        medicine,
        dosage,
        route,
        durationDays: Number(durationDays || 1),
        withdrawalMilkDays: Number(withdrawalMilkDays || 0),
        withdrawalMeatDays: Number(withdrawalMeatDays || 0),
        veterinarian,
        medicineCost: Number(medicineCost || 0),
        consultationCost: Number(consultationCost || 0),
        followUpDate: followUpDate || null,
        outcome: treatmentOutcome,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to record veterinary treatment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalDialogShell
      title="Record Veterinary Treatment"
      errorMsg={errorMsg}
      submitting={submitting}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <div className="space-y-4">
        {db.animals.length === 0 ? (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
            No animals registered yet. Please register an animal first before logging treatments.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Select Animal <span className="text-emerald-700">*</span>
                </label>
                <select
                  value={treatAnimalId}
                  onChange={(e) => setTreatAnimalId(e.target.value)}
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
                  Health Episode Mode
                </label>
                <select
                  value={episodeMode}
                  onChange={(e) => setEpisodeMode(e.target.value as 'new' | 'existing')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="new">Create New Illness Case</option>
                  {animalOpenEpisodes.length > 0 && (
                    <option value="existing">
                      Attach to Open Case ({animalOpenEpisodes.length})
                    </option>
                  )}
                </select>
              </div>
            </div>

            {episodeMode === 'existing' && animalOpenEpisodes.length > 0 ? (
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Select Open Health Case
                </label>
                <select
                  value={existingEpisodeId || animalOpenEpisodes[0]?.id}
                  onChange={(e) => setExistingEpisodeId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {animalOpenEpisodes.map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      {ep.id}: {ep.diagnosis} (Reported {ep.reportedDate})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Observed Symptoms <span className="text-emerald-700">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={symptoms}
                    onChange={(e) => setSymptoms(e.target.value)}
                    placeholder="Type clinical symptoms observed"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Clinical Diagnosis <span className="text-emerald-700">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                    placeholder="Type diagnosis"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <SelectWithCustom
                  label="Diagnosis Category"
                  required
                  value={diagnosisCat}
                  onChange={(v) => setDiagnosisCat(v)}
                  options={[
                    'Mastitis / Udder',
                    'Tick-Borne / Hemoparasite',
                    'Respiratory',
                    'Gastrointestinal / Parasitic',
                    'Locomotion / Hoof',
                    'Reproductive / Post-Partum',
                    'Metabolic / Nutritional',
                  ]}
                  placeholder="Type custom diagnosis category..."
                />
                <SelectWithCustom
                  label="Severity"
                  required
                  value={severity}
                  onChange={(v) => setSeverity(v)}
                  options={['Low', 'Moderate', 'High', 'Critical']}
                  placeholder="Type custom severity..."
                />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Medicine Administered <span className="text-emerald-700">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={medicine}
                  onChange={(e) => setMedicine(e.target.value)}
                  placeholder="Type medication name"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Dosage <span className="text-emerald-700">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={dosage}
                  onChange={(e) => setDosage(e.target.value)}
                  placeholder="e.g. 20 ml (1 ml / 10 kg)"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>

              <SelectWithCustom
                label="Route of Administration"
                required
                value={route}
                onChange={(v) => setRoute(v)}
                options={[
                  'Intramuscular (IM)',
                  'Subcutaneous (SC)',
                  'Intravenous (IV)',
                  'Intramammary',
                  'Oral',
                  'Topical',
                ]}
                placeholder="Type custom route..."
              />

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Veterinarian / Clinician
                </label>
                <input
                  type="text"
                  value={veterinarian}
                  onChange={(e) => setVeterinarian(e.target.value)}
                  placeholder="Veterinarian name"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Medicine Cost (NGN)
                </label>
                <input
                  type="number"
                  min="0"
                  value={medicineCost}
                  onChange={(e) => setMedicineCost(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Consultation Cost (NGN)
                </label>
                <input
                  type="number"
                  min="0"
                  value={consultationCost}
                  onChange={(e) => setConsultationCost(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Milk Withdrawal (Days)
                </label>
                <input
                  type="number"
                  min="0"
                  value={withdrawalMilkDays}
                  onChange={(e) => setWithdrawalMilkDays(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Meat Withdrawal (Days)
                </label>
                <input
                  type="number"
                  min="0"
                  value={withdrawalMeatDays}
                  onChange={(e) => setWithdrawalMeatDays(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Follow-up Date (Optional)
                </label>
                <input
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <SelectWithCustom
                label="Treatment Outcome / Status"
                value={treatmentOutcome}
                onChange={(v) => setTreatmentOutcome(v)}
                options={['Pending Follow-up', 'Improved', 'Recovered', 'Relapsed', 'Referred']}
                placeholder="Type custom outcome..."
              />
            </div>
          </>
        )}
      </div>
    </ModalDialogShell>
  );
};
