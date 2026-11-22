import type { Category, Day, Trip } from './types';
import { isDriveDay } from './route';

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${m}月${d}日 ${WEEKDAYS[dt.getUTCDay()]}`;
}

export function fuelCost(km: number, litresPer100km: number, price: number): number {
  return (km * litresPer100km * price) / 100;
}

export function money(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-AU');
}

export interface Summary {
  totalKm: number;
  driveHours: number;
  days: number;
  nights: number;
  people: number;
  byCategory: Record<Category, number>;
  total: number;
  paid: number;
  unpaid: number;
  perPerson: number;
  perDay: number;
  budgetLeft: number;
  unbooked: number;
}

export function summarize(trip: Trip): Summary {
  const byCategory: Record<Category, number> = {
    fuel: 0,
    accommodation: 0,
    food: 0,
    activity: 0,
    transport: 0,
    shopping: 0,
    other: 0,
  };
  let paid = 0;
  let unbooked = 0;

  const totalKm = trip.days.reduce((s, d) => s + (d.km || 0), 0);
  const driveHours = trip.days.reduce((s, d) => s + (d.driveHours || 0), 0);
  // 油费只算自驾的日子（步行、公交、飞机等不耗油）
  const driveKm = trip.days.filter(isDriveDay).reduce((s, d) => s + (d.km || 0), 0);
  byCategory.fuel = fuelCost(driveKm, trip.vehicle.litresPer100km, trip.vehicle.fuelPrice);

  let nights = 0;
  for (const d of trip.days) {
    if (!d.accommodation) continue;
    nights++;
    byCategory.accommodation += d.accommodation.cost || 0;
    if (d.accommodation.paid) paid += d.accommodation.cost || 0;
    if (!d.accommodation.booked) unbooked++;
  }

  // 每天餐饮：每日标准和当天已选餐厅（填了价格的）合计，取较大的那个，避免重复算
  for (const d of trip.days) byCategory.food += dayFood(trip, d);

  for (const e of trip.expenses) {
    byCategory[e.category] += e.amount || 0;
    if (e.paid) paid += e.amount || 0;
  }

  const total = Object.values(byCategory).reduce((s, v) => s + v, 0);
  const people = trip.adults + trip.children;
  return {
    totalKm,
    driveHours,
    days: trip.days.length,
    nights,
    people,
    byCategory,
    total,
    paid,
    unpaid: total - paid,
    perPerson: people ? total / people : 0,
    perDay: trip.days.length ? total / trip.days.length : 0,
    budgetLeft: trip.budget - total,
    unbooked,
  };
}

/** 每日餐饮标准（全家） */
export function foodStandard(trip: Trip): number {
  return trip.food.adultPerDay * trip.adults + trip.food.childPerDay * trip.children;
}

/** 当天已选餐厅（想去且填了价格）的合计 */
export function pickedDiningCost(d: Day): number {
  return (d.dining ?? []).filter((r) => r.picked && r.cost).reduce((n, r) => n + (r.cost || 0), 0);
}

/** 当天餐饮花费 = max(每日标准, 已选餐厅合计) */
export function dayFood(trip: Trip, d: Day): number {
  return Math.max(foodStandard(trip), pickedDiningCost(d));
}

/** 按天的花费：住宿、餐饮、油费、当天的门票交通等 */
export function dayCosts(trip: Trip) {
  return trip.days.map((d) => {
    const stay = d.accommodation?.cost || 0;
    const food = dayFood(trip, d);
    const fuel = isDriveDay(d) ? fuelCost(d.km || 0, trip.vehicle.litresPer100km, trip.vehicle.fuelPrice) : 0;
    const extras = trip.expenses.filter((e) => e.dayId === d.id).reduce((n, e) => n + (e.amount || 0), 0);
    return { stay, food, fuel, extras, total: stay + food + fuel + extras };
  });
}
