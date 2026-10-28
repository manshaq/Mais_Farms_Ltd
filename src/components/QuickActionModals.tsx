import React from 'react';
import { MaisDatabaseState } from '../types/mais';
import { RegisterAnimalModal } from './modals/RegisterAnimalModal';
import { RecordTreatmentModal } from './modals/RecordTreatmentModal';
import { RecordFeedModal } from './modals/RecordFeedModal';
import { RecordWeightModal } from './modals/RecordWeightModal';
import { RecordBreedingModal } from './modals/RecordBreedingModal';
import { RecordExpenseModal } from './modals/RecordExpenseModal';

export type QuickActionModalType =
  | 'register_animal'
  | 'treatment'
  | 'feed'
  | 'weight'
  | 'breeding'
  | 'expense'
  | null;

export interface QuickActionModalsProps {
  activeModal: QuickActionModalType;
  preselectedAnimalId?: string | null;
  db: MaisDatabaseState;
  onClose: () => void;
  onRegisterAnimal: (payload: any) => Promise<void>;
  onCreateHealthEpisode: (animalId: string, payload: any) => Promise<{ episode: { id: string } }>;
  onRecordTreatment: (episodeId: string, payload: any) => Promise<void>;
  onRecordFeedIssue: (payload: any) => Promise<void>;
  onRecordFeedPurchase: (payload: any) => Promise<void>;
  onRecordFeedLoss: (payload: any) => Promise<void>;
  onRecordWeight: (animalId: string, payload: any) => Promise<void>;
  onRecordBreeding: (animalId: string, payload: any) => Promise<void>;
  onRecordCalving: (payload: any) => Promise<void>;
  onRecordExpense: (payload: any) => Promise<void>;
}

export const QuickActionModals: React.FC<QuickActionModalsProps> = ({
  activeModal,
  preselectedAnimalId,
  db,
  onClose,
  onRegisterAnimal,
  onCreateHealthEpisode,
  onRecordTreatment,
  onRecordFeedIssue,
  onRecordFeedPurchase,
  onRecordFeedLoss,
  onRecordWeight,
  onRecordBreeding,
  onRecordCalving,
  onRecordExpense,
}) => {
  if (!activeModal) return null;

  switch (activeModal) {
    case 'register_animal':
      return (
        <RegisterAnimalModal
          db={db}
          onClose={onClose}
          onRegisterAnimal={onRegisterAnimal}
        />
      );
    case 'treatment':
      return (
        <RecordTreatmentModal
          db={db}
          preselectedAnimalId={preselectedAnimalId}
          onClose={onClose}
          onCreateHealthEpisode={onCreateHealthEpisode}
          onRecordTreatment={onRecordTreatment}
        />
      );
    case 'feed':
      return (
        <RecordFeedModal
          db={db}
          onClose={onClose}
          onRecordFeedIssue={onRecordFeedIssue}
          onRecordFeedPurchase={onRecordFeedPurchase}
          onRecordFeedLoss={onRecordFeedLoss}
        />
      );
    case 'weight':
      return (
        <RecordWeightModal
          db={db}
          preselectedAnimalId={preselectedAnimalId}
          onClose={onClose}
          onRecordWeight={onRecordWeight}
        />
      );
    case 'breeding':
      return (
        <RecordBreedingModal
          db={db}
          preselectedAnimalId={preselectedAnimalId}
          onClose={onClose}
          onRecordBreeding={onRecordBreeding}
          onRecordCalving={onRecordCalving}
        />
      );
    case 'expense':
      return (
        <RecordExpenseModal
          db={db}
          preselectedAnimalId={preselectedAnimalId}
          onClose={onClose}
          onRecordExpense={onRecordExpense}
        />
      );
    default:
      return null;
  }
};
