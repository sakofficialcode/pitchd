import { Router } from 'express';
import { verifyPassword } from './auth.ts';
import {
  acceptSwapRequest,
  authenticateMember,
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
import { generateSchedule } from './scheduler.ts';
import { applySwap } from './swaps.ts';
import type { CreateGroupPayload } from './types.ts';

export const router = Router();

router.post('/groups', async (req, res) => {
  const body = req.body as Partial<CreateGroupPayload>;

  if (
    !body.groupName ||
    !body.numMembers ||
    !body.shiftStart ||
    !body.shiftEnd ||
    !body.stdOnShift ||
    !body.timeGranularity
  ) {
    res.status(400).json({ error: 'Missing required group fields' });
    return;
  }

  const uuid = await createGroup(body as CreateGroupPayload);
  res.status(201).json({ uuid });
});

router.get('/groups/:uuid', async (req, res) => {
  const group = await getGroup(req.params.uuid);
  if (!group) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }

  const adminHash = await getAdminPasswordHash(req.params.uuid);
  res.json({
    ...group,
    hasAdminPassword: Boolean(adminHash),
    members: await getMemberSummaries(req.params.uuid),
  });
});

router.post('/groups/:uuid/members/:memberName/login', async (req, res) => {
  const group = await getGroup(req.params.uuid);
  if (!group) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }

  const password = req.body?.password;
  if (typeof password !== 'string' || !password) {
    res.status(400).json({ error: 'password is required' });
    return;
  }

  const result = await authenticateMember(req.params.uuid, req.params.memberName, password);
  if (result.status === 'not_found') {
    res.status(404).json({ error: 'No account with that name yet' });
    return;
  }
  if (result.status === 'invalid_password') {
    res.status(401).json({ error: 'Incorrect password' });
    return;
  }

  res.json({ memberName: req.params.memberName, availability: result.availability, updatedAt: result.updatedAt });
});

router.put('/groups/:uuid/members/:memberName', async (req, res) => {
  const group = await getGroup(req.params.uuid);
  if (!group) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }

  const availability = req.body?.availability;
  if (typeof availability !== 'object' || availability === null) {
    res.status(400).json({ error: 'availability must be an object' });
    return;
  }

  const password = req.body?.password;
  if (typeof password !== 'string' || !password) {
    res.status(400).json({ error: 'password is required' });
    return;
  }

  const result = await saveMemberAvailability(req.params.uuid, req.params.memberName, password, availability);
  if (result.status === 'invalid_password') {
    res.status(401).json({ error: 'Incorrect password' });
    return;
  }

  res.json({ memberName: req.params.memberName, updatedAt: result.updatedAt, created: result.created });
});

async function checkAdminPassword(uuid: string, password: string | null | undefined): Promise<boolean> {
  const hash = await getAdminPasswordHash(uuid);
  if (!hash) return true; // no password set — endpoint is open
  return typeof password === 'string' && verifyPassword(password, hash);
}

router.post('/groups/:uuid/schedule/generate', async (req, res) => {
  const group = await getGroup(req.params.uuid);
  if (!group) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }

  if (!(await checkAdminPassword(req.params.uuid, req.body?.adminPassword))) {
    res.status(403).json({ error: 'Incorrect admin password' });
    return;
  }

  const members = await getMembersForGroup(req.params.uuid);
  const result = generateSchedule(group, members);
  await saveSchedule(req.params.uuid, result);
  res.json(result);
});

router.post('/groups/:uuid/schedule/view', async (req, res) => {
  const group = await getGroup(req.params.uuid);
  if (!group) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }

  if (!(await checkAdminPassword(req.params.uuid, req.body?.adminPassword))) {
    res.status(403).json({ error: 'Incorrect admin password' });
    return;
  }

  const result = await getSchedule(req.params.uuid);
  if (!result) {
    res.status(404).json({ error: 'No schedule generated yet' });
    return;
  }

  res.json(result);
});

// Members authenticate with their own name+password (not the admin
// password) to view the schedule — anyone with the group link but no
// account still can't see it.
router.post('/groups/:uuid/schedule/view-as-member', async (req, res) => {
  const group = await getGroup(req.params.uuid);
  if (!group) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }

  const { memberName, password } = req.body ?? {};
  if (typeof memberName !== 'string' || typeof password !== 'string' || !memberName || !password) {
    res.status(400).json({ error: 'memberName and password are required' });
    return;
  }

  if (!(await verifyMemberPassword(req.params.uuid, memberName, password))) {
    res.status(401).json({ error: 'Incorrect name or password' });
    return;
  }

  const result = await getSchedule(req.params.uuid);
  if (!result) {
    res.status(404).json({ error: 'No schedule generated yet' });
    return;
  }

  res.json(result);
});

function findAssignmentRange(
  assignments: { memberName: string; start: string; end: string }[],
  memberName: string,
  rangeStart: string,
  rangeEnd: string
): boolean {
  const startMs = new Date(rangeStart).getTime();
  const endMs = new Date(rangeEnd).getTime();
  if (!(startMs < endMs)) return false;
  return assignments.some(
    (a) =>
      a.memberName === memberName &&
      new Date(a.start).getTime() <= startMs &&
      new Date(a.end).getTime() >= endMs
  );
}

router.post('/groups/:uuid/swap-requests', async (req, res) => {
  const group = await getGroup(req.params.uuid);
  if (!group) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }

  const { fromMember, fromPassword, toMember, fromStart, fromEnd, toStart, toEnd, message } = req.body ?? {};
  if (
    typeof fromMember !== 'string' ||
    typeof fromPassword !== 'string' ||
    typeof toMember !== 'string' ||
    typeof fromStart !== 'string' ||
    typeof fromEnd !== 'string' ||
    !fromMember ||
    !toMember ||
    !fromStart ||
    !fromEnd
  ) {
    res.status(400).json({ error: 'fromMember, fromPassword, toMember, fromStart, and fromEnd are required' });
    return;
  }

  if (fromMember === toMember) {
    res.status(400).json({ error: 'Cannot request a swap with yourself' });
    return;
  }

  if (!(await verifyMemberPassword(req.params.uuid, fromMember, fromPassword))) {
    res.status(401).json({ error: 'Incorrect name or password' });
    return;
  }

  if (!(await memberExists(req.params.uuid, toMember))) {
    res.status(404).json({ error: 'No member with that name' });
    return;
  }

  const schedule = await getSchedule(req.params.uuid);
  if (!schedule) {
    res.status(404).json({ error: 'No schedule generated yet' });
    return;
  }

  if (!findAssignmentRange(schedule.assignments, fromMember, fromStart, fromEnd)) {
    res.status(400).json({ error: 'That time range is not part of one of your shifts' });
    return;
  }

  const hasToRange = typeof toStart === 'string' && typeof toEnd === 'string' && toStart && toEnd;
  if (hasToRange && !findAssignmentRange(schedule.assignments, toMember, toStart, toEnd)) {
    res.status(400).json({ error: 'That time range is not part of one of their shifts' });
    return;
  }

  const swapRequest = await createSwapRequest(req.params.uuid, {
    fromMember,
    toMember,
    fromStart,
    fromEnd,
    toStart: hasToRange ? toStart : null,
    toEnd: hasToRange ? toEnd : null,
    message: typeof message === 'string' && message.trim() ? message.trim() : null,
  });

  res.status(201).json(swapRequest);
});

router.post('/groups/:uuid/swap-requests/list', async (req, res) => {
  const group = await getGroup(req.params.uuid);
  if (!group) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }

  const { memberName, password } = req.body ?? {};
  if (typeof memberName !== 'string' || typeof password !== 'string' || !memberName || !password) {
    res.status(400).json({ error: 'memberName and password are required' });
    return;
  }

  if (!(await verifyMemberPassword(req.params.uuid, memberName, password))) {
    res.status(401).json({ error: 'Incorrect name or password' });
    return;
  }

  res.json(await getSwapRequestsForMember(req.params.uuid, memberName));
});

router.post('/groups/:uuid/swap-requests/:id/respond', async (req, res) => {
  const group = await getGroup(req.params.uuid);
  if (!group) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }

  const { memberName, password, accept } = req.body ?? {};
  if (typeof memberName !== 'string' || typeof password !== 'string' || typeof accept !== 'boolean' || !memberName || !password) {
    res.status(400).json({ error: 'memberName, password, and accept are required' });
    return;
  }

  if (!(await verifyMemberPassword(req.params.uuid, memberName, password))) {
    res.status(401).json({ error: 'Incorrect name or password' });
    return;
  }

  const id = Number(req.params.id);
  const swapRequest = await getSwapRequest(req.params.uuid, id);
  if (!swapRequest) {
    res.status(404).json({ error: 'Swap request not found' });
    return;
  }

  if (swapRequest.toMember !== memberName) {
    res.status(403).json({ error: 'Only the requested member can respond to this request' });
    return;
  }

  if (swapRequest.status !== 'pending') {
    res.status(409).json({ error: 'This request has already been responded to' });
    return;
  }

  if (!accept) {
    await setSwapRequestStatus(req.params.uuid, id, 'declined');
    res.json({ swapRequest: await getSwapRequest(req.params.uuid, id) });
    return;
  }

  // acceptSwapRequest locks the swap-request and schedule rows for the
  // duration of this transaction, so a concurrent second response to the
  // same or an overlapping swap can't race the read-modify-write below —
  // it blocks on the lock and then correctly sees the up-to-date status.
  const outcome = await acceptSwapRequest(req.params.uuid, id, memberName, (schedule, swap) => {
    const result = applySwap(schedule.assignments, {
      fromMember: swap.fromMember,
      fromStart: swap.fromStart,
      fromEnd: swap.fromEnd,
      toMember: swap.toMember,
      toStart: swap.toStart,
      toEnd: swap.toEnd,
    });

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    const assignments = [...result.assignments].sort(
      (a, b) => a.start.localeCompare(b.start) || a.memberName.localeCompare(b.memberName)
    );
    return { ok: true, schedule: { ...schedule, assignments } };
  });

  switch (outcome.status) {
    case 'not_found':
      res.status(404).json({ error: 'Swap request not found' });
      return;
    case 'forbidden':
      res.status(403).json({ error: 'Only the requested member can respond to this request' });
      return;
    case 'no_schedule':
      res.status(404).json({ error: 'No schedule generated yet' });
      return;
    case 'conflict':
      res.status(409).json({ error: outcome.message });
      return;
    case 'ok':
      res.json({ swapRequest: outcome.swapRequest, schedule: outcome.schedule });
      return;
  }
});
