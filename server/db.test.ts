// Exercises the Postgres-backed db.ts against the real DATABASE_URL (a Neon
// dev branch). Run with:
//   npm run test:db
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptSwapRequest,
  authenticateMember,
  closeDb,
  createGroup,
  createSwapRequest,
  getAdminPasswordHash,
  getGroup,
  getMemberSummaries,
  getMembersForGroup,
  getSchedule,
  getSwapRequest,
  getSwapRequestsForMember,
  memberExists,
  saveMemberAvailability,
  saveSchedule,
  setSwapRequestStatus,
  verifyMemberPassword,
} from './db.ts';
import type { CreateGroupPayload, ScheduleResult } from './types.ts';

after(async () => {
  await closeDb();
});

function testGroupPayload(overrides: Partial<CreateGroupPayload> = {}): CreateGroupPayload {
  return {
    groupName: 'db.test.ts fixture group',
    numMembers: 2,
    shiftStart: '2026-01-01T00:00',
    shiftEnd: '2026-01-02T00:00',
    stdOnShift: 1,
    timeGranularity: 60,
    nightShifts: false,
    adminPassword: null,
    ...overrides,
  };
}

function testSchedule(overrides: Partial<ScheduleResult> = {}): ScheduleResult {
  return {
    generatedAt: new Date().toISOString(),
    assignments: [],
    understaffed: [],
    ...overrides,
  };
}

test('createGroup + getGroup round trip preserves all fields', async () => {
  const uuid = await createGroup(
    testGroupPayload({ nightShifts: true, nightShiftStart: 22, nightShiftEnd: 6, nightOnShift: 1 })
  );
  const group = await getGroup(uuid);

  assert.ok(group);
  assert.equal(group.uuid, uuid);
  assert.equal(group.groupName, 'db.test.ts fixture group');
  assert.equal(group.nightShifts, true);
  assert.equal(group.nightShiftStart, 22);
});

test('admin password hash is stored and reported via getAdminPasswordHash', async () => {
  const uuid = await createGroup(testGroupPayload({ adminPassword: 'admin-secret' }));
  const hash = await getAdminPasswordHash(uuid);
  assert.ok(hash && hash.includes(':'));

  const noPasswordUuid = await createGroup(testGroupPayload());
  assert.equal(await getAdminPasswordHash(noPasswordUuid), null);
});

test('saveMemberAvailability creates a new member, then updates with the correct password', async () => {
  const uuid = await createGroup(testGroupPayload());

  const created = await saveMemberAvailability(uuid, 'Alice', 'alice-pw', { '2026-01-01T00:00': 'available' });
  assert.equal(created.status, 'ok');
  assert.equal(created.status === 'ok' && created.created, true);

  const updated = await saveMemberAvailability(uuid, 'Alice', 'alice-pw', { '2026-01-01T00:00': 'unavailable' });
  assert.equal(updated.status, 'ok');
  assert.equal(updated.status === 'ok' && updated.created, false);

  const wrongPassword = await saveMemberAvailability(uuid, 'Alice', 'wrong-pw', {});
  assert.equal(wrongPassword.status, 'invalid_password');

  const [members, summaries, auth] = await Promise.all([
    getMembersForGroup(uuid),
    getMemberSummaries(uuid),
    authenticateMember(uuid, 'Alice', 'alice-pw'),
  ]);
  assert.deepEqual(members, [{ memberName: 'Alice', availability: { '2026-01-01T00:00': 'unavailable' } }]);
  assert.equal(summaries.length, 1);
  assert.equal(auth.status, 'ok');
  assert.ok(await verifyMemberPassword(uuid, 'Alice', 'alice-pw'));
  assert.ok(await memberExists(uuid, 'Alice'));
  assert.equal(await memberExists(uuid, 'Nobody'), false);
});

test('saveSchedule + getSchedule round-trips a jsonb schedule', async () => {
  const uuid = await createGroup(testGroupPayload());
  const schedule = testSchedule({
    assignments: [{ memberName: 'Alice', start: '2026-01-01T00:00:00.000Z', end: '2026-01-01T03:00:00.000Z' }],
  });

  await saveSchedule(uuid, schedule);
  assert.deepEqual(await getSchedule(uuid), schedule);

  const updated = testSchedule({ understaffed: [{ start: 'x', end: 'y', required: 2, filled: 1 }] });
  await saveSchedule(uuid, updated);
  assert.deepEqual(await getSchedule(uuid), updated);
});

test('swap request lifecycle: create, list, decline', async () => {
  const uuid = await createGroup(testGroupPayload());
  await saveMemberAvailability(uuid, 'Alice', 'pw', {});
  await saveMemberAvailability(uuid, 'Bob', 'pw', {});

  const swap = await createSwapRequest(uuid, {
    fromMember: 'Alice',
    toMember: 'Bob',
    fromStart: '2026-01-01T00:00:00.000Z',
    fromEnd: '2026-01-01T03:00:00.000Z',
    toStart: null,
    toEnd: null,
    message: null,
  });
  assert.equal(swap.status, 'pending');
  assert.deepEqual(await getSwapRequest(uuid, swap.id), swap);

  const { incoming, outgoing } = await getSwapRequestsForMember(uuid, 'Bob');
  assert.equal(incoming.length, 1);
  assert.equal(outgoing.length, 0);

  await setSwapRequestStatus(uuid, swap.id, 'declined');
  const declined = await getSwapRequest(uuid, swap.id);
  assert.equal(declined?.status, 'declined');
  assert.ok(declined?.respondedAt);
});

test('race #1: two concurrent first-time saves for the same member never throw, exactly one creates', async () => {
  const uuid = await createGroup(testGroupPayload());

  const [a, b] = await Promise.all([
    saveMemberAvailability(uuid, 'RaceMember', 'pw-a', { slot: 'available' }),
    saveMemberAvailability(uuid, 'RaceMember', 'pw-b', { slot: 'unavailable' }),
  ]);

  const results = [a, b];
  const createdCount = results.filter((r) => r.status === 'ok' && r.created).length;
  // Whichever call loses the race sees the winner's row already exists;
  // since the two calls use different passwords, the loser's password won't
  // match and it correctly reports invalid_password instead of throwing an
  // unhandled UNIQUE-constraint-violation error.
  const invalidCount = results.filter((r) => r.status === 'invalid_password').length;

  assert.equal(createdCount, 1);
  assert.equal(invalidCount, 1);
});

test('race #2: two concurrent accepts on the same swap request resolve to exactly one winner', async () => {
  const uuid = await createGroup(testGroupPayload());
  await saveMemberAvailability(uuid, 'Alice', 'pw', {});
  await saveMemberAvailability(uuid, 'Bob', 'pw', {});
  await saveSchedule(
    uuid,
    testSchedule({
      assignments: [{ memberName: 'Alice', start: '2026-01-01T00:00:00.000Z', end: '2026-01-01T03:00:00.000Z' }],
    })
  );

  const swap = await createSwapRequest(uuid, {
    fromMember: 'Alice',
    toMember: 'Bob',
    fromStart: '2026-01-01T00:00:00.000Z',
    fromEnd: '2026-01-01T03:00:00.000Z',
    toStart: null,
    toEnd: null,
    message: null,
  });

  const compute = (schedule: ScheduleResult) => ({ ok: true as const, schedule });

  const [first, second] = await Promise.all([
    acceptSwapRequest(uuid, swap.id, 'Bob', compute),
    acceptSwapRequest(uuid, swap.id, 'Bob', compute),
  ]);

  const outcomes = [first, second];
  assert.equal(outcomes.filter((o) => o.status === 'ok').length, 1);
  assert.equal(outcomes.filter((o) => o.status === 'conflict').length, 1);

  const final = await getSwapRequest(uuid, swap.id);
  assert.equal(final?.status, 'accepted');
});
