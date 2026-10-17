import assert from "node:assert/strict";
import test from "node:test";
import { getRecurrenceDates } from "./schedule-recurrence.mjs";

function localParts(date, timeZone) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
}

test("weekly recurrences preserve local wall time across daylight-saving transitions", () => {
  const dates = getRecurrenceDates(
    new Date("2027-03-07T14:00:00.000Z"),
    { frequency: "weekly", interval: 1, count: 3 },
    "America/New_York"
  );
  assert.deepEqual(dates.map((date) => localParts(date, "America/New_York").hour), ["09", "09", "09"]);
  assert.equal((dates[1] - dates[0]) / 3_600_000, 167);
  assert.equal((dates[2] - dates[1]) / 3_600_000, 168);
});

test("monthly recurrences clamp to the last calendar day of shorter months", () => {
  const dates = getRecurrenceDates(
    new Date("2027-01-31T09:00:00.000Z"),
    { frequency: "monthly", interval: 1, count: 3 },
    "UTC"
  );
  assert.deepEqual(
    dates.map((date) => `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`),
    ["2027-1-31", "2027-2-28", "2027-3-31"]
  );
});

test("a local time skipped by spring daylight-saving moves forward to the next valid time", () => {
  const dates = getRecurrenceDates(
    new Date("2027-02-14T07:30:00.000Z"),
    { frequency: "monthly", interval: 1, count: 2 },
    "America/New_York"
  );
  const march = localParts(dates[1], "America/New_York");
  assert.equal(march.month, "03");
  assert.equal(march.day, "14");
  assert.equal(march.hour, "03");
  assert.equal(march.minute, "30");
});
