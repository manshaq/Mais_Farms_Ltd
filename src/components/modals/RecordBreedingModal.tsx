import React, { useState } from 'react';
import { MaisDatabaseState } from '../../types/mais';
import { SelectWithCustom } from '../SelectWithCustom';
import { ModalDialogShell } from './ModalDialogShell';

interface RecordBreedingModalProps {
  db: MaisDatabaseState;
  preselectedAnimalId?: string | null;
  onClose: () => void;
  onRecordBreeding: (animalId: string, payload: any) => Promise<void>;
  onRecordCalving: (payload: any) => Promise<void>;
}

export const RecordBreedingModal: React.FC<RecordBreedingModalProps> = ({
  db,
  preselectedAnimalId,
  onClose,
  onRecordBreeding,
  onRecordCalving,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [breedAnimalId, setBreedAnimalId] = useState(
    preselectedAnimalId || db.animals.find((a) => a.sex === 'Female')?.id || ''
  );
  const [breedingSubMode, setBreedingSubMode] = useState<'insemination' | 'calving'>('insemination');
  const [heatDate, setHeatDate] = useState(todayStr);
  const [aiDate, setAiDate] = useState(todayStr);
  const [sireStraw, setSireStraw] = useState('');
  const [sireBreed, setSireBreed] = useState('Holstein Friesian');
  const [pregCheckDate, setPregCheckDate] = useState('');
  const [pregCheckMethod, setPregCheckMethod] = useState('Ultrasound');
  const [pregResult, setPregResult] = useState('Pending');
  const [aiCost, setAiCost] = useState('15000');

  // Calving state
  const [calvingOutcome, setCalvingOutcome] = useState('Live Single');
  const [calvingAssistance, setCalvingAssistance] = useState('None');
  const [calfTagInput, setCalfTagInput] = useState('');
  const [calfNameInput, setCalfNameInput] = useState('');
  const [calfSexInput, setCalfSexInput] = useState('Female');
  const [calfBirthWeight, setCalfBirthWeight] = useState('');

  const existingBreeds = Array.from(
    new Set([
      'Holstein Friesian',
      'Friesian-Bunaji Cross',
      'Sokoto Gudali',
      'White Fulani (Bunaji)',
      'Brahman',
      'Jersey',
      ...db.animals.map((a) => a.breed).filter(Boolean),
    ])
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!breedAnimalId) {
      setErrorMsg('Please register and select a female animal first.');
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);
    try {
      if (breedingSubMode === 'insemination') {
        await onRecordBreeding(breedAnimalId, {
          heatDate,
          inseminationDate: aiDate,
          sireIdOrStraw: sireStraw,
          sireBreed,
          pregnancyCheckDate: pregCheckDate || null,
          pregnancyCheckMethod: pregCheckMethod,
          pregnancyResult: pregResult,
          costNgn: Number(aiCost || 0),
        });
      } else {
        await onRecordCalving({
          damId: breedAnimalId,
          calvingDate: todayStr,
          outcome: calvingOutcome,
          assistanceRequired: calvingAssistance,
          calfTag: calfTagInput,
          calfName: calfNameInput,
          calfSex: calfSexInput,
          birthWeightKg: calfBirthWeight ? Number(calfBirthWeight) : null,
        });
      }
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to record breeding or calving.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalDialogShell
      title="Breeding & Calving Record"
      errorMsg={errorMsg}
      submitting={submitting}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <div className="space-y-4">
        {db.animals.length === 0 ? (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
            No animals registered yet. Please register a female animal first.
          </div>
        ) : (
          <>
            <div className="flex gap-2 border-b border-slate-200 pb-3">
              <button
                type="button"
                onClick={() => setBreedingSubMode('insemination')}
                className={`px-3 py-1.5 rounded-lg font-semibold ${
                  breedingSubMode === 'insemination'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                Insemination / Pregnancy Check
              </button>
              <button
                type="button"
                onClick={() => setBreedingSubMode('calving')}
                className={`px-3 py-1.5 rounded-lg font-semibold ${
                  breedingSubMode === 'calving'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                Record Calving &amp; Register Calf
              </button>
            </div>

            {breedingSubMode === 'insemination' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Dam (Cow / Heifer) <span className="text-emerald-700">*</span>
                  </label>
                  <select
                    value={breedAnimalId}
                    onChange={(e) => setBreedAnimalId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
                  >
                    {db.animals
                      .filter((a) => a.sex === 'Female')
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.currentTag} — {a.name} ({a.type})
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Insemination / Service Date <span className="text-emerald-700">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={aiDate}
                    onChange={(e) => {
                      setAiDate(e.target.value);
                      setHeatDate(e.target.value);
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Sire / Semen Straw ID <span className="text-emerald-700">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={sireStraw}
                    onChange={(e) => setSireStraw(e.target.value)}
                    placeholder="Enter bull tag or straw code"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Sire Breed <span className="text-emerald-700">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    list="sire-breed-suggestions"
                    value={sireBreed}
                    onChange={(e) => setSireBreed(e.target.value)}
                    placeholder="e.g. Holstein Friesian, Sokoto Gudali..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                  <datalist id="sire-breed-suggestions">
                    {existingBreeds.map((b) => (
                      <option key={b} value={b} />
                    ))}
                  </datalist>
                </div>
                <SelectWithCustom
                  label="Pregnancy Check Method"
                  value={pregCheckMethod}
                  onChange={(v) => setPregCheckMethod(v)}
                  options={['Ultrasound', 'Rectal Palpation', 'Blood Test', 'Pending']}
                  placeholder="Type custom check method..."
                />
                <SelectWithCustom
                  label="Pregnancy Result"
                  value={pregResult}
                  onChange={(v) => setPregResult(v)}
                  options={['Pending', 'Confirmed Pregnant', 'Open / Not Pregnant']}
                  placeholder="Type custom result..."
                />
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Next Pregnancy Check Date
                  </label>
                  <input
                    type="date"
                    value={pregCheckDate}
                    onChange={(e) => setPregCheckDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    AI / Service Cost (NGN)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={aiCost}
                    onChange={(e) => setAiCost(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Mother (Dam) <span className="text-emerald-700">*</span>
                  </label>
                  <select
                    value={breedAnimalId}
                    onChange={(e) => setBreedAnimalId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
                  >
                    {db.animals
                      .filter((a) => a.sex === 'Female')
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.currentTag} — {a.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Newborn Calf Tag Number <span className="text-emerald-700">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={calfTagInput}
                    onChange={(e) => setCalfTagInput(e.target.value)}
                    placeholder="Enter unique calf ear tag"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Newborn Calf Name <span className="text-emerald-700">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={calfNameInput}
                    onChange={(e) => setCalfNameInput(e.target.value)}
                    placeholder="Enter calf name"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Calf Gender <span className="text-emerald-700">*</span>
                  </label>
                  <select
                    required
                    value={calfSexInput}
                    onChange={(e) => setCalfSexInput(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                  </select>
                </div>
                <SelectWithCustom
                  label="Calving Outcome"
                  value={calvingOutcome}
                  onChange={(v) => setCalvingOutcome(v)}
                  options={['Live Single', 'Live Twins', 'Assisted Live', 'Stillborn']}
                  placeholder="Type custom calving outcome..."
                />
                <SelectWithCustom
                  label="Assistance Required"
                  value={calvingAssistance}
                  onChange={(v) => setCalvingAssistance(v)}
                  options={['None', 'Minor Pull', 'Veterinary Intervention', 'Caesarean']}
                  placeholder="Type custom assistance level..."
                />
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Birth Weight (kg)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={calfBirthWeight}
                    onChange={(e) => setCalfBirthWeight(e.target.value)}
                    placeholder="Optional birth weight in kg"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </ModalDialogShell>
  );
};
