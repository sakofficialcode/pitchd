import { useMemo, useState } from 'react';
import type { ScheduleResult, UnderstaffedRange } from '../lib/types';

// Fixed-order categorical palette (validated for CVD-safe adjacent contrast).
// Members are assigned slots in stable alphabetical order so a given name
// always maps to the same color across regenerations.
const MEMBER_COLORS = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
];

const CRITICAL = '#d03b3b';

const HOUR_HEIGHT_PX = 48;
const DAY_MS = 24 * 60 * 60 * 1000;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatTimeOfDay(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayHour = h % 12 || 12;
  return m === 0 ? `${displayHour} ${period}` : `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function dateKey(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface DaySegment {
  key: string;
  startMin: number;
  endMin: number;
  label: string;
}

interface LaidOutSegment extends DaySegment {
  col: number;
  colCount: number;
}

// Greedy column packing: events overlapping in time get placed side-by-side.
// `requiredRanges` (from understaffed data) widens a cluster's column count
// beyond its actual occupant count so a visible empty gap remains where the
// understaffed hatch can show through, instead of blocks stretching to fill it.
function layoutDaySegments(
  segments: DaySegment[],
  requiredRanges: Array<{ startMin: number; endMin: number; required: number }> = []
): LaidOutSegment[] {
  const sorted = [...segments].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const out: LaidOutSegment[] = [];
  let cluster: Array<DaySegment & { col: number }> = [];
  let colEnds: number[] = [];
  let clusterMaxEnd = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;
    const clusterStart = Math.min(...cluster.map((e) => e.startMin));
    const clusterEnd = Math.max(...cluster.map((e) => e.endMin));
    const naturalColCount = Math.max(...cluster.map((e) => e.col)) + 1;
    const requiredOverlap = requiredRanges
      .filter((r) => r.startMin < clusterEnd && r.endMin > clusterStart)
      .reduce((max, r) => Math.max(max, r.required), 0);
    const colCount = Math.max(naturalColCount, requiredOverlap);
    for (const e of cluster) out.push({ ...e, colCount });
    cluster = [];
    colEnds = [];
    clusterMaxEnd = -Infinity;
  };

  for (const seg of sorted) {
    if (seg.startMin >= clusterMaxEnd) flush();
    let col = colEnds.findIndex((end) => end <= seg.startMin);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(seg.endMin);
    } else {
      colEnds[col] = seg.endMin;
    }
    cluster.push({ ...seg, col });
    clusterMaxEnd = Math.max(clusterMaxEnd, seg.endMin);
  }
  flush();
  return out;
}

// Splits a start/end range into per-day, minutes-of-day segments, clipped to
// each day's [0, 1440) boundary (shifts can cross midnight).
function splitByDay(start: string, end: string): Map<string, { startMin: number; endMin: number }> {
  const result = new Map<string, { startMin: number; endMin: number }>();
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (endDate <= startDate) return result;

  let cursor = startOfDay(startDate);
  while (cursor < endDate) {
    const dayEnd = new Date(cursor.getTime() + DAY_MS);
    const segStart = cursor > startDate ? cursor : startDate;
    const segEnd = dayEnd < endDate ? dayEnd : endDate;
    const startMin = (segStart.getTime() - cursor.getTime()) / 60_000;
    const endMin = (segEnd.getTime() - cursor.getTime()) / 60_000;
    if (endMin > startMin) {
      result.set(dateKey(cursor), { startMin, endMin });
    }
    cursor = dayEnd;
  }
  return result;
}

export default function ScheduleResults({ result }: { result: ScheduleResult }) {
  const [weekOffset, setWeekOffset] = useState(0);

  const memberColor = useMemo(() => {
    const names = [...new Set(result.assignments.map((a) => a.memberName))].sort((a, b) => a.localeCompare(b));
    const map = new Map<string, string>();
    names.forEach((name, i) => map.set(name, MEMBER_COLORS[i % MEMBER_COLORS.length]));
    return map;
  }, [result.assignments]);

  const { days, segmentsByDay, understaffedByDay, windowStartMin, windowEndMin } = useMemo(() => {
    const dayKeys = new Set<string>();
    let minMinuteOfDay = 24 * 60;
    let maxMinuteOfDay = 0;

    const noteRange = (start: string, end: string) => {
      const segs = splitByDay(start, end);
      for (const [key, { startMin, endMin }] of segs) {
        dayKeys.add(key);
        minMinuteOfDay = Math.min(minMinuteOfDay, startMin);
        maxMinuteOfDay = Math.max(maxMinuteOfDay, endMin);
      }
    };
    for (const a of result.assignments) noteRange(a.start, a.end);
    for (const u of result.understaffed) noteRange(u.start, u.end);

    const sortedKeys = [...dayKeys].sort();
    const days = sortedKeys.map((key) => {
      const [y, m, d] = key.split('-').map(Number);
      return { key, date: new Date(y, m - 1, d) };
    });

    const understaffedByDay = new Map<string, Array<{ startMin: number; endMin: number; range: UnderstaffedRange }>>();
    for (const u of result.understaffed) {
      const segs = splitByDay(u.start, u.end);
      for (const [key, { startMin, endMin }] of segs) {
        const list = understaffedByDay.get(key) ?? [];
        list.push({ startMin, endMin, range: u });
        understaffedByDay.set(key, list);
      }
    }

    const segmentsByDay = new Map<string, LaidOutSegment[]>();
    const rawByDay = new Map<string, DaySegment[]>();
    for (const a of result.assignments) {
      const segs = splitByDay(a.start, a.end);
      for (const [key, { startMin, endMin }] of segs) {
        const list = rawByDay.get(key) ?? [];
        list.push({
          key: `${a.memberName}-${a.start}`,
          startMin,
          endMin,
          label: a.memberName,
        });
        rawByDay.set(key, list);
      }
    }
    for (const [key, list] of rawByDay) {
      const requiredRanges = (understaffedByDay.get(key) ?? []).map((g) => ({
        startMin: g.startMin,
        endMin: g.endMin,
        required: g.range.required,
      }));
      segmentsByDay.set(key, layoutDaySegments(list, requiredRanges));
    }

    const windowStartMin = dayKeys.size > 0 ? Math.floor(minMinuteOfDay / 60) * 60 : 0;
    const windowEndMin = dayKeys.size > 0 ? Math.min(24 * 60, Math.ceil(maxMinuteOfDay / 60) * 60) : 24 * 60;

    return { days, segmentsByDay, understaffedByDay, windowStartMin, windowEndMin };
  }, [result.assignments, result.understaffed]);

  const workload = useMemo(() => {
    const byMember = new Map<string, { minutes: number; shiftCount: number }>();
    for (const a of result.assignments) {
      const minutes = (new Date(a.end).getTime() - new Date(a.start).getTime()) / 60_000;
      const entry = byMember.get(a.memberName) ?? { minutes: 0, shiftCount: 0 };
      entry.minutes += minutes;
      entry.shiftCount += 1;
      byMember.set(a.memberName, entry);
    }
    return [...byMember.entries()]
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.minutes - a.minutes);
  }, [result.assignments]);

  // Average is total/count regardless of how the distribution is shaped, so
  // "target" needs no separate weighting logic beyond the sum below.
  const targetMinutes = workload.length
    ? workload.reduce((sum, w) => sum + w.minutes, 0) / workload.length
    : 0;
  const maxWorkload = workload[0];
  const minWorkload = workload[workload.length - 1];

  const members = [...memberColor.entries()];
  const windowLength = Math.max(60, windowEndMin - windowStartMin);
  const containerHeight = (windowLength / 60) * HOUR_HEIGHT_PX;
  const hourMarks = useMemo(() => {
    const marks: number[] = [];
    for (let m = windowStartMin; m <= windowEndMin; m += 60) marks.push(m);
    return marks;
  }, [windowStartMin, windowEndMin]);

  const totalWeeks = Math.max(1, Math.ceil(days.length / 7));
  const visibleDays = days.slice(weekOffset * 7, weekOffset * 7 + 7);

  return (
    <div className="mt-6 space-y-6">
      <h3 className="text-sm font-semibold text-gray-900">Generated {formatDateTime(result.generatedAt)}</h3>

      {workload.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Workload</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-md border border-gray-200 bg-white px-4 py-3">
              <p className="text-xs text-gray-500">Target per person</p>
              <p className="text-lg font-semibold text-gray-900">{formatHours(targetMinutes)}</p>
            </div>
            <div className="rounded-md border border-gray-200 bg-white px-4 py-3">
              <p className="text-xs text-gray-500">Most scheduled</p>
              <p className="text-lg font-semibold text-gray-900">{formatHours(maxWorkload.minutes)}</p>
            </div>
            <div className="rounded-md border border-gray-200 bg-white px-4 py-3">
              <p className="text-xs text-gray-500">Least scheduled</p>
              <p className="text-lg font-semibold text-gray-900">{formatHours(minWorkload.minutes)}</p>
            </div>
          </div>
        </div>
      )}

      {days.length === 0 ? (
        <p className="text-sm text-gray-500">No shifts could be assigned yet.</p>
      ) : (
        <div className="rounded-md border border-gray-200 overflow-hidden">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 bg-gray-50 border-b border-gray-200">
            {members.map(([name, color]) => (
              <div key={name} className="flex items-center gap-2">
                <span
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                  style={{ backgroundColor: color }}
                >
                  {initials(name)}
                </span>
                <span className="text-xs font-medium text-gray-800">{name}</span>
              </div>
            ))}
            {result.understaffed.length > 0 && (
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-sm border"
                  style={{
                    borderColor: CRITICAL,
                    backgroundImage: `repeating-linear-gradient(45deg, ${CRITICAL}55 0, ${CRITICAL}55 2px, transparent 2px, transparent 5px)`,
                  }}
                />
                <span className="text-xs font-medium text-gray-600">Understaffed</span>
              </div>
            )}
          </div>

          {totalWeeks > 1 && (
            <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200">
              <button
                onClick={() => setWeekOffset((w) => Math.max(0, w - 1))}
                disabled={weekOffset === 0}
                className="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                &larr; Prev
              </button>
              <span className="text-xs font-medium text-gray-600">
                Week {weekOffset + 1} of {totalWeeks}
              </span>
              <button
                onClick={() => setWeekOffset((w) => Math.min(totalWeeks - 1, w + 1))}
                disabled={weekOffset >= totalWeeks - 1}
                className="px-2 py-1 text-xs rounded border border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Next &rarr;
              </button>
            </div>
          )}

          <div className="overflow-x-auto bg-white">
            <div className="flex min-w-full" style={{ minWidth: `${64 + visibleDays.length * 140}px` }}>
              <div className="w-16 shrink-0 border-r border-gray-200">
                <div className="h-12 border-b border-gray-200" />
                <div className="relative" style={{ height: `${containerHeight}px` }}>
                  {hourMarks.map((m) => (
                    <div
                      key={m}
                      className="absolute left-0 right-0 -translate-y-1/2 pr-2 text-right text-[10px] text-gray-500"
                      style={{ top: `${((m - windowStartMin) / windowLength) * 100}%` }}
                    >
                      {formatTimeOfDay(m)}
                    </div>
                  ))}
                </div>
              </div>

              {visibleDays.map((day) => {
                const segs = segmentsByDay.get(day.key) ?? [];
                const gaps = understaffedByDay.get(day.key) ?? [];
                return (
                  <div key={day.key} className="flex-1 min-w-[140px] border-r border-gray-200 last:border-r-0">
                    <div className="h-12 border-b border-gray-200 flex flex-col items-center justify-center">
                      <span className="text-xs font-semibold text-gray-700">
                        {day.date.toLocaleDateString([], { weekday: 'short' })}
                      </span>
                      <span className="text-[10px] text-gray-500">
                        {day.date.toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <div className="relative" style={{ height: `${containerHeight}px` }}>
                      {hourMarks.map((m) => (
                        <div
                          key={m}
                          className="absolute left-0 right-0 border-t border-gray-100"
                          style={{ top: `${((m - windowStartMin) / windowLength) * 100}%` }}
                        />
                      ))}

                      {gaps.map((gap, idx) => (
                        <div
                          key={idx}
                          title={`Understaffed: ${gap.range.filled}/${gap.range.required} filled`}
                          className="absolute left-0 right-0 rounded-sm"
                          style={{
                            top: `${((gap.startMin - windowStartMin) / windowLength) * 100}%`,
                            height: `${((gap.endMin - gap.startMin) / windowLength) * 100}%`,
                            border: `1px solid ${CRITICAL}88`,
                            backgroundImage: `repeating-linear-gradient(45deg, ${CRITICAL}33 0, ${CRITICAL}33 2px, transparent 2px, transparent 6px)`,
                          }}
                        />
                      ))}

                      {segs.map((seg) => {
                        const color = memberColor.get(seg.label) ?? MEMBER_COLORS[0];
                        const widthPct = 100 / seg.colCount;
                        return (
                          <div
                            key={seg.key}
                            title={`${seg.label}: ${formatTimeOfDay(seg.startMin)} – ${formatTimeOfDay(seg.endMin)}`}
                            className="absolute rounded-md px-1.5 py-0.5 overflow-hidden shadow-sm"
                            style={{
                              top: `${((seg.startMin - windowStartMin) / windowLength) * 100}%`,
                              height: `${Math.max(((seg.endMin - seg.startMin) / windowLength) * 100, 4)}%`,
                              left: `calc(${seg.col * widthPct}% + 2px)`,
                              width: `calc(${widthPct}% - 4px)`,
                              backgroundColor: color,
                              minHeight: '18px',
                            }}
                          >
                            <div className="flex items-center gap-1 text-[10px] font-medium text-white leading-tight">
                              <span
                                className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-white/25 text-[8px]"
                              >
                                {initials(seg.label)}
                              </span>
                              <span className="truncate">{seg.label}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {result.understaffed.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-red-700 mb-2">Understaffed periods</h3>
          <div className="rounded-md border border-red-200 bg-red-50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-red-700">
                  <th className="px-4 py-2 font-medium">From</th>
                  <th className="px-4 py-2 font-medium">To</th>
                  <th className="px-4 py-2 font-medium">Needed</th>
                  <th className="px-4 py-2 font-medium">Filled</th>
                </tr>
              </thead>
              <tbody>
                {result.understaffed.map((range, idx) => (
                  <tr key={idx} className="border-t border-red-200">
                    <td className="px-4 py-2 text-red-800">{formatDateTime(range.start)}</td>
                    <td className="px-4 py-2 text-red-800">{formatDateTime(range.end)}</td>
                    <td className="px-4 py-2 text-red-800">{range.required}</td>
                    <td className="px-4 py-2 text-red-800">{range.filled}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
