import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import { db } from './firebase/config';
import type { Company } from '../types/domain';
import { TECHNOLOGIES } from '../types/domain';

const randomAdjustment = (range: number) =>
  Math.floor(Math.random() * (range * 2 + 1)) - range;

const createProductionProfile = (technologyId: string) => {
  const profiles = {
    tech_automation: {
      rentPerRound: 7000,
      wagePerWorker: 2000,
      materialUnitCost: 175,
      firstWorkerProductivity: 28,
      productivityDecline: 4,
      minimumWorkerProductivity: 8,
      machinePrice: 18000,
      researchBaseCost: 14000,
      technologyBoostRate: 0.1,
    },
    tech_skilled_labor: {
      rentPerRound: 3800,
      wagePerWorker: 2400,
      materialUnitCost: 180,
      firstWorkerProductivity: 25,
      productivityDecline: 3,
      minimumWorkerProductivity: 8,
      machinePrice: 16000,
      researchBaseCost: 15000,
      technologyBoostRate: 0.1,
    },
    tech_precision: {
      rentPerRound: 5500,
      wagePerWorker: 2100,
      materialUnitCost: 145,
      firstWorkerProductivity: 23,
      productivityDecline: 3,
      minimumWorkerProductivity: 7,
      machinePrice: 17000,
      researchBaseCost: 13000,
      technologyBoostRate: 0.1,
    },
    tech_eco: {
      rentPerRound: 5000,
      wagePerWorker: 2200,
      materialUnitCost: 160,
      firstWorkerProductivity: 22,
      productivityDecline: 3,
      minimumWorkerProductivity: 7,
      machinePrice: 16500,
      researchBaseCost: 14000,
      technologyBoostRate: 0.1,
    },
  };
  const base = profiles[technologyId as keyof typeof profiles] ?? profiles.tech_skilled_labor;

  return {
    rentPerRound: base.rentPerRound + randomAdjustment(400),
    wagePerWorker: base.wagePerWorker + randomAdjustment(150),
    materialUnitCost: base.materialUnitCost + randomAdjustment(12),
    firstWorkerProductivity: base.firstWorkerProductivity + randomAdjustment(2),
    productivityDecline: base.productivityDecline,
    minimumWorkerProductivity: base.minimumWorkerProductivity,
    machinePrice: base.machinePrice,
    researchBaseCost: base.researchBaseCost,
    technologyBoostRate: base.technologyBoostRate,
  };
};

const hasCurrentProductionProfile = (company: Company) =>
  Boolean(company.productionProfile) &&
  typeof company.productionProfile.rentPerRound === 'number' &&
  typeof company.productionProfile.machinePrice === 'number';

const normalizeCompany = (company: Company): Company => ({
  ...company,
  productionProfile: hasCurrentProductionProfile(company)
    ? company.productionProfile
    : createProductionProfile(company.technologyId),
  machineCount: company.machineCount || 1,
  employeeCount: company.employeeCount || 1,
  machineAssets: company.machineAssets || ((company.machineCount || 1) > 1 ? [{ id: 'legacy-machines', marketId: '*', quantity: (company.machineCount || 1) - 1, purchasePrice: 0, purchasedRound: 0 }] : []),
  technologyLevel: company.technologyLevel || 0,
});

const normalizeCompanyName = (name: string) =>
  name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR');

const companyNameIndexId = (normalizedName: string) =>
  encodeURIComponent(normalizedName);

const validateCompanyName = (name: string) => {
  const trimmedName = name.trim().replace(/\s+/g, ' ');
  if (!trimmedName || trimmedName.length > 30) {
    throw new Error('INVALID_COMPANY_NAME');
  }
  return trimmedName;
};

const findLegacyCompanyId = async (roomId: string, companyName: string) => {
  const companiesRef = collection(db, 'rooms', roomId, 'companies');
  const snapshot = await getDocs(query(companiesRef, where('name', '==', companyName)));
  if (snapshot.empty) return null;

  return snapshot.docs
    .map((companyDoc) => companyDoc.data() as Company)
    .sort((a, b) => a.joinedAt - b.joinedAt)[0]?.id ?? null;
};

export const companyService = {
  /**
   * 학생 회사 등록 및 랜덤 기업 특성(Technology) 부여
   */
  registerCompany: async (
    roomId: string,
    companyName: string,
  ): Promise<Company> => {
    const trimmedName = validateCompanyName(companyName);
    const normalizedName = normalizeCompanyName(trimmedName);
    const legacyCompanyId = await findLegacyCompanyId(roomId, trimmedName);
    const roomRef = doc(db, 'rooms', roomId);
    const nameIndexRef = doc(
      db,
      'rooms',
      roomId,
      'companyNames',
      companyNameIndexId(normalizedName),
    );

    return runTransaction(db, async (transaction) => {
      const roomSnapshot = await transaction.get(roomRef);
      if (!roomSnapshot.exists()) {
        throw new Error('ROOM_NOT_FOUND');
      }

      const nameIndexSnapshot = await transaction.get(nameIndexRef);
      const indexedCompanyId = nameIndexSnapshot.exists()
        ? (nameIndexSnapshot.data().companyId as string)
        : null;
      const companyId = indexedCompanyId || legacyCompanyId || `comp_${crypto.randomUUID()}`;
      const companyRef = doc(db, 'rooms', roomId, 'companies', companyId);
      const companySnapshot = await transaction.get(companyRef);
      if (companySnapshot.exists()) {
        const existingCompany = companySnapshot.data() as Company;
        if (
          hasCurrentProductionProfile(existingCompany) &&
          typeof existingCompany.machineCount === 'number' &&
          typeof existingCompany.employeeCount === 'number' &&
          Array.isArray(existingCompany.machineAssets) &&
          typeof existingCompany.technologyLevel === 'number' &&
          existingCompany.normalizedName &&
          nameIndexSnapshot.exists()
        ) {
          return existingCompany;
        }

        const upgradedCompany: Company = {
          ...normalizeCompany(existingCompany),
          normalizedName,
        };
        transaction.update(companyRef, {
          normalizedName,
          productionProfile: upgradedCompany.productionProfile,
          machineCount: upgradedCompany.machineCount,
          employeeCount: upgradedCompany.employeeCount,
          machineAssets: upgradedCompany.machineAssets,
          technologyLevel: upgradedCompany.technologyLevel,
        });
        transaction.set(nameIndexRef, {
          companyId,
          companyName: upgradedCompany.name,
          normalizedName,
          updatedAt: Date.now(),
        });
        return upgradedCompany;
      }

      const room = roomSnapshot.data();
      if ((room.status || 'WAITING') !== 'WAITING') {
        throw new Error('ROOM_NOT_JOINABLE');
      }

      const randomTech = TECHNOLOGIES[Math.floor(Math.random() * TECHNOLOGIES.length)];
      const now = Date.now();
      const newCompany: Company = {
        id: companyId,
        roomId,
        name: trimmedName,
        normalizedName,
        cash: 100000,
        technologyId: randomTech.id,
        technologyName: randomTech.name,
        technologyDescription: randomTech.description,
        technologyIcon: randomTech.icon,
        productionProfile: createProductionProfile(randomTech.id),
        machineCount: 1,
        employeeCount: 1,
        machineAssets: [],
        technologyLevel: 0,
        status: 'ACTIVE',
        createdAt: now,
        joinedAt: now,
      };

      transaction.set(companyRef, newCompany);
      transaction.set(nameIndexRef, {
        companyId,
        companyName: trimmedName,
        normalizedName,
        updatedAt: now,
      });
      return newCompany;
    });
  },

  renameCompany: async (
    roomId: string,
    companyId: string,
    nextName: string,
  ): Promise<void> => {
    const trimmedName = validateCompanyName(nextName);
    const nextNormalizedName = normalizeCompanyName(trimmedName);
    const legacyCompanyId = await findLegacyCompanyId(roomId, trimmedName);
    if (legacyCompanyId && legacyCompanyId !== companyId) {
      throw new Error('COMPANY_NAME_ALREADY_EXISTS');
    }
    const companyRef = doc(db, 'rooms', roomId, 'companies', companyId);

    await runTransaction(db, async (transaction) => {
      const companySnapshot = await transaction.get(companyRef);
      if (!companySnapshot.exists()) throw new Error('COMPANY_NOT_FOUND');

      const company = companySnapshot.data() as Company;
      const previousNormalizedName =
        company.normalizedName || normalizeCompanyName(company.name);
      const previousIndexRef = doc(
        db,
        'rooms',
        roomId,
        'companyNames',
        companyNameIndexId(previousNormalizedName),
      );
      const nextIndexRef = doc(
        db,
        'rooms',
        roomId,
        'companyNames',
        companyNameIndexId(nextNormalizedName),
      );
      const previousIndexSnapshot = await transaction.get(previousIndexRef);
      const nextIndexSnapshot = previousNormalizedName === nextNormalizedName
        ? previousIndexSnapshot
        : await transaction.get(nextIndexRef);

      if (
        nextIndexSnapshot.exists() &&
        nextIndexSnapshot.data().companyId !== companyId
      ) {
        throw new Error('COMPANY_NAME_ALREADY_EXISTS');
      }

      const now = Date.now();
      transaction.update(companyRef, {
        name: trimmedName,
        normalizedName: nextNormalizedName,
      });
      transaction.set(nextIndexRef, {
        companyId,
        companyName: trimmedName,
        normalizedName: nextNormalizedName,
        updatedAt: now,
      });
      if (previousNormalizedName !== nextNormalizedName && previousIndexSnapshot.exists()) {
        transaction.delete(previousIndexRef);
      }
    });
  },

  deleteCompany: async (roomId: string, companyId: string): Promise<void> => {
    const companyRef = doc(db, 'rooms', roomId, 'companies', companyId);
    const companySnapshot = await getDoc(companyRef);
    if (!companySnapshot.exists()) throw new Error('COMPANY_NOT_FOUND');

    const company = companySnapshot.data() as Company;
    const normalizedName = company.normalizedName || normalizeCompanyName(company.name);
    const nameIndexRef = doc(
      db,
      'rooms',
      roomId,
      'companyNames',
      companyNameIndexId(normalizedName),
    );
    const inventorySnapshot = await getDocs(collection(companyRef, 'inventory'));
    const plansSnapshot = await getDocs(query(
      collection(db, 'rooms', roomId, 'productionPlans'),
      where('companyId', '==', companyId),
    ));

    const batch = writeBatch(db);
    inventorySnapshot.docs.forEach((inventoryDoc) => batch.delete(inventoryDoc.ref));
    plansSnapshot.docs.forEach((planDoc) => batch.delete(planDoc.ref));
    batch.delete(nameIndexRef);
    batch.delete(companyRef);
    await batch.commit();
  },

  /**
   * 룸에 접속한 모든 회사 목록 실시간 구독 (교사용)
   */
  subscribeCompanies: (roomId: string, callback: (companies: Company[]) => void): Unsubscribe => {
    const companiesRef = collection(db, 'rooms', roomId, 'companies');
    return onSnapshot(companiesRef, (snapshot) => {
      const companies: Company[] = snapshot.docs.map((docSnap) => normalizeCompany(docSnap.data() as Company));
      companies.sort((a, b) => a.joinedAt - b.joinedAt);
      callback(companies);
    });
  },

  subscribeCompany: (
    roomId: string,
    companyId: string,
    callback: (company: Company | null) => void,
  ): Unsubscribe => {
    const companyRef = doc(db, 'rooms', roomId, 'companies', companyId);
    return onSnapshot(companyRef, (snapshot) => {
      callback(snapshot.exists() ? normalizeCompany(snapshot.data() as Company) : null);
    });
  },
};
