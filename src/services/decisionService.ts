import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebase/config';

export interface DecisionData {
  companyId: string;
  quantity: number;
  price: number;
  submittedAt: number;
}

export const decisionService = {
  submitDecision: async (roomId: string, roundNumber: number, decision: DecisionData): Promise<void> => {
    const decisionRef = doc(db, 'rooms', roomId, 'rounds', String(roundNumber), 'decisions', decision.companyId);
    await setDoc(decisionRef, decision);
  },
};
