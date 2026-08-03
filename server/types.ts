export type AvailabilityStatus = 'available' | 'not_preferred' | 'unavailable';
export type AvailabilityMap = Record<string, AvailabilityStatus>;

export interface GroupConfig {
  uuid: string;
  groupName: string;
  numMembers: number;
  shiftStart: string;
  shiftEnd: string;
  stdOnShift: number;
  timeGranularity: 15 | 30 | 60;
  nightShifts: boolean;
  nightShiftStart: number | null;
  nightShiftEnd: number | null;
  nightOnShift: number | null;
}

export interface CreateGroupPayload {
  groupName: string;
  numMembers: number;
  shiftStart: string;
  shiftEnd: string;
  stdOnShift: number;
  timeGranularity: 15 | 30 | 60;
  nightShifts: boolean;
  nightShiftStart?: number;
  nightShiftEnd?: number;
  nightOnShift?: number;
  adminPassword?: string | null;
}

export interface MemberAvailability {
  memberName: string;
  availability: AvailabilityMap;
}

export interface ShiftAssignment {
  memberName: string;
  start: string;
  end: string;
}

export interface UnderstaffedRange {
  start: string;
  end: string;
  required: number;
  filled: number;
}

export interface ScheduleResult {
  generatedAt: string;
  assignments: ShiftAssignment[];
  understaffed: UnderstaffedRange[];
}
