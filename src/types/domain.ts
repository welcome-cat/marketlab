/**
 * Core Domain Models (Sprint 3 Refactored)
 */

// 1. Market Definition (3종)
export interface Market {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export const MARKETS: Market[] = [
  { id: 'market_tumbler', name: '텀블러 시장', description: '일상에서 널리 쓰이는 스테인리스 텀블러 제조 시장입니다.', icon: '🥤' },
  { id: 'market_toy', name: '장난감 시장', description: '창의적인 조립 완구 및 피규어 제조 시장입니다.', icon: '🧸' },
  { id: 'market_smartphone', name: '스마트폰 시장', description: '정밀 전자기기와 모바일 부품을 제조하는 첨단 시장입니다.', icon: '📱' },
];

// 2. Room Model (단일 시장 속성 포함)
export interface Room {
  id: string;               // 룸 코드 (예: ROOM101)
  title: string;            // 수업 제목
  marketId: string;         // 교사가 설정한 시장 ID
  marketName: string;       // 시장 이름
  marketDescription: string;// 시장 설명
  marketIcon: string;       // 시장 아이콘
  currentRound: number;     // 현재 라운드 (기본 1)
  status: 'WAITING' | 'RUNNING' | 'FINISHED';
  createdAt: number;
}

// 3. Technology Definition (직관적인 4대 현실 기업 특성)
export interface Technology {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export const TECHNOLOGIES: Technology[] = [
  {
    id: 'tech_automation',
    name: '자동화 공장',
    description: '로봇 자동화 라인을 갖추어 대량 생산 시 노동력을 획기적으로 절감할 수 있습니다.',
    icon: '🤖',
  },
  {
    id: 'tech_skilled_labor',
    name: '숙련 기술자 보유',
    description: '숙련된 장인과 엔지니어를 보유하여 복잡한 수작업 조립 공정에 강점이 있습니다.',
    icon: '👨‍🔧',
  },
  {
    id: 'tech_precision',
    name: '정밀 가공 설비',
    description: '초정밀 가공 기계를 보유하여 원자재 낭비를 최소화하고 불량률이 낮습니다.',
    icon: '🔬',
  },
  {
    id: 'tech_eco',
    name: '친환경 생산라인',
    description: '에너지 절감 공정과 친환경 재활용 원료 사용에 특화된 설비를 보유하고 있습니다.',
    icon: '🌿',
  },
];

// 4. Company Model (학생 기업)
export interface Company {
  id: string;
  roomId: string;
  name: string;
  cash: number;                        // 초기 자본금 (100,000원)
  technologyId: string;                // 부여받은 특성 ID
  technologyName: string;              // 특성 이름 (예: 자동화 공장)
  technologyDescription: string;       // 특성 설명
  technologyIcon: string;              // 특성 아이콘
  status: 'ACTIVE';
  createdAt: number;
  joinedAt: number;
}

// 5. Round Model
export interface Round {
  roundNumber: number;
  status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED';
}
