import { collection, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import { db } from './firebase/config';
import type { LearningReflection } from '../types/domain';

export const reflectionService = {
  save: async (reflection: Omit<LearningReflection, 'id' | 'submittedAt'>): Promise<void> => {
    const id = `${reflection.companyId}_${reflection.roundNumber}`;
    await setDoc(doc(db, 'rooms', reflection.roomId, 'reflections', id), {
      ...reflection,
      id,
      submittedAt: Date.now(),
    } satisfies LearningReflection);
  },

  subscribeRound: (roomId: string, roundNumber: number, callback: (items: LearningReflection[]) => void): Unsubscribe => {
    const reflectionQuery = query(collection(db, 'rooms', roomId, 'reflections'), where('roundNumber', '==', roundNumber));
    return onSnapshot(reflectionQuery, (snapshot) => callback(snapshot.docs.map((item) => item.data() as LearningReflection)));
  },

  subscribeCompanyRound: (roomId: string, companyId: string, roundNumber: number, callback: (item: LearningReflection | null) => void): Unsubscribe =>
    onSnapshot(doc(db, 'rooms', roomId, 'reflections', `${companyId}_${roundNumber}`), (snapshot) => callback(snapshot.exists() ? snapshot.data() as LearningReflection : null)),
};
