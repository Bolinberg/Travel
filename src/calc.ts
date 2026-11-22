import type { Category, Trip } from './types';
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

  byCategory.food +=
    (trip.food.adultPerDay * trip.adults + trip.food.childPerDay * trip.children) * trip.days.length;

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

