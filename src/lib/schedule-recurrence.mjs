export function getRecurrenceDates(startDate, recurrence, timeZone) {
  if (
    !recurrence ||
    !["daily", "weekly", "monthly"].includes(recurrence.frequency) ||
    !Number.isInteger(recurrence.count) ||
    recurrence.count < 2 ||
    recurrence.count > 52
  ) {
    return [new Date(startDate)];
  }

  const start = getZonedParts(new Date(startDate), timeZone);
  return Array.from({ length: recurrence.count }, (_, index) => {
    if (index === 0) return new Date(startDate);
    const calendarDate = getOccurrenceDate(
      start,
      recurrence.frequency,
      recurrence.interval || 1,
      index
    );
    return zonedDateToUtc({
      ...calendarDate,
      hour: start.hour,
      minute: start.minute,
      second: start.second
    }, timeZone);
  });
}

function getOccurrenceDate(start, frequency, interval, index) {
  if (frequency === "monthly") {
    const monthIndex = start.month - 1 + index * interval;
    const year = start.year + Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { year, month, day: Math.min(start.day, lastDay) };
  }

  const dayOffset = index * interval * (frequency === "weekly" ? 7 : 1);
  const date = new Date(Date.UTC(start.year, start.month - 1, start.day + dayOffset));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function getZonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
}

function zonedDateToUtc(target, timeZone) {
  const targetTime = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
    target.second
  );
  let candidate = targetTime;
  let previous = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const actual = getZonedParts(new Date(candidate), timeZone);
    const actualTime = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second
    );
    const adjusted = candidate + targetTime - actualTime;
    if (adjusted === candidate) return new Date(candidate);
    if (adjusted === previous) return new Date(Math.max(candidate, adjusted));
    previous = candidate;
    candidate = adjusted;
  }
  return new Date(candidate);
}
