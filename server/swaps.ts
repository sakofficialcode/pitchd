import type { ShiftAssignment } from './types.ts';

// Reassigns [rangeStart, rangeEnd) from whichever of `memberName`'s
// assignments fully contains it to `newOwner`, splitting that assignment
// into up to three pieces so the parts outside the range stay put.
function carveRange(
  assignments: ShiftAssignment[],
  memberName: string,
  rangeStart: string,
  rangeEnd: string,
  newOwner: string
): ShiftAssignment[] | null {
  const rangeStartMs = new Date(rangeStart).getTime();
  const rangeEndMs = new Date(rangeEnd).getTime();

  const index = assignments.findIndex(
    (a) =>
      a.memberName === memberName &&
      new Date(a.start).getTime() <= rangeStartMs &&
      new Date(a.end).getTime() >= rangeEndMs
  );
  if (index === -1) return null;

  const original = assignments[index];
  const pieces: ShiftAssignment[] = [];
  if (new Date(original.start).getTime() < rangeStartMs) {
    pieces.push({ memberName, start: original.start, end: rangeStart });
  }
  pieces.push({ memberName: newOwner, start: rangeStart, end: rangeEnd });
  if (rangeEndMs < new Date(original.end).getTime()) {
    pieces.push({ memberName, start: rangeEnd, end: original.end });
  }

  const next = [...assignments];
  next.splice(index, 1, ...pieces);
  return next;
}

export interface SwapInput {
  fromMember: string;
  fromStart: string;
  fromEnd: string;
  toMember: string;
  toStart: string | null;
  toEnd: string | null;
}

export type ApplySwapResult =
  | { ok: true; assignments: ShiftAssignment[] }
  | { ok: false; error: string };

// Hands fromMember's [fromStart, fromEnd) slice to toMember, and — if a
// reciprocal range is given — toMember's slice back. Both carves must succeed
// or neither applies, so a stale request can't leave the schedule half-swapped.
export function applySwap(assignments: ShiftAssignment[], swap: SwapInput): ApplySwapResult {
  const afterFrom = carveRange(assignments, swap.fromMember, swap.fromStart, swap.fromEnd, swap.toMember);
  if (!afterFrom) {
    return { ok: false, error: `${swap.fromMember}'s shift no longer covers that time range` };
  }

  if (!swap.toStart || !swap.toEnd) {
    return { ok: true, assignments: afterFrom };
  }

  const afterTo = carveRange(afterFrom, swap.toMember, swap.toStart, swap.toEnd, swap.fromMember);
  if (!afterTo) {
    return { ok: false, error: `${swap.toMember}'s shift no longer covers that time range` };
  }

  return { ok: true, assignments: afterTo };
}
