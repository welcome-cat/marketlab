import { collection, doc, getDoc, getDocs, onSnapshot, runTransaction, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import type { DocumentData, DocumentReference, QueryDocumentSnapshot, QuerySnapshot, Unsubscribe } from 'firebase/firestore';
import { db } from './firebase/config';
import type { DemandEvent, Market, Room } from '../types/domain';
import { DEFAULT_UNLOCK_ROUNDS, DEMAND_EVENT_OPTIONS, MARKETS } from '../types/domain';

const baselineEvents = (): DemandEvent[] => MARKETS.map((market) => ({
  marketId: market.id,
  optionId: 'baseline',
  factor: 'BASELINE',
  effectType: 'DEMAND',
  title: '수요 변화 없음',
  description: '특별한 수요 변화 요인이 없습니다.',
  multiplier: 1,
  articleHeadline: `${market.name}, 평온한 흐름 이어져`,
  articleBody: '관련 업계에서는 최근 소비 환경에 뚜렷한 변화가 관찰되지 않고 있다고 전했습니다.',
  generatedBy: 'TEMPLATE',
}));

const normalizeDemandEvent = (event: Partial<DemandEvent>, market: Market): DemandEvent => ({
  marketId: market.id,
  optionId: event.optionId || 'baseline',
  factor: event.factor || 'BASELINE',
  effectType: event.effectType || 'DEMAND',
  title: event.title || '수요 변화 없음',
  description: event.description || '특별한 수요 변화 요인이 없습니다.',
  multiplier: event.multiplier || 1,
  materialMultiplier: event.materialMultiplier || 1,
  wageMultiplier: event.wageMultiplier || 1,
  productivityMultiplier: event.productivityMultiplier || 1,
  supplyMultiplier: event.supplyMultiplier || 1,
  supplyOptionId: event.supplyOptionId || 'supply_baseline',
  supplyFactor: event.supplyFactor || 'BASELINE',
  supplyTitle: event.supplyTitle || '공급 변화 없음',
  supplyDescription: event.supplyDescription || '특별한 공급 변화 요인이 없습니다.',
  supplyMaterialMultiplier: event.supplyMaterialMultiplier || 1,
  supplyWageMultiplier: event.supplyWageMultiplier || 1,
  supplyRentMultiplier: event.supplyRentMultiplier || 1,
  supplyProductivityMultiplier: event.supplyProductivityMultiplier || 1,
  supplyCurveMultiplier: event.supplyCurveMultiplier || 1,
  producerTaxPerUnit: event.producerTaxPerUnit || 0,
  producerSubsidyPerUnit: event.producerSubsidyPerUnit || 0,
  disasterLossChance: event.disasterLossChance || 0,
  disasterLossRate: event.disasterLossRate || 0,
  articleHeadline: event.articleHeadline || `${market.name}, 새로운 시장 움직임 포착`,
  articleBody: event.articleBody || '시장 주변의 소비 환경에 작은 변화가 관찰되고 있습니다. 기업들은 관련 흐름을 주의 깊게 살펴보고 있습니다.',
  generatedBy: event.generatedBy || 'TEMPLATE',
});

export const normalizeRoom = (roomId: string, data: Partial<Room>): Room => ({
  id: data.id || roomId,
  title: data.title || `수업 룸 ${roomId}`,
  markets: MARKETS.map((defaultMarket) => {
    const storedMarket = data.markets?.find((market) => market.id === defaultMarket.id);
    const isLegacyShoeMarket = defaultMarket.id === 'market_toy' && storedMarket?.name !== defaultMarket.name;
    const isLegacySmartphonePrice = defaultMarket.id === 'market_smartphone' && storedMarket?.basePrice === 3200;
    const hasActiveSupplyState = typeof storedMarket?.supplyShiftMultiplier === 'number';
    const isLegacyRiceEconomy = defaultMarket.id === 'market_toy' && ((storedMarket?.wagePerWorker ?? 0) >= 2800 || (storedMarket?.materialCostMultiplier ?? 0) > 1);
    const isLegacyRiceUnit = defaultMarket.id === 'market_toy' && (storedMarket?.basePrice ?? 0) >= 5000;
    return {
      ...storedMarket,
      ...defaultMarket,
      // 진행 중인 기존 시장의 수요 사건 가격은 보존하되, 운동화에서
      // 쌀로 전환되는 최초 1회에는 쌀의 새 기준가격을 적용한다.
      announcedPrice: isLegacyShoeMarket || isLegacySmartphonePrice || isLegacyRiceUnit ? defaultMarket.announcedPrice : storedMarket?.announcedPrice ?? defaultMarket.announcedPrice,
      materialCostMultiplier: hasActiveSupplyState && !isLegacyRiceEconomy ? storedMarket.materialCostMultiplier : defaultMarket.materialCostMultiplier,
      wagePerWorker: hasActiveSupplyState && !isLegacyRiceEconomy ? storedMarket.wagePerWorker : defaultMarket.wagePerWorker,
      firstWorkerProductivity: hasActiveSupplyState && !isLegacyRiceUnit ? storedMarket.firstWorkerProductivity : defaultMarket.firstWorkerProductivity,
      supplyShiftMultiplier: hasActiveSupplyState ? storedMarket.supplyShiftMultiplier : 1,
      studentSupplyWeight: storedMarket?.studentSupplyWeight ?? 1,
      demandEventEffectScale: storedMarket?.demandEventEffectScale ?? 1,
      supplyEventEffectScale: storedMarket?.supplyEventEffectScale ?? 1,
      producerTaxPerUnit: storedMarket?.producerTaxPerUnit ?? 0,
      producerSubsidyPerUnit: storedMarket?.producerSubsidyPerUnit ?? 0,
      disasterLossRate: storedMarket?.disasterLossRate ?? 0,
    };
  }),
  currentRound: data.currentRound || 1,
  status: data.status || 'WAITING',
  roundPhase: data.roundPhase || 'DECISION',
  sellingStartedAt: data.sellingStartedAt,
  sellingEndsAt: data.sellingEndsAt,
  demandEvents: data.demandEvents?.length
    ? MARKETS.map((market) => normalizeDemandEvent(data.demandEvents?.find((event) => event.marketId === market.id) || {}, market))
    : baselineEvents(),
  pendingDemandEvents: data.pendingDemandEvents?.length
    ? MARKETS.map((market) => normalizeDemandEvent(
      data.pendingDemandEvents?.find((event) => event.marketId === market.id) || {},
      market,
    ))
    : [],
  unlockRounds: { ...DEFAULT_UNLOCK_ROUNDS, ...(data.unlockRounds || {}) },
  createdAt: data.createdAt || 0,
});

const scaleChange = (factor: number | undefined, scale: number) => 1 + ((factor ?? 1) - 1) * scale;

const applyDemandEvents = (markets: Market[], events: DemandEvent[]) => markets.map((market) => {
  const event = events.find((item) => item.marketId === market.id);
  const baseline = MARKETS.find((item) => item.id === market.id) || market;
  const settings = {
    studentSupplyWeight: market.studentSupplyWeight,
    demandEventEffectScale: market.demandEventEffectScale,
    supplyEventEffectScale: market.supplyEventEffectScale,
  };
  if (!event) return { ...baseline, ...settings };
  // 가격수용 시장은 이동한 수요곡선과 우상향 공급곡선의 새 교점을
  // 계산한다. 과점시장의 기준가격은 수요 사건의 방향만 반영한다.
  const demandMultiplier = scaleChange(event.multiplier, market.demandEventEffectScale);
  const legacySupplyEvent = event.effectType === 'SUPPLY';
  const rawSupplyMultiplier = legacySupplyEvent ? event.supplyMultiplier : event.supplyCurveMultiplier;
  const supplyMultiplier = scaleChange(rawSupplyMultiplier, market.supplyEventEffectScale);
  const equilibriumFactor = baseline.marketType === 'PERFECT_COMPETITION'
    ? Math.pow(demandMultiplier / supplyMultiplier, 1 / Math.max(0.1, baseline.priceElasticity + baseline.supplyElasticity))
    : Math.pow(demandMultiplier / supplyMultiplier, 0.5);
  return {
    ...baseline,
    ...settings,
    announcedPrice: Math.max(10, Math.round((baseline.basePrice * equilibriumFactor) / 10) * 10),
    materialCostMultiplier: baseline.materialCostMultiplier * scaleChange(legacySupplyEvent ? event.materialMultiplier : event.supplyMaterialMultiplier, market.supplyEventEffectScale),
    wagePerWorker: Math.round(baseline.wagePerWorker * scaleChange(legacySupplyEvent ? event.wageMultiplier : event.supplyWageMultiplier, market.supplyEventEffectScale)),
    rentPerRound: Math.round(baseline.rentPerRound * scaleChange(event.supplyRentMultiplier, market.supplyEventEffectScale)),
    firstWorkerProductivity: baseline.firstWorkerProductivity * scaleChange(legacySupplyEvent ? event.productivityMultiplier : event.supplyProductivityMultiplier, market.supplyEventEffectScale),
    supplyShiftMultiplier: supplyMultiplier,
    producerTaxPerUnit: event.producerTaxPerUnit || 0,
    producerSubsidyPerUnit: event.producerSubsidyPerUnit || 0,
    disasterLossRate: event.disasterLossRate || 0,
  };
});

type BatchOperation =
  | { kind: 'set'; ref: DocumentReference; data: DocumentData }
  | { kind: 'delete'; ref: DocumentReference };

const commitOperations = async (operations: BatchOperation[]) => {
  for (let start = 0; start < operations.length; start += 400) {
    const batch = writeBatch(db);
    operations.slice(start, start + 400).forEach((operation) => {
      if (operation.kind === 'set') batch.set(operation.ref, operation.data);
      else batch.delete(operation.ref);
    });
    await batch.commit();
  }
};

const loadRoomDocuments = async (roomId: string) => {
  const roomRef = doc(db, 'rooms', roomId);
  const companies = await getDocs(collection(roomRef, 'companies'));
  const inventories: Array<{ companyId: string; document: QueryDocumentSnapshot<DocumentData> }> = [];
  for (const company of companies.docs) {
    const inventory = await getDocs(collection(company.ref, 'inventory'));
    inventories.push(...inventory.docs.map((item) => ({ companyId: company.id, document: item })));
  }
  const collectionNames = ['companyNames', 'productionPlans', 'marketResults', 'sellOrders', 'trades', 'products', 'rounds', 'reflections'];
  const collections = new Map<string, QuerySnapshot<DocumentData>>();
  for (const name of collectionNames) collections.set(name, await getDocs(collection(roomRef, name)));
  return { roomRef, companies, inventories, collections };
};

export const roomService = {
  subscribeRooms: (callback: (rooms: Room[]) => void): Unsubscribe =>
    onSnapshot(collection(db, 'rooms'), (snapshot) => {
      const rooms = snapshot.docs.map((item) => normalizeRoom(item.id, item.data() as Partial<Room>));
      callback(rooms.sort((a, b) => b.createdAt - a.createdAt));
    }),
  getRoom: async (roomId: string): Promise<Room | null> => {
    const snapshot = await getDoc(doc(db, 'rooms', roomId));
    return snapshot.exists() ? normalizeRoom(snapshot.id, snapshot.data() as Partial<Room>) : null;
  },
  createRoom: async (roomId: string, title: string): Promise<void> => {
    const roomRef = doc(db, 'rooms', roomId);
    if ((await getDoc(roomRef)).exists()) throw new Error('ROOM_ALREADY_EXISTS');
    await setDoc(roomRef, { id: roomId, title, markets: MARKETS, currentRound: 1, status: 'WAITING', roundPhase: 'DECISION', demandEvents: baselineEvents(), pendingDemandEvents: [], unlockRounds: DEFAULT_UNLOCK_ROUNDS, createdAt: Date.now() } satisfies Room);
  },
  startRoom: async (roomId: string): Promise<void> => {
    const roomRef = doc(db, 'rooms', roomId);
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(roomRef);
      if (!snapshot.exists()) throw new Error('ROOM_NOT_FOUND');
      const room = normalizeRoom(snapshot.id, snapshot.data() as Partial<Room>);
      if (room.status !== 'WAITING') throw new Error('ROOM_ALREADY_STARTED');
      const nextEvents = room.pendingDemandEvents.length === room.markets.length ? room.pendingDemandEvents : baselineEvents();
      transaction.update(roomRef, {
        status: 'RUNNING',
        roundPhase: 'DECISION',
        sellingStartedAt: null,
        sellingEndsAt: null,
        demandEvents: nextEvents,
        pendingDemandEvents: [],
        markets: applyDemandEvents(room.markets, nextEvents),
      });
    });
  },
  advanceRound: async (roomId: string): Promise<void> => {
    const roomRef = doc(db, 'rooms', roomId);
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(roomRef);
      if (!snapshot.exists()) throw new Error('ROOM_NOT_FOUND');
      const room = normalizeRoom(snapshot.id, snapshot.data() as Partial<Room>);
      if (room.status !== 'RUNNING') throw new Error('ROOM_NOT_RUNNING');
      if (room.roundPhase !== 'RESULT') throw new Error('ROUND_NOT_SETTLED');
      const nextEvents = room.pendingDemandEvents.length === room.markets.length ? room.pendingDemandEvents : baselineEvents();
      transaction.update(roomRef, {
        currentRound: room.currentRound + 1,
        roundPhase: 'DECISION',
        demandEvents: nextEvents,
        pendingDemandEvents: [],
        markets: applyDemandEvents(room.markets, nextEvents),
      });
    });
  },
  finishRoom: async (roomId: string): Promise<void> => {
    const roomRef = doc(db, 'rooms', roomId);
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(roomRef);
      if (!snapshot.exists()) throw new Error('ROOM_NOT_FOUND');
      transaction.update(roomRef, { status: 'FINISHED' });
    });
  },
  confirmDemandEvents: async (roomId: string, events: DemandEvent[]): Promise<void> => {
    const roomRef = doc(db, 'rooms', roomId);
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(roomRef);
      if (!snapshot.exists()) throw new Error('ROOM_NOT_FOUND');
      const room = normalizeRoom(snapshot.id, snapshot.data() as Partial<Room>);
      const canPrepare = room.status === 'WAITING' || (room.status === 'RUNNING' && room.roundPhase === 'RESULT');
      if (!canPrepare) throw new Error('DEMAND_EVENT_SELECTION_NOT_ALLOWED');
      if (events.length !== room.markets.length || events.some((event) => !DEMAND_EVENT_OPTIONS.some((option) => option.id === event.optionId))) {
        throw new Error('INVALID_DEMAND_EVENTS');
      }
      transaction.update(roomRef, { pendingDemandEvents: events });
    });
  },
  updateUnlockRounds: async (roomId: string, unlockRounds: Room['unlockRounds']): Promise<void> => {
    const values = Object.values(unlockRounds);
    if (values.some((value) => !Number.isInteger(value) || value < 1 || value > 20)) throw new Error('INVALID_UNLOCK_ROUNDS');
    await updateDoc(doc(db, 'rooms', roomId), { unlockRounds });
  },
  updateMarketInfluence: async (roomId: string, settings: Record<string, { studentSupplyWeight: number; demandEventEffectScale: number; supplyEventEffectScale: number }>): Promise<void> => {
    const roomRef = doc(db, 'rooms', roomId);
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(roomRef);
      if (!snapshot.exists()) throw new Error('ROOM_NOT_FOUND');
      const room = normalizeRoom(snapshot.id, snapshot.data() as Partial<Room>);
      const marketsWithSettings = room.markets.map((market) => {
        const setting = settings[market.id];
        if (!setting) return market;
        if (!Number.isFinite(setting.studentSupplyWeight) || setting.studentSupplyWeight < 1 || setting.studentSupplyWeight > 100) throw new Error('INVALID_MARKET_INFLUENCE');
        if ([setting.demandEventEffectScale, setting.supplyEventEffectScale].some((value) => !Number.isFinite(value) || value < 0 || value > 10)) throw new Error('INVALID_MARKET_INFLUENCE');
        return { ...market, studentSupplyWeight: setting.studentSupplyWeight, demandEventEffectScale: setting.demandEventEffectScale, supplyEventEffectScale: setting.supplyEventEffectScale };
      });
      const markets = applyDemandEvents(marketsWithSettings, room.demandEvents);
      transaction.update(roomRef, { markets });
    });
  },
  updateRoom: async (roomId: string, nextRoomId: string, nextTitle: string): Promise<Room> => {
    const normalizedRoomId = nextRoomId.trim();
    const normalizedTitle = nextTitle.trim();
    if (!normalizedRoomId || normalizedRoomId.length > 40) throw new Error('INVALID_ROOM_ID');
    if (!normalizedTitle || normalizedTitle.length > 80) throw new Error('INVALID_ROOM_TITLE');

    const currentRef = doc(db, 'rooms', roomId);
    const currentSnapshot = await getDoc(currentRef);
    if (!currentSnapshot.exists()) throw new Error('ROOM_NOT_FOUND');
    const currentRoom = normalizeRoom(currentSnapshot.id, currentSnapshot.data() as Partial<Room>);

    if (normalizedRoomId === roomId) {
      await updateDoc(currentRef, { title: normalizedTitle });
      return { ...currentRoom, title: normalizedTitle };
    }
    if (currentRoom.status === 'RUNNING') throw new Error('ROOM_CODE_CHANGE_WHILE_RUNNING');

    const nextRef = doc(db, 'rooms', normalizedRoomId);
    if ((await getDoc(nextRef)).exists()) throw new Error('ROOM_ALREADY_EXISTS');
    const contents = await loadRoomDocuments(roomId);
    const copyOperations: BatchOperation[] = [{
      kind: 'set',
      ref: nextRef,
      data: { ...currentSnapshot.data(), id: normalizedRoomId, title: normalizedTitle },
    }];
    contents.companies.docs.forEach((company) => copyOperations.push({
      kind: 'set',
      ref: doc(db, 'rooms', normalizedRoomId, 'companies', company.id),
      data: { ...company.data(), roomId: normalizedRoomId },
    }));
    contents.inventories.forEach(({ companyId, document }) => copyOperations.push({
      kind: 'set',
      ref: doc(db, 'rooms', normalizedRoomId, 'companies', companyId, 'inventory', document.id),
      data: document.data(),
    }));
    contents.collections.forEach((snapshot, collectionName) => snapshot.docs.forEach((item) => copyOperations.push({
      kind: 'set',
      ref: doc(db, 'rooms', normalizedRoomId, collectionName, item.id),
      data: 'roomId' in item.data() ? { ...item.data(), roomId: normalizedRoomId } : item.data(),
    })));
    await commitOperations(copyOperations);

    const deleteOperations: BatchOperation[] = [];
    contents.inventories.forEach(({ document }) => deleteOperations.push({ kind: 'delete', ref: document.ref }));
    contents.companies.docs.forEach((company) => deleteOperations.push({ kind: 'delete', ref: company.ref }));
    contents.collections.forEach((snapshot) => snapshot.docs.forEach((item) => deleteOperations.push({ kind: 'delete', ref: item.ref })));
    deleteOperations.push({ kind: 'delete', ref: currentRef });
    await commitOperations(deleteOperations);
    return { ...currentRoom, id: normalizedRoomId, title: normalizedTitle };
  },
  deleteRoom: async (roomId: string): Promise<void> => {
    const roomRef = doc(db, 'rooms', roomId);
    const roomSnapshot = await getDoc(roomRef);
    if (!roomSnapshot.exists()) throw new Error('ROOM_NOT_FOUND');
    const room = normalizeRoom(roomSnapshot.id, roomSnapshot.data() as Partial<Room>);
    if (room.status !== 'FINISHED') throw new Error('ROOM_NOT_FINISHED');
    const contents = await loadRoomDocuments(roomId);
    const operations: BatchOperation[] = [];
    contents.inventories.forEach(({ document }) => operations.push({ kind: 'delete', ref: document.ref }));
    contents.companies.docs.forEach((company) => operations.push({ kind: 'delete', ref: company.ref }));
    contents.collections.forEach((snapshot) => snapshot.docs.forEach((item) => operations.push({ kind: 'delete', ref: item.ref })));
    operations.push({ kind: 'delete', ref: roomRef });
    await commitOperations(operations);
  },
  subscribeRoom: (roomId: string, callback: (room: Room | null) => void): Unsubscribe =>
    onSnapshot(doc(db, 'rooms', roomId), (snapshot) => callback(snapshot.exists() ? normalizeRoom(snapshot.id, snapshot.data() as Partial<Room>) : null)),
};
