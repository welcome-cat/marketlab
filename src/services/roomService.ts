import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import { db } from './firebase/config';
import type { Room } from '../types/domain';
import { MARKETS } from '../types/domain';

export const roomService = {
  /**
   * 교사용 룸 생성 (시장 일괄 지정)
   */
  createRoom: async (
    roomId: string,
    title: string,
    marketId = 'market_tumbler'
  ): Promise<void> => {
    const market =
      MARKETS.find((m) => m.id === marketId) || MARKETS[0];

    const roomRef = doc(db, 'rooms', roomId);

    const initialRoom: Room = {
      id: roomId,
      title,
      marketId: market.id,
      marketName: market.name,
      marketDescription: market.description,
      marketIcon: market.icon,
      currentRound: 1,
      status: 'WAITING',
      createdAt: Date.now(),
    };

    await setDoc(roomRef, initialRoom);
  },

  /**
   * 룸 상태 실시간 구독
   */
  subscribeRoom: (
    roomId: string,
    callback: (room: Room | null) => void
  ): Unsubscribe => {
    const roomRef = doc(db, 'rooms', roomId);

    return onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.data() as Room);
      } else {
        callback(null);
      }
    });
  },
};