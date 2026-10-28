import React, { useState } from 'react';
import {
  AnimalSex,
  AnimalType,
  AcquisitionType,
  MaisDatabaseState,
} from '../../types/mais';
import { SelectWithCustom } from '../SelectWithCustom';
import { ModalDialogShell } from './ModalDialogShell';

interface RegisterAnimalModalProps {
  db: MaisDatabaseState;
  onClose: () => void;
  onRegisterAnimal: (payload: any) => Promise<void>;
}

export const RegisterAnimalModal: React.FC<RegisterAnimalModalProps> = ({
  db,
  onClose,
  onRegisterAnimal,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [tagNumber, setTagNumber] = useState('');
  const [animalName, setAnimalName] = useState('');
  const [animalType, setAnimalType] = useState<AnimalType>('Cow');
  const [sex, setSex] = useState<AnimalSex>('Female');
  const [breed, setBreed] = useState('Friesian-Bunaji Cross');
  const [dob, setDob] = useState(todayStr);
  const [acqType, setAcqType] = useState<AcquisitionType>('Purchased');
  const [sourceDetails, setSourceDetails] = useState('');
  const [acqDate, setAcqDate] = useState(todayStr);
  const [purchasePrice, setPurchasePrice] = useState('');
  const [damId, setDamId] = useState('');
  const [sireId, setSireId] = useState('');
  const [herdGroup, setHerdGroup] = useState('Lactating Cows');
  const [location, setLocation] = useState('North Dairy Barn A');
  const [characteristics, setCharacteristics] = useState('');
  const [initialWeightKg, setInitialWeightKg] = useState('');

  const existingTypes = Array.from(
    new Set(['Cow', 'Bull', 'Heifer', 'Calf', 'Steer', 'Yearling', ...db.animals.map((a) => a.type).filter(Boolean)])
  );

  const existingBreeds = Array.from(
    new Set([
      'Friesian-Bunaji Cross',
      'Holstein Friesian',
      'Sokoto Gudali',
      'White Fulani (Bunaji)',
      'Red Bororo',
      'Brahman',
      'Jersey',
      'Girolando',
      ...db.animals.map((a) => a.breed).filter(Boolean),
    ])
  );

  const existingGroups = Array.from(
    new Set([
      'Lactating Cows',
      'Dry & Pregnant Cows',
      'Growing Heifers',
      'Calves & Weaners',
      'Breeding Bulls',
      ...db.animals.map((a) => a.herdGroup).filter(Boolean),
    ])
  );

  const existingLocations = Array.from(
    new Set([
      'North Dairy Barn A',
      'Maternity & Dry Paddock B',
      'Heifer Pen C',
      'Isolation / Vet Stall',
      'Pasture Zone 1',
      ...db.animals.map((a) => a.location).filter(Boolean),
    ])
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await onRegisterAnimal({
        tagNumber,
        name: animalName,
        type: animalType,
        sex,
        breed,
        dateOfBirth: dob,
        acquisitionType: acqType,
        sourceDetails,
        acquisitionDate: acqDate,
        purchasePrice: acqType === 'Purchased' && purchasePrice ? Number(purchasePrice) : null,
        damId: damId || null,
        sireId: sireId || null,
        herdGroup,
        location,
        identifyingCharacteristics: characteristics,
        initialWeightKg: initialWeightKg ? Number(initialWeightKg) : null,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to register animal.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalDialogShell
      title="Register New Livestock"
      errorMsg={errorMsg}
      submitting={submitting}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block font-semibold text-slate-700 mb-1.5">
            Visible Tag Number <span className="text-emerald-700">*</span>
          </label>
          <input
            type="text"
            required
            value={tagNumber}
            onChange={(e) => setTagNumber(e.target.value)}
            placeholder="Enter unique ear tag (e.g. TAG-001)"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase"
          />
        </div>
        <div>
          <label className="block font-semibold text-slate-700 mb-1.5">
            Animal Name / Alias <span className="text-emerald-700">*</span>
          </label>
          <input
            type="text"
            required
            value={animalName}
            onChange={(e) => setAnimalName(e.target.value)}
            placeholder="Enter animal name or label"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
          />
        </div>

        <div>
          <label className="block font-semibold text-slate-700 mb-1.5">
            Animal Type <span className="text-emerald-700">*</span>
          </label>
          <input
            type="text"
            required
            list="animal-type-suggestions"
            value={animalType}
            onChange={(e) => setAnimalType(e.target.value)}
            placeholder="e.g. Cow, Bull, Heifer, Calf..."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
          />
          <datalist id="animal-type-suggestions">
            {existingTypes.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="block font-semibold text-slate-700 mb-1.5">
            Gender <span className="text-emerald-700">*</span>
          </label>
          <select
            required
            value={sex}
            onChange={(e) => setSex(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
          >
            <option value="Female">Female</option>
            <option value="Male">Male</option>
          </select>
        </div>

        <div>
          <label className="block font-semibold text-slate-700 mb-1.5">
            Breed <span className="text-emerald-700">*</span>
          </label>
          <input
            type="text"
            required
            list="breed-suggestions"
            value={breed}
            onChange={(e) => setBreed(e.target.value)}
            placeholder="e.g. White Fulani, Sokoto Gudali, Friesian..."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
          />
          <datalist id="breed-suggestions">
            {existingBreeds.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="block font-semibold text-slate-700 mb-1.5">
            Date of Birth <span className="text-emerald-700">*</span>
          </label>
          <input
            type="date"
            required
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
          />
        </div>

        <SelectWithCustom
          label="Acquisition Method"
          required
          value={acqType}
          onChange={(v) => setAcqType(v)}
          options={['Purchased', 'Born on Farm', 'Transferred', 'Donated / Grant']}
          placeholder="Type custom acquisition method..."
        />

        <div>
          <label className="block font-semibold text-slate-700 mb-1.5">
            Date Acquired <span className="text-emerald-700">*</span>
          </label>
          <input
            type="date"
            required
            value={acqDate}
            onChange={(e) => setAcqDate(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
          />
        </div>

        {acqType !== 'Born on Farm' && (
          <>
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Purchase / Valuation Cost (NGN)
              </label>
              <input
                type="number"
                min="0"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="Optional cost in NGN"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Vendor / Source Details
              </label>
              <input
                type="text"
                value={sourceDetails}
                onChange={(e) => setSourceDetails(e.target.value)}
                placeholder="Type seller, ranch, or origin"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          </>
        )}

        <div>
          <label className="block font-semibold text-slate-700 mb-1.5">
            Dam (Mother) — Optional
          </label>
          <select
            value={damId}
            onChange={(e) => setDamId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
          >
            <option value="">None / External Dam</option>
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
            Sire / Semen Straw ID — Optional
          </label>
          <input
            type="text"
            value={sireId}
            onChange={(e) => setSireId(e.target.value)}
            placeholder="Type bull tag or semen straw ID"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
          />
        </div>

        <div>
          <label className="block font-semibold text-slate-700 mb-1.5">
            Herd Group <span className="text-emerald-700">*</span>
          </label>
          <input
            type="text"
            required
            list="herd-group-suggestions"
            value={herdGroup}
            onChange={(e) => setHerdGroup(e.target.value)}
            placeholder="e.g. Lactating Cows, Growing Heifers..."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
          />
          <datalist id="herd-group-suggestions">
            {existingGroups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="block font-semibold text-slate-700 mb-1.5">
            Location / Barn / Paddock <span className="text-emerald-700">*</span>
          </label>
          <input
            type="text"
            required
            list="location-suggestions"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. North Dairy Barn A, Pasture Zone 1..."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
          />
          <datalist id="location-suggestions">
            {existingLocations.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="block font-semibold text-slate-700 mb-1.5">
            Initial Weight (kg) — Optional
          </label>
          <input
            type="number"
            step="0.1"
            value={initialWeightKg}
            onChange={(e) => setInitialWeightKg(e.target.value)}
            placeholder="Baseline weight in kg"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
          />
        </div>

        <div>
          <label className="block font-semibold text-slate-700 mb-1.5">
            Coat Markings & Characteristics
          </label>
          <input
            type="text"
            value={characteristics}
            onChange={(e) => setCharacteristics(e.target.value)}
            placeholder="Physical markings or notes"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg"
          />
        </div>
      </div>
    </ModalDialogShell>
  );
};
