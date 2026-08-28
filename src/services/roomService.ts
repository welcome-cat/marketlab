import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import { db } from './firebase/config';

export interface RoomData {
  id: string;
  title: string;
  currentRound: number;
  status: 'WAITING' | 'DECIDING' | 'FINISHED';
  createdAt: number;
}

export const roomService = {
  createRoom: async (roomId: string, title: string): Promise<void> => {
    const roomRef = doc(db, 'rooms', roomId);
    const initialData: RoomData = {
      id: roomId,
      title,
      currentRound: 1,
      status: 'WAITING',
      createdAt: Date.now(),
    };
    await setDoc(roomRef, initialData);
  },

  subscribeRoom: (roomId: string, callback: (room: RoomData | null) => void): Unsubscribe => {
    const roomRef = doc(db, 'rooms', roomId);
    return onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.data() as RoomData);
      } else {
        callback(null);
      }
    });
  },
};
