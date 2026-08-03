import type {
  AvailabilityMap,
  CreateGroupPayload,
  GroupConfig,
  ScheduleResult,
} from './types';

async function parseOrThrow<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }
  return data as T;
}

export async function createGroup(payload: CreateGroupPayload): Promise<{ uuid: string }> {
  const response = await fetch('/api/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseOrThrow(response);
}

export async function getGroup(uuid: string): Promise<GroupConfig> {
  const response = await fetch(`/api/groups/${uuid}`);
  return parseOrThrow(response);
}

export async function loginMember(
  uuid: string,
  memberName: string,
  password: string
): Promise<{ memberName: string; availability: AvailabilityMap; updatedAt: string } | null> {
  const response = await fetch(`/api/groups/${uuid}/members/${encodeURIComponent(memberName)}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (response.status === 404) return null;
  return parseOrThrow(response);
}

export async function saveMemberAvailability(
  uuid: string,
  memberName: string,
  availability: AvailabilityMap,
  password: string
): Promise<{ memberName: string; updatedAt: string; created: boolean }> {
  const response = await fetch(`/api/groups/${uuid}/members/${encodeURIComponent(memberName)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ availability, password }),
  });
  return parseOrThrow(response);
}

export async function generateSchedule(
  uuid: string,
  adminPassword: string | null
): Promise<ScheduleResult> {
  const response = await fetch(`/api/groups/${uuid}/schedule/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminPassword }),
  });
  return parseOrThrow(response);
}

export async function viewSchedule(
  uuid: string,
  adminPassword: string | null
): Promise<ScheduleResult> {
  const response = await fetch(`/api/groups/${uuid}/schedule/view`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminPassword }),
  });
  return parseOrThrow(response);
}
