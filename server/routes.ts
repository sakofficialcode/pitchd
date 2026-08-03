import { Router } from 'express';
import { verifyPassword } from './auth.ts';
import {
  authenticateMember,
  createGroup,
  getAdminPasswordHash,
  getGroup,
  getMemberSummaries,
  getMembersForGroup,
  getSchedule,
  saveMemberAvailability,
  saveSchedule,
} from './db.ts';
import { generateSchedule } from './scheduler.ts';
import type { CreateGroupPayload } from './types.ts';

export const router = Router();

router.post('/groups', (req, res) => {
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

  const uuid = createGroup(body as CreateGroupPayload);
  res.status(201).json({ uuid });
});

router.get('/groups/:uuid', (req, res) => {
  const group = getGroup(req.params.uuid);
  if (!group) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }

  const adminHash = getAdminPasswordHash(req.params.uuid);
  res.json({
    ...group,
    hasAdminPassword: Boolean(adminHash),
    members: getMemberSummaries(req.params.uuid),
  });
});

router.post('/groups/:uuid/members/:memberName/login', (req, res) => {
  const group = getGroup(req.params.uuid);
  if (!group) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }

  const password = req.body?.password;
  if (typeof password !== 'string' || !password) {
    res.status(400).json({ error: 'password is required' });
    return;
  }

  const result = authenticateMember(req.params.uuid, req.params.memberName, password);
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

router.put('/groups/:uuid/members/:memberName', (req, res) => {
  const group = getGroup(req.params.uuid);
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

  const result = saveMemberAvailability(req.params.uuid, req.params.memberName, password, availability);
  if (result.status === 'invalid_password') {
    res.status(401).json({ error: 'Incorrect password' });
    return;
  }

  res.json({ memberName: req.params.memberName, updatedAt: result.updatedAt, created: result.created });
});

function checkAdminPassword(uuid: string, password: string | null | undefined): boolean {
  const hash = getAdminPasswordHash(uuid);
  if (!hash) return true; // no password set — endpoint is open
  return typeof password === 'string' && verifyPassword(password, hash);
}

router.post('/groups/:uuid/schedule/generate', (req, res) => {
  const group = getGroup(req.params.uuid);
  if (!group) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }

  if (!checkAdminPassword(req.params.uuid, req.body?.adminPassword)) {
    res.status(403).json({ error: 'Incorrect admin password' });
    return;
  }

  const members = getMembersForGroup(req.params.uuid);
  const result = generateSchedule(group, members);
  saveSchedule(req.params.uuid, result);
  res.json(result);
});

router.post('/groups/:uuid/schedule/view', (req, res) => {
  const group = getGroup(req.params.uuid);
  if (!group) {
    res.status(404).json({ error: 'Group not found' });
    return;
  }

  if (!checkAdminPassword(req.params.uuid, req.body?.adminPassword)) {
    res.status(403).json({ error: 'Incorrect admin password' });
    return;
  }

  const result = getSchedule(req.params.uuid);
  if (!result) {
    res.status(404).json({ error: 'No schedule generated yet' });
    return;
  }

  res.json(result);
});
