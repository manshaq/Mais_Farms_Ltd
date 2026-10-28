import React, { useState, useEffect } from 'react';
import {
  X,
  Tag,
  History,
  Stethoscope,
  Wheat,
  HeartHandshake,
  Scale,
  Receipt,
  FileText,
  AlertCircle,
} from 'lucide-react';
import {
  Animal,
  AnimalStatus,
  MaisDatabaseState,
  StaffUser,
} from '../types/mais';
import {
  AnimalCostBreakdown,
  calculateWeightHistoryWithADG,
  canPerformAction,
} from '../domain/farmRules';
import { AnimalHistoryResponse, maisApiClient } from '../services/apiClient';
import { SelectWithCustom } from './SelectWithCustom';
import { ProfileOverviewTab } from './profile/ProfileOverviewTab';
import { ProfileTimelineTab } from './profile/ProfileTimelineTab';
import { ProfileHealthTab } from './profile/ProfileHealthTab';
import { ProfileFeedTab } from './profile/ProfileFeedTab';
import { ProfileBreedingTab } from './profile/ProfileBreedingTab';
import { ProfileWeightTab } from './profile/ProfileWeightTab';
import { ProfileExpensesTab } from './profile/ProfileExpensesTab';
import { ProfileDocumentsTab } from './profile/ProfileDocumentsTab';

interface AnimalProfileModalProps {
  animal: Animal;
  db: MaisDatabaseState;
  costBreakdown: AnimalCostBreakdown;
  currentUser: StaffUser;
  historicalTagMatched?: string | null;
  onClose: () => void;
  onSelectAnimalById: (animalId: string) => void;
  onReplaceTag: (animalId: string, newTag: string, reason: string) => Promise<void>;
  onChangeStatus: (animalId: string, newStatus: AnimalStatus, reason: string) => Promise<void>;
  onUpdateAnimal?: (animalId: string, payload: Partial<Animal>) => Promise<void>;
  onUploadAttachment: (payload: {
    animalId: string;
    fileName: string;
    fileType: string;
    fileSizeKb: number;
    notes: string;
  }) => Promise<void>;
  onOpenQuickAction: (
    actionType: 'treatment' | 'feed' | 'weight' | 'breeding' | 'expense',
    preselectedAnimalId: string
  ) => void;
}

type ProfileTab =
  | 'overview'
  | 'timeline'
  | 'health'
  | 'feed'
  | 'breeding'
  | 'weight'
  | 'expenses'
  | 'documents';

export const AnimalProfileModal: React.FC<AnimalProfileModalProps> = ({
  animal,
  db,
  costBreakdown: initialCostBreakdown,
  currentUser,
  historicalTagMatched,
  onClose,
  onSelectAnimalById,
  onReplaceTag,
  onChangeStatus,
  onUpdateAnimal,
  onUploadAttachment,
  onOpenQuickAction,
}) => {
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview');
  const [apiHistory, setApiHistory] = useState<AnimalHistoryResponse | null>(null);

  // Tag replacement form state
  const [showReplaceTagForm, setShowReplaceTagForm] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [replaceReasonInput, setReplaceReasonInput] = useState('');
  const [tagFormError, setTagFormError] = useState<string | null>(null);
  const [submittingTag, setSubmittingTag] = useState(false);

  // Status update form state
  const [showStatusForm, setShowStatusForm] = useState(false);
  const [newStatusInput, setNewStatusInput] = useState<AnimalStatus>(animal.status);
  const [statusReasonInput, setStatusReasonInput] = useState('');
  const [statusFormError, setStatusFormError] = useState<string | null>(null);
  const [submittingStatus, setSubmittingStatus] = useState(false);

  // Biodata edit form state
  const [showEditBiodataForm, setShowEditBiodataForm] = useState(false);
  const [editName, setEditName] = useState(animal.name);
  const [editType, setEditType] = useState(animal.type);
  const [editBreed, setEditBreed] = useState(animal.breed);
  const [editSex, setEditSex] = useState(animal.sex);
  const [editDob, setEditDob] = useState(animal.dateOfBirth);
  const [editLocation, setEditLocation] = useState(animal.location);
  const [editHerdGroup, setEditHerdGroup] = useState(animal.herdGroup);
  const [editDamTag, setEditDamTag] = useState(animal.damTag || '');
  const [editSireId, setEditSireId] = useState(animal.sireId || '');
  const [editCharacteristics, setEditCharacteristics] = useState(
    animal.identifyingCharacteristics || ''
  );
  const [editNotes, setEditNotes] = useState(animal.notes || '');
  const [biodataError, setBiodataError] = useState<string | null>(null);
  const [submittingBiodata, setSubmittingBiodata] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Reset per-animal UI state & fetch authoritative history from GET /api/animals/:id/history
  useEffect(() => {
    setNewStatusInput(animal.status);
    setShowReplaceTagForm(false);
    setShowStatusForm(false);
    setShowEditBiodataForm(false);
    setEditName(animal.name);
    setEditType(animal.type);
    setEditBreed(animal.breed);
    setEditSex(animal.sex);
    setEditDob(animal.dateOfBirth);
    setEditLocation(animal.location);
    setEditHerdGroup(animal.herdGroup);
    setEditDamTag(animal.damTag || '');
    setEditSireId(animal.sireId || '');
    setEditCharacteristics(animal.identifyingCharacteristics || '');
    setEditNotes(animal.notes || '');
    setBiodataError(null);
    setTagFormError(null);
    setStatusFormError(null);

    let cancelled = false;
    maisApiClient
      .getAnimalHistory(currentUser.id, animal.id)
      .then((res) => {
        if (!cancelled) {
          setApiHistory(res);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setApiHistory(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [animal, currentUser.id, db]);

  const canEdit = canPerformAction(currentUser.role, 'EDIT_ANIMALS');

  const identifiers =
    apiHistory?.identifiers ?? db.animalIdentifiers.filter((i) => i.animalId === animal.id);
  const retiredIdentifiers = identifiers.filter((i) => !i.isCurrent);
  const timeline =
    apiHistory?.timeline ??
    [...db.animalEvents.filter((e) => e.animalId === animal.id)].sort((a, b) =>
      b.eventDate.localeCompare(a.eventDate)
    );
  const healthEpisodes =
    apiHistory?.healthEpisodes ?? db.healthEpisodes.filter((h) => h.animalId === animal.id);
  const treatments =
    apiHistory?.treatments ?? db.treatments.filter((t) => t.animalId === animal.id);
  const vaccinations =
    apiHistory?.vaccinations ?? db.vaccinations.filter((v) => v.animalId === animal.id);
  const weightsWithAdg =
    apiHistory?.weights ??
    calculateWeightHistoryWithADG(db.weightRecords.filter((w) => w.animalId === animal.id));
  const breedingEvents =
    apiHistory?.breedingEvents ?? db.breedingEvents.filter((b) => b.animalId === animal.id);
  const calvingEvents =
    apiHistory?.calvingEvents ??
    db.calvingEvents.filter((c) => c.damId === animal.id || c.calfIds.includes(animal.id));
  const allAllocations =
    apiHistory?.allocations ?? db.expenseAllocations.filter((a) => a.animalId === animal.id);
  const feedAllocations = allAllocations.filter((a) => a.allocationCategory === 'Shared Feed');
  const attachments =
    apiHistory?.attachments ?? db.attachments.filter((att) => att.animalId === animal.id);
  const costBreakdown = apiHistory?.costBreakdown ?? initialCostBreakdown;

  const offspring = db.animals.filter(
    (a) => a.damId === animal.id || a.damTag === animal.currentTag
  );

  const latestWeight =
    weightsWithAdg.length > 0 ? weightsWithAdg[weightsWithAdg.length - 1] : null;

  // Build unified expense ledger for this animal (Purchase Price + Allocations) so rows match Lifetime Total Cost
  const expenseLedgerRows = [
    ...(costBreakdown.purchaseCostNgn > 0
      ? [
          {
            id: `PURCHASE-${animal.id}`,
            date: animal.acquisitionDate,
            category: 'Animal Acquisition',
            method: 'Direct Purchase 100%',
            description: `Acquisition of ${animal.breed} ${animal.type} (${animal.sourceDetails || 'Vendor'})`,
            amountNgn: costBreakdown.purchaseCostNgn,
          },
        ]
      : []),
    ...allAllocations.map((a) => ({
      id: a.id,
      date: a.allocationDate,
      category: a.allocationCategory,
      method: a.allocationMethod,
      description: a.notes,
      amountNgn: a.amountNgn,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const handleTagReplacementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTagFormError(null);
    if (!newTagInput.trim() || !replaceReasonInput.trim()) {
      setTagFormError('Both the new tag number and replacement reason are required.');
      return;
    }
    setSubmittingTag(true);
    try {
      await onReplaceTag(animal.id, newTagInput, replaceReasonInput);
      setShowReplaceTagForm(false);
      setNewTagInput('');
      setReplaceReasonInput('');
    } catch (err: any) {
      setTagFormError(err.message || 'Failed to replace tag.');
    } finally {
      setSubmittingTag(false);
    }
  };

  const handleStatusChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusFormError(null);
    if (!statusReasonInput.trim()) {
      setStatusFormError('Please provide a reason for the status change for the audit log.');
      return;
    }
    setSubmittingStatus(true);
    try {
      await onChangeStatus(animal.id, newStatusInput, statusReasonInput);
      setShowStatusForm(false);
      setStatusReasonInput('');
    } catch (err: any) {
      setStatusFormError(err.message || 'Failed to update status.');
    } finally {
      setSubmittingStatus(false);
    }
  };

  const handleBiodataSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateAnimal) return;
    setBiodataError(null);
    if (!editName.trim() || !editBreed.trim()) {
      setBiodataError('Animal name and breed are required.');
      return;
    }
    setSubmittingBiodata(true);
    try {
      await onUpdateAnimal(animal.id, {
        name: editName.trim(),
        type: editType,
        breed: editBreed.trim(),
        sex: editSex,
        dateOfBirth: editDob,
        location: editLocation.trim(),
        herdGroup: editHerdGroup.trim(),
        damTag: editDamTag.trim() ? editDamTag.trim() : null,
        sireId: editSireId.trim(),
        identifyingCharacteristics: editCharacteristics.trim(),
        notes: editNotes.trim(),
      });
      setShowEditBiodataForm(false);
    } catch (err: any) {
      setBiodataError(err.message || 'Failed to update animal biodata.');
    } finally {
      setSubmittingBiodata(false);
    }
  };

  const tabs: { id: ProfileTab; label: string; count?: number; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <Tag className="w-4 h-4 shrink-0" /> },
    {
      id: 'timeline',
      label: 'Timeline',
      count: timeline.length,
      icon: <History className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'health',
      label: 'Health',
      count: healthEpisodes.length + treatments.length + vaccinations.length,
      icon: <Stethoscope className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'feed',
      label: 'Feed',
      count: feedAllocations.length,
      icon: <Wheat className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'breeding',
      label: 'Breeding',
      count: breedingEvents.length + calvingEvents.length,
      icon: <HeartHandshake className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'weight',
      label: 'Weight',
      count: weightsWithAdg.length,
      icon: <Scale className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'expenses',
      label: 'Expenses',
      count: expenseLedgerRows.length,
      icon: <Receipt className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'documents',
      label: 'Files',
      count: attachments.length,
      icon: <FileText className="w-4 h-4 shrink-0" />,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 backdrop-blur-md p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="animal-profile-modal-title"
    >
      <div className="liquid-glass-modal rounded-2xl w-full max-w-6xl h-[88vh] max-h-[880px] flex flex-col overflow-hidden">
        {/* Historical Tag Resolution Alert Banner */}
        {historicalTagMatched && (
          <div className="shrink-0 bg-amber-500/15 border-b border-amber-600/20 px-6 py-2.5 flex items-center justify-between text-xs text-amber-950">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                Historical Tag Resolution: Searched retired tag{' '}
                <strong className="font-mono">{historicalTagMatched}</strong> resolved to permanent
                animal ID <strong className="font-mono">{animal.id}</strong> (Current Active Tag:{' '}
                <strong className="font-mono">{animal.currentTag}</strong>).
              </span>
            </div>
            <span className="font-mono text-amber-800 font-semibold shrink-0">
              One Animal · One Identity
            </span>
          </div>
        )}

        {/* Modal Top Header (shrink-0 prevents Flexbox compression) */}
        <div className="shrink-0 px-6 py-4 border-b border-slate-900/10 flex items-start justify-between gap-4 bg-white/75">
          <div className="flex items-start gap-4 min-w-0 flex-1">
            {/* Cattle Breed Emblem */}
            <div className="w-14 h-14 rounded-xl bg-emerald-950 text-emerald-100 flex flex-col items-center justify-center shrink-0 border border-emerald-700/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
              <svg
                className="w-7 h-7 text-emerald-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
              >
                <path d="M4 9c0-1.5 1-3 3-3h10c2 0 3 1.5 3 3v5c0 3-2.5 5-6 5h-4c-3.5 0-6-2-6-5V9z" />
                <path d="M2 6c1.5 0 3 1 3 3M22 6c-1.5 0-3 1-3 3M9 14h.01M15 14h.01" />
              </svg>
              <span className="text-[10px] font-mono tracking-tight text-emerald-300 mt-0.5">
                {animal.type}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-3">
                <h2
                  id="animal-profile-modal-title"
                  className="text-xl font-bold text-slate-900 font-mono tracking-tight"
                >
                  {animal.currentTag}
                </h2>
                <span className="text-base font-semibold text-slate-700">{animal.name}</span>
                <span className="text-xs font-mono text-slate-500">ID: {animal.id}</span>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                <span className="font-semibold text-slate-900">Status: {animal.status}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {animal.breed} ({animal.sex})
                </span>
                <span aria-hidden="true">·</span>
                <span>{animal.herdGroup}</span>
                <span aria-hidden="true">·</span>
                <span>{animal.location}</span>
                {retiredIdentifiers.length > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-amber-800 font-medium">
                      Old Tag: {retiredIdentifiers.map((r) => r.tagNumber).join(', ')}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canEdit && (
              <>
                {onUpdateAnimal && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditBiodataForm((v) => !v);
                      setShowReplaceTagForm(false);
                      setShowStatusForm(false);
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-xl liquid-glass-btn-secondary whitespace-nowrap"
                  >
                    Edit Biodata
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowReplaceTagForm((v) => !v);
                    setShowStatusForm(false);
                    setShowEditBiodataForm(false);
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-xl liquid-glass-btn-secondary whitespace-nowrap"
                >
                  Replace Tag
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowStatusForm((v) => !v);
                    setShowReplaceTagForm(false);
                    setShowEditBiodataForm(false);
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-xl liquid-glass-btn-secondary whitespace-nowrap"
                >
                  Update Status
                </button>
                <button
                  type="button"
                  onClick={() => onOpenQuickAction('treatment', animal.id)}
                  className="px-3 py-1.5 text-xs font-medium rounded-xl liquid-glass-btn-primary whitespace-nowrap"
                >
                  Record Treatment
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close animal profile"
              className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-200/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Inline Edit Biodata Drawer */}
        {showEditBiodataForm && (
          <form
            onSubmit={handleBiodataSubmit}
            className="shrink-0 px-6 py-4 bg-slate-100/95 border-b border-slate-200 space-y-3 text-xs"
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900">
                Edit Animal Biodata (Permanent ID {animal.id} & Tag {animal.currentTag} Preserved)
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Animal Name *</label>
                <input
                  type="text"
                  required
                  aria-label="Edit Animal Name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Type</label>
                <input
                  type="text"
                  aria-label="Edit Animal Type"
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Breed *</label>
                <input
                  type="text"
                  required
                  aria-label="Edit Animal Breed"
                  value={editBreed}
                  onChange={(e) => setEditBreed(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Date of Birth</label>
                <input
                  type="date"
                  aria-label="Edit Date of Birth"
                  value={editDob}
                  onChange={(e) => setEditDob(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Pen / Location</label>
                <input
                  type="text"
                  aria-label="Edit Animal Location"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Herd Group</label>
                <input
                  type="text"
                  aria-label="Edit Herd Group"
                  value={editHerdGroup}
                  onChange={(e) => setEditHerdGroup(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Dam Tag</label>
                <input
                  type="text"
                  aria-label="Edit Dam Tag"
                  value={editDamTag}
                  onChange={(e) => setEditDamTag(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Sire / Semen ID</label>
                <input
                  type="text"
                  aria-label="Edit Sire ID"
                  value={editSireId}
                  onChange={(e) => setEditSireId(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Markings</label>
                <input
                  type="text"
                  aria-label="Edit Markings"
                  value={editCharacteristics}
                  onChange={(e) => setEditCharacteristics(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Notes</label>
                <input
                  type="text"
                  aria-label="Edit Notes"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              {biodataError && (
                <span className="text-red-700 font-medium mr-auto">{biodataError}</span>
              )}
              <button
                type="button"
                onClick={() => setShowEditBiodataForm(false)}
                className="px-3 py-1.5 font-medium text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingBiodata}
                className="px-4 py-1.5 font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
              >
                {submittingBiodata ? 'Saving...' : 'Save Biodata Changes'}
              </button>
            </div>
          </form>
        )}

        {/* Inline Tag Replacement Drawer */}
        {showReplaceTagForm && (
          <form
            onSubmit={handleTagReplacementSubmit}
            className="shrink-0 px-6 py-3.5 bg-slate-100/90 border-b border-slate-200 flex flex-wrap items-end gap-4"
          >
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                New Replacement Tag (Retires {animal.currentTag} to Historical Registry)
              </label>
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                placeholder="Enter new replacement ear tag"
                className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div className="flex-[2] min-w-[260px]">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Reason for Tag Replacement (Required)
              </label>
              <input
                type="text"
                value={replaceReasonInput}
                onChange={(e) => setReplaceReasonInput(e.target.value)}
                placeholder="e.g. Ear tag damaged in chute; replaced with new laser tag"
                className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={submittingTag}
                className="px-4 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
              >
                {submittingTag ? 'Saving...' : 'Confirm Tag Replacement'}
              </button>
              <button
                type="button"
                onClick={() => setShowReplaceTagForm(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
            </div>
            {tagFormError && (
              <p className="w-full text-xs text-red-700 font-medium">{tagFormError}</p>
            )}
          </form>
        )}

        {/* Inline Status Update Drawer */}
        {showStatusForm && (
          <form
            onSubmit={handleStatusChangeSubmit}
            className="shrink-0 px-6 py-3.5 bg-slate-100/90 border-b border-slate-200 flex flex-wrap items-end gap-4"
          >
            <div className="w-56">
              <SelectWithCustom
                label="New Animal Status"
                value={newStatusInput}
                onChange={(v) => setNewStatusInput(v)}
                options={['Active', 'Sold', 'Transferred', 'Deceased', 'Missing', 'Culled']}
                placeholder="Type custom status..."
              />
            </div>
            <div className="flex-1 min-w-[260px]">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Status Change Reason / Notes (Required)
              </label>
              <input
                type="text"
                value={statusReasonInput}
                onChange={(e) => setStatusReasonInput(e.target.value)}
                placeholder="e.g. Sold to Zaria Ranch Ltd Invoice #902; all historical records preserved"
                className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={submittingStatus}
                className="px-4 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
              >
                {submittingStatus ? 'Updating...' : 'Save Status Update'}
              </button>
              <button
                type="button"
                onClick={() => setShowStatusForm(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
            </div>
            {statusFormError && (
              <p className="w-full text-xs text-red-700 font-medium">{statusFormError}</p>
            )}
          </form>
        )}

        {/* 8-Section Navigation Bar (shrink-0 + min-h-[48px] guarantees it never collapses) */}
        <nav
          aria-label="Animal profile sections"
          className="shrink-0 min-h-[48px] px-6 border-b border-slate-200 bg-white/95 flex items-center gap-1 overflow-x-auto"
        >
          {tabs.map((t) => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-2 px-3.5 py-3 text-xs border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'border-emerald-700 text-emerald-900 font-bold bg-emerald-50/50'
                    : 'border-transparent text-slate-600 font-medium hover:text-slate-900 hover:bg-slate-50/70'
                }`}
              >
                {t.icon}
                <span>{t.label}</span>
                {t.count !== undefined && (
                  <span
                    className={`font-mono text-[11px] ${
                      isActive ? 'text-emerald-700 font-semibold' : 'text-slate-400'
                    }`}
                  >
                    ({t.count})
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Main Scrollable Content Area (flex-1 min-h-0 ensures smooth independent scroll) */}
        <div className="flex-1 min-h-0 p-6 overflow-y-auto space-y-6 bg-white/40">
          {activeTab === 'overview' && (
            <ProfileOverviewTab
              animal={animal}
              costBreakdown={costBreakdown}
              latestWeight={latestWeight || undefined}
              healthEpisodes={healthEpisodes}
              treatments={treatments}
              feedAllocations={feedAllocations}
              identifiers={identifiers}
              offspring={offspring}
              onSelectAnimalById={onSelectAnimalById}
            />
          )}

          {activeTab === 'timeline' && (
            <ProfileTimelineTab
              animal={animal}
              timeline={timeline}
            />
          )}

          {activeTab === 'health' && (
            <ProfileHealthTab
              animal={animal}
              healthEpisodes={healthEpisodes}
              treatments={treatments}
              vaccinations={vaccinations}
              canEdit={canEdit}
              onOpenQuickAction={onOpenQuickAction}
            />
          )}

          {activeTab === 'feed' && (
            <ProfileFeedTab
              animal={animal}
              feedAllocations={feedAllocations}
              canEdit={canEdit}
              onOpenQuickAction={onOpenQuickAction}
            />
          )}

          {activeTab === 'breeding' && (
            <ProfileBreedingTab
              animal={animal}
              breedingEvents={breedingEvents}
              calvingEvents={calvingEvents}
              canEdit={canEdit}
              onSelectAnimalById={onSelectAnimalById}
              onOpenQuickAction={onOpenQuickAction}
            />
          )}

          {activeTab === 'weight' && (
            <ProfileWeightTab
              animal={animal}
              weightsWithAdg={weightsWithAdg}
              canEdit={canEdit}
              onOpenQuickAction={onOpenQuickAction}
            />
          )}

          {activeTab === 'expenses' && (
            <ProfileExpensesTab
              costBreakdown={costBreakdown}
              expenseLedgerRows={expenseLedgerRows}
            />
          )}

          {activeTab === 'documents' && (
            <ProfileDocumentsTab
              animal={animal}
              attachments={attachments}
              canEdit={canEdit}
              onUploadAttachment={onUploadAttachment}
            />
          )}
        </div>
      </div>
    </div>
  );
};
