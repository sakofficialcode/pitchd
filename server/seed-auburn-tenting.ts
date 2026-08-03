// One-off script to seed the local DB with the anonymized Auburn tenting fixture
// so the generated schedule can be viewed in the running app. Run with:
//   npx tsx server/seed-auburn-tenting.ts
import { createGroup, getGroup, saveMemberAvailability, saveSchedule } from './db.ts';
import { generateSchedule } from './scheduler.ts';
import { auburnTentingConfig, auburnTentingMembers } from './fixtures/auburn-tenting-availability.ts';

const SEED_PASSWORD = 'demo-password';

const uuid = createGroup({
  groupName: 'Auburn Tenting (demo)',
  numMembers: auburnTentingMembers.length,
  shiftStart: auburnTentingConfig.shiftStart,
  shiftEnd: auburnTentingConfig.shiftEnd,
  stdOnShift: auburnTentingConfig.stdOnShift,
  timeGranularity: auburnTentingConfig.timeGranularity,
  nightShifts: auburnTentingConfig.nightShifts,
  nightShiftStart: auburnTentingConfig.nightShiftStart,
  nightShiftEnd: auburnTentingConfig.nightShiftEnd,
  nightOnShift: auburnTentingConfig.nightOnShift,
  adminPassword: null,
});

for (const member of auburnTentingMembers) {
  saveMemberAvailability(uuid, member.memberName, SEED_PASSWORD, member.availability);
}

const group = getGroup(uuid)!;
const result = generateSchedule(group, auburnTentingMembers);
saveSchedule(uuid, result);

console.log('Seeded group uuid:', uuid);
console.log('Member password (all members):', SEED_PASSWORD);
console.log('Assignments:', result.assignments.length, '| Understaffed ranges:', result.understaffed.length);
