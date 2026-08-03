import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSchedule, isNightSlot } from './scheduler.ts';
import type { GroupConfig, MemberAvailability } from './types.ts';

function baseConfig(overrides: Partial<GroupConfig>): GroupConfig {
  return {
    uuid: 'test-group',
    groupName: 'Test Group',
    numMembers: 1,
    shiftStart: '2026-01-01T00:00',
    shiftEnd: '2026-01-01T00:00',
    stdOnShift: 1,
    timeGranularity: 60,
    nightShifts: false,
    nightShiftStart: null,
    nightShiftEnd: null,
    nightOnShift: null,
    ...overrides,
  };
}

test('sole coverage: rest is waived rather than leaving a gap when no one else is available', () => {
  // 7h window, 3h cap: expect three contiguous chunks (3h, 3h, 1h) with zero rest between
  // them, since Alice is the only available person the whole time.
  const config = baseConfig({
    shiftStart: '2026-01-01T00:00',
    shiftEnd: '2026-01-01T07:00',
    stdOnShift: 1,
    timeGranularity: 60,
  });
  const members: MemberAvailability[] = [{ memberName: 'Alice', availability: {} }];

  const result = generateSchedule(config, members);

  assert.equal(result.assignments.length, 3);
  assert.equal(result.assignments[0].start, new Date('2026-01-01T00:00').toISOString());
  assert.equal(result.assignments[0].end, new Date('2026-01-01T03:00').toISOString());
  assert.equal(result.assignments[1].start, new Date('2026-01-01T03:00').toISOString());
  assert.equal(result.assignments[1].end, new Date('2026-01-01T06:00').toISOString());
  assert.equal(result.assignments[2].start, new Date('2026-01-01T06:00').toISOString());
  assert.equal(result.assignments[2].end, new Date('2026-01-01T07:00').toISOString());

  assert.equal(result.understaffed.length, 0);
});

test('rest is still preferred when someone else can cover the slot', () => {
  // X caps out at 3h; Y is rested and available for the rest of the window, so Y should be
  // picked over forcing X back in early, even though X could technically fall back.
  const config = baseConfig({
    shiftStart: '2026-01-01T00:00',
    shiftEnd: '2026-01-01T04:00',
    stdOnShift: 1,
    timeGranularity: 60,
  });
  const key = (hour: number) => `2026-01-01-${hour * 60}`;
  const members: MemberAvailability[] = [
    { memberName: 'X', availability: {} }, // available all 4 hours
    { memberName: 'Y', availability: { [key(0)]: true, [key(1)]: true, [key(2)]: true } }, // available from hour 3 only
  ];

  const result = generateSchedule(config, members);

  const byName = (name: string) => result.assignments.filter((a) => a.memberName === name);

  assert.equal(byName('X').length, 1);
  assert.equal(byName('X')[0].start, new Date('2026-01-01T00:00').toISOString());
  assert.equal(byName('X')[0].end, new Date('2026-01-01T03:00').toISOString());

  assert.equal(byName('Y').length, 1);
  assert.equal(byName('Y')[0].start, new Date('2026-01-01T03:00').toISOString());
  assert.equal(byName('Y')[0].end, new Date('2026-01-01T04:00').toISOString());

  assert.equal(result.understaffed.length, 0);
});

test('night/day boundary: headcount drops and night is one unbroken block past the 3h cap', () => {
  const config = baseConfig({
    shiftStart: '2026-01-01T20:00',
    shiftEnd: '2026-01-02T02:00',
    stdOnShift: 2,
    timeGranularity: 60,
    nightShifts: true,
    nightShiftStart: 22,
    nightShiftEnd: 6,
    nightOnShift: 1,
  });
  const members: MemberAvailability[] = [
    { memberName: 'A', availability: {} },
    { memberName: 'B', availability: {} },
  ];

  const result = generateSchedule(config, members);

  const aShifts = result.assignments.filter((a) => a.memberName === 'A');
  const bShifts = result.assignments.filter((a) => a.memberName === 'B');

  // Both start together at 20:00. At the day->night boundary (22:00) headcount drops to 1
  // and B (the shorter-running of the two) is trimmed there. Night hours are all-or-nothing,
  // so the normal 3h cap doesn't apply once A is in the night window — A covers the entire
  // rest of the window uninterrupted, and B never resumes since the night only needs one
  // person the whole time.
  assert.equal(aShifts.length, 1);
  assert.equal(aShifts[0].start, new Date('2026-01-01T20:00').toISOString());
  assert.equal(aShifts[0].end, new Date('2026-01-02T02:00').toISOString());

  assert.equal(bShifts.length, 1);
  assert.equal(bShifts[0].start, new Date('2026-01-01T20:00').toISOString());
  assert.equal(bShifts[0].end, new Date('2026-01-01T22:00').toISOString());

  assert.equal(result.understaffed.length, 0);
});

test('headcount-drop trim keeps the longest-running shifts', () => {
  const config = baseConfig({
    shiftStart: '2026-01-01T18:00',
    shiftEnd: '2026-01-01T20:00',
    stdOnShift: 3,
    timeGranularity: 30,
    nightShifts: true,
    nightShiftStart: 19.5,
    nightShiftEnd: 6,
    nightOnShift: 1,
  });

  const key = (hour: number, minute: number) => `2026-01-01-${hour * 60 + minute}`;
  const members: MemberAvailability[] = [
    { memberName: 'C1', availability: {} }, // available from 18:00 (3 slots by 19:30)
    { memberName: 'C2', availability: { [key(18, 0)]: true } }, // available from 18:30 (2 slots)
    { memberName: 'C3', availability: { [key(18, 0)]: true, [key(18, 30)]: true } }, // available from 19:00 (1 slot)
  ];

  const result = generateSchedule(config, members);

  const byName = (name: string) => result.assignments.filter((a) => a.memberName === name);

  assert.equal(byName('C1').length, 1);
  assert.equal(byName('C1')[0].start, new Date('2026-01-01T18:00').toISOString());
  assert.equal(byName('C1')[0].end, new Date('2026-01-01T20:00').toISOString());

  assert.equal(byName('C2').length, 1);
  assert.equal(byName('C2')[0].start, new Date('2026-01-01T18:30').toISOString());
  assert.equal(byName('C2')[0].end, new Date('2026-01-01T19:30').toISOString());

  assert.equal(byName('C3').length, 1);
  assert.equal(byName('C3')[0].start, new Date('2026-01-01T19:00').toISOString());
  assert.equal(byName('C3')[0].end, new Date('2026-01-01T19:30').toISOString());
});

test('understaffed detection when required headcount cannot be met', () => {
  const config = baseConfig({
    shiftStart: '2026-01-01T00:00',
    shiftEnd: '2026-01-01T01:00',
    stdOnShift: 2,
    timeGranularity: 60,
  });
  const members: MemberAvailability[] = [{ memberName: 'D', availability: {} }];

  const result = generateSchedule(config, members);

  assert.equal(result.assignments.length, 1);
  assert.equal(result.understaffed.length, 1);
  assert.equal(result.understaffed[0].required, 2);
  assert.equal(result.understaffed[0].filled, 1);
});

test('not-preferred member is pulled in as a fallback to avoid understaffing', () => {
  const config = baseConfig({
    shiftStart: '2026-01-01T00:00',
    shiftEnd: '2026-01-01T01:00',
    stdOnShift: 2,
    timeGranularity: 60,
  });
  const key = (hour: number) => `2026-01-01-${hour * 60}`;
  const members: MemberAvailability[] = [
    { memberName: 'Avail', availability: {} },
    { memberName: 'NotPref', availability: { [key(0)]: 'not_preferred' } },
  ];

  const result = generateSchedule(config, members);

  const byName = (name: string) => result.assignments.filter((a) => a.memberName === name);
  assert.equal(byName('Avail').length, 1);
  assert.equal(byName('NotPref').length, 1);
  assert.equal(result.understaffed.length, 0);
});

test('not-preferred member is skipped when an available member can cover the slot', () => {
  const config = baseConfig({
    shiftStart: '2026-01-01T00:00',
    shiftEnd: '2026-01-01T01:00',
    stdOnShift: 1,
    timeGranularity: 60,
  });
  const key = (hour: number) => `2026-01-01-${hour * 60}`;
  const members: MemberAvailability[] = [
    { memberName: 'NotPref', availability: { [key(0)]: 'not_preferred' } },
    { memberName: 'Avail', availability: {} },
  ];

  const result = generateSchedule(config, members);

  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0].memberName, 'Avail');
});

test('workload fairness: least-total-time-worked wins over alphabetical order once both are rested', () => {
  // 6h window, 1h shifts, 1 required per hour.
  // hour0: Bob only available -> Bob works 1h, then goes unavailable and rests.
  // hour1-3: Alice only available -> Alice works 3h (hits the cap), then rests.
  // hour4: both unavailable (a throwaway gap slot so both cooldowns clear).
  // hour5: both available and both fully rested -> Bob (60 min worked) should
  // be picked over Alice (180 min worked), even though 'Alice' < 'Bob' alphabetically.
  const config = baseConfig({
    shiftStart: '2026-01-01T00:00',
    shiftEnd: '2026-01-01T06:00',
    stdOnShift: 1,
    timeGranularity: 60,
  });
  const key = (hour: number) => `2026-01-01-${hour * 60}`;
  const members: MemberAvailability[] = [
    {
      memberName: 'Alice',
      availability: { [key(0)]: 'unavailable', [key(4)]: 'unavailable' },
    },
    {
      memberName: 'Bob',
      availability: {
        [key(1)]: 'unavailable',
        [key(2)]: 'unavailable',
        [key(3)]: 'unavailable',
        [key(4)]: 'unavailable',
      },
    },
  ];

  const result = generateSchedule(config, members);

  const byName = (name: string) => result.assignments.filter((a) => a.memberName === name);

  assert.equal(byName('Bob').length, 2);
  assert.equal(byName('Bob')[0].start, new Date('2026-01-01T00:00').toISOString());
  assert.equal(byName('Bob')[0].end, new Date('2026-01-01T01:00').toISOString());
  assert.equal(byName('Bob')[1].start, new Date('2026-01-01T05:00').toISOString());
  assert.equal(byName('Bob')[1].end, new Date('2026-01-01T06:00').toISOString());

  assert.equal(byName('Alice').length, 1);
  assert.equal(byName('Alice')[0].start, new Date('2026-01-01T01:00').toISOString());
  assert.equal(byName('Alice')[0].end, new Date('2026-01-01T04:00').toISOString());

  assert.equal(result.understaffed.length, 1);
  assert.equal(result.understaffed[0].start, new Date('2026-01-01T04:00').toISOString());
  assert.equal(result.understaffed[0].end, new Date('2026-01-01T05:00').toISOString());
});

test('shift-start tiebreak: equally-loaded candidate who can stay longer is preferred over one who hands off almost immediately', () => {
  // 1.5h window, 30-min slots, 1 required. Johnny and Tommy are both fresh
  // (0 minutes worked, never rested) at 6:30, so the old alphabetical/load
  // tiebreak would pick between them arbitrarily. Johnny's availability
  // drops off after the first slot; Tommy stays available the whole window.
  // Starting Johnny would force a handoff to Tommy at 7:00 after only 30
  // minutes — starting Tommy directly at 6:30 avoids that entirely.
  const config = baseConfig({
    shiftStart: '2026-01-01T06:30',
    shiftEnd: '2026-01-01T08:00',
    stdOnShift: 1,
    timeGranularity: 30,
  });
  const key = (hour: number, minute: number) => `2026-01-01-${hour * 60 + minute}`;
  const members: MemberAvailability[] = [
    {
      memberName: 'Johnny',
      availability: { [key(7, 0)]: 'unavailable', [key(7, 30)]: 'unavailable' },
    },
    { memberName: 'Tommy', availability: {} },
  ];

  const result = generateSchedule(config, members);

  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0].memberName, 'Tommy');
  assert.equal(result.assignments[0].start, new Date('2026-01-01T06:30').toISOString());
  assert.equal(result.assignments[0].end, new Date('2026-01-01T08:00').toISOString());
  assert.equal(result.understaffed.length, 0);
});

test('night-window wraparound classification (22 -> 6)', () => {
  const hour = (h: number) => new Date(2026, 0, 1, h, 0);
  assert.equal(isNightSlot(hour(23), 22, 6), true);
  assert.equal(isNightSlot(hour(2), 22, 6), true);
  assert.equal(isNightSlot(hour(12), 22, 6), false);
});
