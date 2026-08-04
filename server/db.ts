import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword, verifyPassword } from './auth.ts';
import type {
  AvailabilityMap,
  CreateGroupPayload,
  GroupConfig,
  MemberAvailability,
  ScheduleResult,
  SwapRequest,
  SwapStatus,
} from './types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, 'data');
mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, 'pitchd.sqlite3'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS groups (
    id                  TEXT PRIMARY KEY,
    group_name          TEXT NOT NULL,
    num_members         INTEGER NOT NULL,
    shift_start         TEXT NOT NULL,
    shift_end           TEXT NOT NULL,
    std_on_shift        INTEGER NOT NULL,
    time_granularity    INTEGER NOT NULL,
    night_shifts        INTEGER NOT NULL DEFAULT 0,
    night_shift_start   INTEGER,
    night_shift_end     INTEGER,
    night_on_shift      INTEGER,
    admin_password_hash TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS members (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id      TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    member_name   TEXT NOT NULL,
    availability  TEXT NOT NULL DEFAULT '{}',
    password_hash TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(group_id, member_name)
  );

  CREATE TABLE IF NOT EXISTS schedules (
    group_id     TEXT PRIMARY KEY REFERENCES groups(id) ON DELETE CASCADE,
    result_json  TEXT NOT NULL,
    generated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS swap_requests (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id      TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    from_member   TEXT NOT NULL,
    to_member     TEXT NOT NULL,
    from_start    TEXT NOT NULL,
    from_end      TEXT NOT NULL,
    to_start      TEXT,
    to_end        TEXT,
    message       TEXT,
    status        TEXT NOT NULL DEFAULT 'pending',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    responded_at  TEXT
  );
`);

// Older databases predate the members table's move from access tokens to
// per-member passwords.
const memberColumns = db.prepare('PRAGMA table_info(members)').all() as { name: string }[];
if (!memberColumns.some((c) => c.name === 'password_hash')) {
  db.exec("ALTER TABLE members ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''");
}
if (memberColumns.some((c) => c.name === 'access_token')) {
  db.exec('ALTER TABLE members DROP COLUMN access_token');
}

interface GroupRow {
  id: string;
  group_name: string;
  num_members: number;
  shift_start: string;
  shift_end: string;
  std_on_shift: number;
  time_granularity: number;
  night_shifts: number;
  night_shift_start: number | null;
  night_shift_end: number | null;
  night_on_shift: number | null;
  admin_password_hash: string | null;
}

function rowToConfig(row: GroupRow): GroupConfig {
  return {
    uuid: row.id,
    groupName: row.group_name,
    numMembers: row.num_members,
    shiftStart: row.shift_start,
    shiftEnd: row.shift_end,
    stdOnShift: row.std_on_shift,
    timeGranularity: row.time_granularity as 15 | 30 | 60,
    nightShifts: Boolean(row.night_shifts),
    nightShiftStart: row.night_shift_start,
    nightShiftEnd: row.night_shift_end,
    nightOnShift: row.night_on_shift,
  };
}

export function createGroup(payload: CreateGroupPayload): string {
  const uuid = randomUUID();
  const adminPasswordHash = payload.adminPassword ? hashPassword(payload.adminPassword) : null;

  db.prepare(
    `INSERT INTO groups (
      id, group_name, num_members, shift_start, shift_end, std_on_shift,
      time_granularity, night_shifts, night_shift_start, night_shift_end,
      night_on_shift, admin_password_hash
    ) VALUES (@id, @groupName, @numMembers, @shiftStart, @shiftEnd, @stdOnShift,
      @timeGranularity, @nightShifts, @nightShiftStart, @nightShiftEnd,
      @nightOnShift, @adminPasswordHash)`
  ).run({
    id: uuid,
    groupName: payload.groupName,
    numMembers: payload.numMembers,
    shiftStart: payload.shiftStart,
    shiftEnd: payload.shiftEnd,
    stdOnShift: payload.stdOnShift,
    timeGranularity: payload.timeGranularity,
    nightShifts: payload.nightShifts ? 1 : 0,
    nightShiftStart: payload.nightShifts ? payload.nightShiftStart ?? null : null,
    nightShiftEnd: payload.nightShifts ? payload.nightShiftEnd ?? null : null,
    nightOnShift: payload.nightShifts ? payload.nightOnShift ?? null : null,
    adminPasswordHash,
  });

  return uuid;
}

export function getGroup(uuid: string): GroupConfig | undefined {
  const row = db.prepare('SELECT * FROM groups WHERE id = ?').get(uuid) as GroupRow | undefined;
  return row ? rowToConfig(row) : undefined;
}

export function getAdminPasswordHash(uuid: string): string | null | undefined {
  const row = db.prepare('SELECT admin_password_hash FROM groups WHERE id = ?').get(uuid) as
    | { admin_password_hash: string | null }
    | undefined;
  return row?.admin_password_hash;
}

interface MemberRow {
  member_name: string;
  availability: string;
  password_hash: string;
  updated_at: string;
}

export function getMembersForGroup(groupId: string): MemberAvailability[] {
  const rows = db
    .prepare('SELECT member_name, availability FROM members WHERE group_id = ?')
    .all(groupId) as MemberRow[];

  return rows.map((row) => ({
    memberName: row.member_name,
    availability: JSON.parse(row.availability) as AvailabilityMap,
  }));
}

export function getMemberSummaries(groupId: string): { memberName: string; updatedAt: string }[] {
  const rows = db
    .prepare('SELECT member_name, updated_at FROM members WHERE group_id = ? ORDER BY member_name')
    .all(groupId) as MemberRow[];

  return rows.map((row) => ({ memberName: row.member_name, updatedAt: row.updated_at }));
}

export function getMember(groupId: string, memberName: string): MemberRow | undefined {
  return db
    .prepare('SELECT member_name, availability, password_hash, updated_at FROM members WHERE group_id = ? AND member_name = ?')
    .get(groupId, memberName) as MemberRow | undefined;
}

export type MemberAuthResult =
  | { status: 'ok'; availability: AvailabilityMap; updatedAt: string }
  | { status: 'not_found' }
  | { status: 'invalid_password' };

// Every member name is bound to a password set on first submission. Reading
// someone's availability requires that password, so a stranger who simply
// types someone else's name can't view or overwrite their data.
export function authenticateMember(groupId: string, memberName: string, password: string): MemberAuthResult {
  const existing = getMember(groupId, memberName);
  if (!existing) return { status: 'not_found' };
  if (!verifyPassword(password, existing.password_hash)) return { status: 'invalid_password' };
  return { status: 'ok', availability: JSON.parse(existing.availability), updatedAt: existing.updated_at };
}

export type SaveMemberResult =
  | { status: 'ok'; updatedAt: string; created: boolean }
  | { status: 'invalid_password' };

export function saveMemberAvailability(
  groupId: string,
  memberName: string,
  password: string,
  availability: AvailabilityMap
): SaveMemberResult {
  const existing = getMember(groupId, memberName);
  const now = new Date().toISOString();

  if (!existing) {
    db.prepare(
      `INSERT INTO members (group_id, member_name, availability, password_hash, updated_at)
       VALUES (@groupId, @memberName, @availability, @passwordHash, @updatedAt)`
    ).run({
      groupId,
      memberName,
      availability: JSON.stringify(availability),
      passwordHash: hashPassword(password),
      updatedAt: now,
    });
    return { status: 'ok', updatedAt: now, created: true };
  }

  if (!verifyPassword(password, existing.password_hash)) {
    return { status: 'invalid_password' };
  }

  db.prepare(
    `UPDATE members SET availability = @availability, updated_at = @updatedAt
     WHERE group_id = @groupId AND member_name = @memberName`
  ).run({ groupId, memberName, availability: JSON.stringify(availability), updatedAt: now });

  return { status: 'ok', updatedAt: now, created: false };
}

export function saveSchedule(groupId: string, result: ScheduleResult): void {
  db.prepare(
    `INSERT INTO schedules (group_id, result_json, generated_at)
     VALUES (@groupId, @resultJson, @generatedAt)
     ON CONFLICT(group_id) DO UPDATE SET result_json = @resultJson, generated_at = @generatedAt`
  ).run({ groupId, resultJson: JSON.stringify(result), generatedAt: result.generatedAt });
}

export function getSchedule(groupId: string): ScheduleResult | undefined {
  const row = db.prepare('SELECT result_json FROM schedules WHERE group_id = ?').get(groupId) as
    | { result_json: string }
    | undefined;
  return row ? (JSON.parse(row.result_json) as ScheduleResult) : undefined;
}

export function verifyMemberPassword(groupId: string, memberName: string, password: string): boolean {
  const member = getMember(groupId, memberName);
  return Boolean(member && verifyPassword(password, member.password_hash));
}

export function memberExists(groupId: string, memberName: string): boolean {
  return Boolean(getMember(groupId, memberName));
}

interface SwapRequestRow {
  id: number;
  from_member: string;
  to_member: string;
  from_start: string;
  from_end: string;
  to_start: string | null;
  to_end: string | null;
  message: string | null;
  status: SwapStatus;
  created_at: string;
  responded_at: string | null;
}

function rowToSwapRequest(row: SwapRequestRow): SwapRequest {
  return {
    id: row.id,
    fromMember: row.from_member,
    toMember: row.to_member,
    fromStart: row.from_start,
    fromEnd: row.from_end,
    toStart: row.to_start,
    toEnd: row.to_end,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
  };
}

export function createSwapRequest(
  groupId: string,
  input: {
    fromMember: string;
    toMember: string;
    fromStart: string;
    fromEnd: string;
    toStart: string | null;
    toEnd: string | null;
    message: string | null;
  }
): SwapRequest {
  const info = db
    .prepare(
      `INSERT INTO swap_requests (group_id, from_member, to_member, from_start, from_end, to_start, to_end, message)
       VALUES (@groupId, @fromMember, @toMember, @fromStart, @fromEnd, @toStart, @toEnd, @message)`
    )
    .run({ groupId, ...input });

  return getSwapRequest(groupId, info.lastInsertRowid as number)!;
}

export function getSwapRequest(groupId: string, id: number): SwapRequest | undefined {
  const row = db
    .prepare('SELECT * FROM swap_requests WHERE id = ? AND group_id = ?')
    .get(id, groupId) as SwapRequestRow | undefined;
  return row ? rowToSwapRequest(row) : undefined;
}

export function getSwapRequestsForMember(
  groupId: string,
  memberName: string
): { incoming: SwapRequest[]; outgoing: SwapRequest[] } {
  const rows = db
    .prepare(
      `SELECT * FROM swap_requests WHERE group_id = ? AND (from_member = ? OR to_member = ?)
       ORDER BY created_at DESC`
    )
    .all(groupId, memberName, memberName) as SwapRequestRow[];

  const incoming = rows.filter((r) => r.to_member === memberName).map(rowToSwapRequest);
  const outgoing = rows.filter((r) => r.from_member === memberName).map(rowToSwapRequest);
  return { incoming, outgoing };
}

export function setSwapRequestStatus(groupId: string, id: number, status: SwapStatus): void {
  db.prepare(
    `UPDATE swap_requests SET status = @status, responded_at = @respondedAt WHERE id = @id AND group_id = @groupId`
  ).run({ id, groupId, status, respondedAt: new Date().toISOString() });
}
