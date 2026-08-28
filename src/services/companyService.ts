import { doc, setDoc, collection, onSnapshot } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import { db } from './firebase/config';
import type { Company } from '../types/domain';
import { TECHNOLOGIES } from '../types/domain';

export const companyService = {
  /**
   * 학생 회사 등록 및 랜덤 기업 특성(Technology) 부여
   */
  registerCompany: async (roomId: string, companyName: string): Promise<Company> => {
    const companyId = `comp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const companyRef = doc(db, 'rooms', roomId, 'companies', companyId);

    // 직관적인 4대 기업 특성 중 랜덤 1개 선택
    const randomTech = TECHNOLOGIES[Math.floor(Math.random() * TECHNOLOGIES.length)];
    const now = Date.now();

    const newCompany: Company = {
      id: companyId,
      roomId,
      name: companyName,
      cash: 100000, // 기본 자본금 100,000원
      technologyId: randomTech.id,
      technologyName: randomTech.name,
      technologyDescription: randomTech.description,
      technologyIcon: randomTech.icon,
      status: 'ACTIVE',
      createdAt: now,
      joinedAt: now,
    };

    await setDoc(companyRef, newCompany);
    return newCompany;
  },

  /**
   * 룸에 접속한 모든 회사 목록 실시간 구독 (교사용)
   */
  subscribeCompanies: (roomId: string, callback: (companies: Company[]) => void): Unsubscribe => {
    const companiesRef = collection(db, 'rooms', roomId, 'companies');
    return onSnapshot(companiesRef, (snapshot) => {
      const companies: Company[] = snapshot.docs.map((docSnap) => docSnap.data() as Company);
      companies.sort((a, b) => a.joinedAt - b.joinedAt);
      callback(companies);
    });
  },
};
