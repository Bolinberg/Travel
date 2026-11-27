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

/** 在地图上的位置（key 记下是按哪个名字 / 地址查的，名字或地址改了就重查） */
export interface GeoPin {
  lat: number;
  lng: number;
  key: string;
}

export interface Accommodation {
  /** 地图位置 */
  geo?: GeoPin;
  name: string;
  cost: number;
  booked: boolean;
  paid: boolean;
  notes: string;
}

/** 地图上的一个地点（景点 / 城镇） */
export interface Place {
  /** 唯一名称，与行程中的出发地/目的地/途经点字符串一致 */
  name: string;
  /** 显示名称 */
  label: string;
  lat: number;
  lng: number;
  /** 英文维基百科条目名，用于加载风景照片和简介 */
  wiki?: string;
  /** 中文简介 / 游玩建议 */
  desc?: string;
}

/** 住宿或餐饮推荐 */
export interface Rec {
  id: string;
  name: string;
  /** 所在城镇，用于搜索链接 */
  where: string;
  type: string;
  /** 价格说明，如 "约 $250–350/晚" 或 "$$" */
  price: string;
  /** 估算金额（住宿用于一键填入价格） */
  cost?: number;
  note: string;
  picked: boolean;
  /** 官网（已核实） */
  url?: string;
  /** Booking.com / Wotif 等大平台上的房源页 */
  bookingUrl?: string;
  /** 评分及来源，如「Booking.com 8.6/10」 */
  rating?: string;
  /** 首选推荐 */
  top?: boolean;
  /** 餐厅已订位 */
  booked?: boolean;
  /** 地图位置 */
  geo?: GeoPin;
}

/** 交通方式 */
export type Mode = 'drive' | 'walk' | 'bike' | 'transit' | 'ferry' | 'flight';

export interface Day {
  id: string;
  title: string;
  from: string;
  to: string;
  km: number;
  driveHours: number;
  /** 途经点 / 景点，每行一个 */
  stops: string[];
  /** 当天默认交通方式，缺省为自驾 */
  mode?: Mode;
  /** 单独指定某一段的交通方式：键为该段到达点的名称 */
  legModes?: Record<string, Mode>;
  accommodation: Accommodation | null;
  /** 住宿推荐 */
  stayOptions: Rec[];
  /** 餐饮推荐 */
  dining: Rec[];
  notes: string;
  /** 里程和车程是按哪组地址自动算的（地址变了就重算） */
  routeKey?: string;
  /** 里程和车程是手动填的，不再自动算 */
  manualRoute?: boolean;
}

export interface Expense {
  id: string;
  title: string;
  category: Category;
  amount: number;
  /** 关联到第几天（Day.id），可为空 */
  dayId: string | null;
  paid: boolean;
  /** 已预订（门票、渡轮等需要提前订的项目） */
  booked?: boolean;
  /** 预订链接 */
  url?: string;
  /** 随手记的一笔（不用提前订，不进「要订的」） */
  quick?: boolean;
  /** 预订详情：确认号、时间、人数等 */
  note?: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  group: string;
  done: boolean;
}

export interface Trip {
  version: 2;
  id: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  adults: number;
  children: number;
  /** 小孩年龄，订房平台搜索时用 */
  childAges?: number[];
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
  places: Place[];
  expenses: Expense[];
  checklist: ChecklistItem[];
  /** 历史版本 / 备选方案 */
  versions?: TripVersion[];
  /** 当前内容来自哪个备选方案（行程页上的方案切换用） */
  activePlan?: string;
  /** 已经自动加过的方案（加过一次就不再加，删掉了也不会回来） */
  offered?: string[];
}

/** 行程的一个历史版本或备选方案（不含 versions 本身） */
export interface TripVersion {
  id: string;
  label: string;
  /** auto = 大改动前自动保存；manual = 手动保存；proposal = 未应用的备选方案 */
  kind: 'auto' | 'manual' | 'proposal';
  createdAt: string;
  snapshot: Omit<Trip, 'versions'>;
}
