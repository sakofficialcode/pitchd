import type {
  AvailabilityMap,
  AvailabilityStatus,
  GroupConfig,
  MemberAvailability,
  ScheduleResult,
  ShiftAssignment,
  UnderstaffedRange,
} from './types.ts';

const MAX_SHIFT_MINUTES = 3 * 60;
const MIN_GAP_MINUTES = 30;

function toDateStr(d: Date): string {
  return (
    d.getUTCFullYear() +
    '-' +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getUTCDate()).padStart(2, '0')
  );
}

function slotKey(d: Date): string {
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  return `${toDateStr(d)}-${minutes}`;
}

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

// shiftStart/shiftEnd are naive "YYYY-MM-DDTHH:mm" strings with no timezone
// (from a <input type="datetime-local">) — they're wall-clock digits with no
// real-world zone attached. Parsing them as UTC (rather than `new Date(s)`,
// which resolves against whatever timezone the server process happens to
// run in) makes those digits round-trip unchanged through the generated
// ISO timestamps, so every viewer sees the same wall-clock hours regardless
// of the server's or their own browser's timezone.
function parseWallClock(s: string): Date {
  return new Date(`${s}:00.000Z`);
}

// Legacy saved data may still hold a raw boolean (`true` = unavailable);
// normalize it alongside the current 3-state representation.
function getStatus(availability: AvailabilityMap, key: string): AvailabilityStatus {
  const raw = availability[key] as unknown;
  if (raw === true) return 'unavailable';
  if (raw === false || raw === undefined) return 'available';
  return raw as AvailabilityStatus;
}

export function isNightSlot(
  slotStart: Date,
  nightShiftStart: number,
  nightShiftEnd: number
): boolean {
  const hour = slotStart.getUTCHours() + slotStart.getUTCMinutes() / 60;
  return nightShiftStart <= nightShiftEnd
    ? hour >= nightShiftStart && hour < nightShiftEnd
    : hour >= nightShiftStart || hour < nightShiftEnd;
}

interface MemberState {
  memberName: string;
  openStart: Date | null;
  slotsElapsed: number;
  lastSlotEnd: Date | null;
  cooldownUntil: Date | null; // null = never worked yet, i.e. always eligible
  totalMinutesWorked: number; // for fairness: least-loaded-first when starting new shifts
}

export function generateSchedule(
  config: GroupConfig,
  members: MemberAvailability[]
): ScheduleResult {
  const granularity = config.timeGranularity;
  const maxSlotsPerShift = Math.floor(MAX_SHIFT_MINUTES / granularity);
  const minGapSlots = Math.ceil(MIN_GAP_MINUTES / granularity);
  const minGapMinutes = minGapSlots * granularity;

  const start = parseWallClock(config.shiftStart);
  const end = parseWallClock(config.shiftEnd);

  const states = new Map<string, MemberState>(
    members.map((m) => [
      m.memberName,
      {
        memberName: m.memberName,
        openStart: null,
        slotsElapsed: 0,
        lastSlotEnd: null,
        cooldownUntil: null,
        totalMinutesWorked: 0,
      },
    ])
  );
  const availabilityByName = new Map(members.map((m) => [m.memberName, m.availability]));

  // How many consecutive slots (from `fromSlot`, capped at one shift's worth)
  // a member stays workable before hitting an 'unavailable' slot. Used to
  // break ties between equally-loaded candidates so a shift doesn't start
  // with whoever runs out of availability soonest, forcing a handoff a
  // fellow member could've avoided by just starting the shift themselves.
  const workableAheadCount = (memberName: string, fromSlot: Date): number => {
    const availability = availabilityByName.get(memberName)!;
    let count = 0;
    for (
      let s = new Date(fromSlot);
      s < end && count < maxSlotsPerShift;
      s = addMinutes(s, granularity)
    ) {
      if (getStatus(availability, slotKey(s)) === 'unavailable') break;
      count++;
    }
    return count;
  };

  const assignments: ShiftAssignment[] = [];
  const understaffedSlots: UnderstaffedRange[] = [];

  const closeShift = (state: MemberState) => {
    if (state.openStart && state.lastSlotEnd) {
      assignments.push({
        memberName: state.memberName,
        start: state.openStart.toISOString(),
        end: state.lastSlotEnd.toISOString(),
      });
      state.cooldownUntil = addMinutes(state.lastSlotEnd, minGapMinutes);
    }
    state.totalMinutesWorked += state.slotsElapsed * granularity;
    state.openStart = null;
    state.slotsElapsed = 0;
    state.lastSlotEnd = null;
  };

  for (let slotStart = new Date(start); slotStart < end; slotStart = addMinutes(slotStart, granularity)) {
    const slotEnd = addMinutes(slotStart, granularity);
    const key = slotKey(slotStart);

    const isNight =
      config.nightShifts &&
      config.nightShiftStart != null &&
      config.nightShiftEnd != null &&
      isNightSlot(slotStart, config.nightShiftStart, config.nightShiftEnd);

    const required = isNight ? config.nightOnShift ?? config.stdOnShift : config.stdOnShift;
    // Night hours are all-or-nothing: once someone is on a night shift, the
    // normal max-shift-length cap doesn't apply — they cover the whole
    // window rather than being capped and handed off mid-night.
    const effectiveMaxSlots = isNight ? Infinity : maxSlotsPerShift;

    const statusByName = new Map(
      members.map((m) => [m.memberName, getStatus(availabilityByName.get(m.memberName)!, key)])
    );
    // Workable = available or not_preferred; unavailable is a hard block.
    const workableNames = new Set(
      [...statusByName.entries()].filter(([, status]) => status !== 'unavailable').map(([name]) => name)
    );

    // Continuers: currently open, workable this slot, under the shift cap.
    const continuers = [...states.values()].filter(
      (s) => s.openStart !== null && workableNames.has(s.memberName) && s.slotsElapsed < effectiveMaxSlots
    );

    // Anyone open but not eligible to continue gets closed now.
    for (const state of states.values()) {
      if (state.openStart !== null && !continuers.includes(state)) {
        closeShift(state);
      }
    }

    let kept = continuers;
    if (continuers.length > required) {
      // Requirement dropped (e.g. night->day boundary) — keep the longest-running shifts.
      kept = [...continuers].sort((a, b) => b.slotsElapsed - a.slotsElapsed).slice(0, required);
      for (const state of continuers) {
        if (!kept.includes(state)) closeShift(state);
      }
    }

    const needed = required - kept.length;
    let newlyStarted: MemberState[] = [];
    if (needed > 0) {
      const eligible = [...states.values()].filter(
        (s) => s.openStart === null && workableNames.has(s.memberName) && !kept.includes(s)
      );

      // Least-total-time-worked-so-far wins ties, so hours even out across
      // the whole schedule regardless of how shift lengths vary.
      const byLoad = (a: MemberState, b: MemberState) => {
        if (a.totalMinutesWorked !== b.totalMinutesWorked) return a.totalMinutesWorked - b.totalMinutesWorked;
        // Equally loaded — prefer whoever can carry the shift furthest
        // before their availability runs out, ahead of rest cooldown.
        const aAhead = workableAheadCount(a.memberName, slotStart);
        const bAhead = workableAheadCount(b.memberName, slotStart);
        if (aAhead !== bAhead) return bAhead - aAhead;
        const at = a.cooldownUntil ? a.cooldownUntil.getTime() : -Infinity;
        const bt = b.cooldownUntil ? b.cooldownUntil.getTime() : -Infinity;
        if (at !== bt) return at - bt;
        return a.memberName.localeCompare(b.memberName);
      };

      const isPreferred = (s: MemberState) => statusByName.get(s.memberName) === 'available';

      // Splits a rest tier by preference — preferred members tried first,
      // not-preferred ones pulled in only as a fallback within that same
      // tier — so preference never gets to hop over the rest tier below.
      const byPreference = (pool: MemberState[]) => {
        const preferred = pool.filter(isPreferred).sort(byLoad);
        const notPreferred = pool.filter((s) => !isPreferred(s)).sort(byLoad);
        return [...preferred, ...notPreferred];
      };

      // Rest is the dominant axis, preference the tiebreak within it: a
      // fully-rested not-preferred member is tried before a preferred member
      // who's still owed rest. Otherwise a member marked not-preferred for a
      // window could be frozen out of the whole schedule by someone merely
      // "available" who's cycling in and out of the same slots on cooldown.
      // Resting candidates (of either preference) are used only as a last
      // resort, once every rested candidate is gone.
      const rested = eligible.filter((s) => s.cooldownUntil === null || s.cooldownUntil <= slotStart);
      const resting = eligible.filter((s) => s.cooldownUntil !== null && s.cooldownUntil > slotStart);

      newlyStarted = [...byPreference(rested), ...byPreference(resting)].slice(0, needed);
    }

    for (const state of kept) {
      state.slotsElapsed += 1;
      state.lastSlotEnd = slotEnd;
    }
    for (const state of newlyStarted) {
      state.openStart = slotStart;
      state.slotsElapsed = 1;
      state.lastSlotEnd = slotEnd;
    }

    const filled = kept.length + newlyStarted.length;
    if (filled < required) {
      understaffedSlots.push({
        start: slotStart.toISOString(),
        end: slotEnd.toISOString(),
        required,
        filled,
      });
    }
  }

  // Close any shifts still open at the end of the range.
  for (const state of states.values()) {
    closeShift(state);
  }

  assignments.sort((a, b) => a.start.localeCompare(b.start) || a.memberName.localeCompare(b.memberName));

  const understaffed: UnderstaffedRange[] = [];
  for (const slot of understaffedSlots) {
    const prev = understaffed[understaffed.length - 1];
    if (prev && prev.end === slot.start && prev.required === slot.required && prev.filled === slot.filled) {
      prev.end = slot.end;
    } else {
      understaffed.push({ ...slot });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    assignments,
    understaffed,
  };
}
