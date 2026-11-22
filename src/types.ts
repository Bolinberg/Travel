export type Category =
  | 'fuel'
  | 'accommodation'
  | 'food'
  | 'activity'
  | 'transport'
  | 'shopping'
  | 'other';

export const CATEGORY_LABELS: Record<Category, string> = {
  fuel: '油费',
  accommodation: '住宿',
  food: '餐饮',
  activity: '门票/活动',
  transport: '停车/交通',
  shopping: '购物',
  other: '其他',
};

export interface Accommodation {
  name: string;
  cost: number;
  booked: boolean;
  paid: boolean;
  notes: string;
}

export interface Day {
  id: string;
  title: string;
  from: string;
  to: string;
  km: number;
  driveHours: number;
  /** 途经点 / 景点，每行一个 */
  stops: string[];
  accommodation: Accommodation | null;
  notes: string;
}

export interface Expense {
  id: string;
  title: string;
  category: Category;
  amount: number;
  /** 关联到第几天（Day.id），可为空 */
  dayId: string | null;
  paid: boolean;
}

export interface ChecklistItem {
  id: string;
  text: string;
  group: string;
  done: boolean;
}

export interface Trip {
  version: 1;
  name: string;
  startDate: string; // YYYY-MM-DD
  adults: number;
  children: number;
  budget: number;
  vehicle: {
    name: string;
    litresPer100km: number;
    fuelPrice: number; // AUD / L
  };
  food: {
    adultPerDay: number;
    childPerDay: number;
  };
  days: Day[];
  expenses: Expense[];
  checklist: ChecklistItem[];
}
