export const MANILA_TIMEZONE = "Asia/Manila";
export const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const SHORT_WEEKDAYS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

export interface ManilaDateParts {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
  hour: number; // 0..23
  minute: number; // 0..59
  second: number; // 0..59
  weekday: number; // 0 (Sun)..6 (Sat)
  isoWeekday: number; // 1 (Mon)..7 (Sun)
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

export function getManilaParts(date: Date): ManilaDateParts {
  const shifted = new Date(date.getTime() + MANILA_OFFSET_MS);
  const weekday = shifted.getUTCDay();
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    weekday,
    isoWeekday: weekday === 0 ? 7 : weekday,
  };
}

export function fromManilaParts(parts: {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
}): Date {
  const utcMs =
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour ?? 0,
      parts.minute ?? 0,
      parts.second ?? 0,
      0,
    ) - MANILA_OFFSET_MS;
  return new Date(utcMs);
}

export function parseDateKey(dateKey: string): {
  year: number;
  month: number;
  day: number;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) {
    throw new Error(`Invalid dateKey: ${dateKey}`);
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export function getManilaDateKey(date: Date): string {
  const p = getManilaParts(date);
  return `${pad4(p.year)}-${pad2(p.month)}-${pad2(p.day)}`;
}

export function getManilaWeekdayFromDateKey(dateKey: string): number {
  const { year, month, day } = parseDateKey(dateKey);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function addManilaDays(dateKey: string, deltaDays: number): string {
  const { year, month, day } = parseDateKey(dateKey);
  const target = new Date(Date.UTC(year, month - 1, day) + deltaDays * DAY_MS);
  return `${pad4(target.getUTCFullYear())}-${pad2(target.getUTCMonth() + 1)}-${pad2(target.getUTCDate())}`;
}

export function getManilaDateKeysBack(endDate: Date, count: number): string[] {
  const todayKey = getManilaDateKey(endDate);
  const keys: string[] = [];
  for (let offset = -(count - 1); offset <= 0; offset += 1) {
    keys.push(addManilaDays(todayKey, offset));
  }
  return keys;
}

export function getManilaIsoWeekKey(date: Date): string {
  const { year, month, day } = getManilaParts(date);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const isoDay = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - isoDay);
  const isoYear = utcDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const weekNumber = Math.ceil(
    ((utcDate.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7,
  );
  return `${isoYear}-W${pad2(weekNumber)}`;
}

export function getSlotScheduledAt(
  dateKey: string,
  hour: number,
  minute: number,
): Date {
  const { year, month, day } = parseDateKey(dateKey);
  return fromManilaParts({ year, month, day, hour, minute, second: 0 });
}

export function isWithinEarlyFeedWindow(
  now: Date,
  scheduledAt: Date,
  earlyWindowMinutes: number = 90,
): boolean {
  return now.getTime() >= scheduledAt.getTime() - earlyWindowMinutes * 60_000;
}

export function clampToQuietHours(candidate: Date): Date {
  const parts = getManilaParts(candidate);
  if (parts.hour < 9) {
    return fromManilaParts({
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: 9,
      minute: 0,
      second: 0,
    });
  }
  if (parts.hour >= 20) {
    const nextDateKey = addManilaDays(getManilaDateKey(candidate), 1);
    return getSlotScheduledAt(nextDateKey, 9, 0);
  }
  return new Date(candidate.getTime());
}

export function formatManilaHourMinuteLabel(hour: number, minute: number): string {
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${pad2(minute)} ${suffix}`;
}

export function formatManilaTimeLabel(date: Date): string {
  const parts = getManilaParts(date);
  return formatManilaHourMinuteLabel(parts.hour, parts.minute);
}

export function formatManilaShortDate(dateKey: string): string {
  const { month, day } = parseDateKey(dateKey);
  return `${SHORT_MONTHS[month - 1]} ${day}`;
}

export function formatManilaWeekday(dateKey: string): string {
  const weekday = getManilaWeekdayFromDateKey(dateKey);
  return SHORT_WEEKDAYS[weekday];
}

export function formatManilaDateLabel(date: Date): string {
  const key = getManilaDateKey(date);
  return `${formatManilaWeekday(key)}, ${formatManilaShortDate(key)}`;
}

export function formatManilaIso(date: Date): string {
  const shifted = new Date(date.getTime() + MANILA_OFFSET_MS);
  const ms = String(shifted.getUTCMilliseconds()).padStart(3, "0");
  return `${pad4(shifted.getUTCFullYear())}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}T${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}:${pad2(shifted.getUTCSeconds())}.${ms}+08:00`;
}

export function formatManilaRelativeLabel(target: Date, now: Date): string {
  const targetKey = getManilaDateKey(target);
  const nowKey = getManilaDateKey(now);
  const timeStr = formatManilaTimeLabel(target);
  if (targetKey === nowKey) {
    return `Today, ${timeStr}`;
  }
  if (targetKey === addManilaDays(nowKey, -1)) {
    return `Yesterday, ${timeStr}`;
  }
  if (targetKey === addManilaDays(nowKey, 1)) {
    return `Tomorrow, ${timeStr}`;
  }
  return `${formatManilaShortDate(targetKey)}, ${timeStr}`;
}
