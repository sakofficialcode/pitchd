import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { generateSchedule, getGroup, viewSchedule } from '../lib/api';
import type { GroupConfig, ScheduleResult } from '../lib/types';

function formatUpdatedAt(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function AdminPage() {
  const { uuid = '' } = useParams<{ uuid: string }>();
  const navigate = useNavigate();

  const [group, setGroup] = React.useState<GroupConfig | null>(null);
  const [groupError, setGroupError] = React.useState<string | null>(null);

  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [scheduleError, setScheduleError] = React.useState<string | null>(null);

  React.useEffect(() => {
    getGroup(uuid)
      .then(setGroup)
      .catch((err) => setGroupError(err instanceof Error ? err.message : 'Failed to load group'));
  }, [uuid]);

  const run = async (action: (uuid: string, password: string | null) => Promise<ScheduleResult>) => {
    setLoading(true);
    setScheduleError(null);
    try {
      const scheduleResult = await action(uuid, group?.hasAdminPassword ? password : null);
      navigate(`/${uuid}/schedule`, { state: { result: scheduleResult } });
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (groupError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-600">{groupError}</p>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading group...</p>
      </div>
    );
  }

  const submittedCount = group.members.length;

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h1 className="text-2xl font-bold text-gray-900">{group.groupName} — Admin</h1>
          <Link to={`/${uuid}`} className="text-sm text-blue-600 hover:underline">
            &larr; Back to scheduler
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Submissions</h2>
          <p className="text-sm text-gray-600 mb-4">
            {submittedCount} of {group.numMembers} members have submitted availability.
          </p>

          {submittedCount === 0 ? (
            <p className="text-sm text-gray-500">No one has submitted yet.</p>
          ) : (
            <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md overflow-hidden">
              {group.members.map((member) => (
                <li key={member.memberName} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span className="font-medium text-gray-900">{member.memberName}</span>
                  <span className="text-gray-500">Updated {formatUpdatedAt(member.updatedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Schedule</h2>

          {group.hasAdminPassword && (
            <div className="mb-4">
              <label className="text-sm font-medium text-gray-900 block mb-1">Admin Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 w-full max-w-xs rounded-md border border-gray-300 px-3 text-base text-gray-900 focus:outline focus:outline-2 focus:-outline-offset-1 focus:outline-blue-600"
              />
            </div>
          )}

          <div className="flex gap-3">
            <button
              disabled={loading}
              onClick={() => run(generateSchedule)}
              className="h-10 px-4 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
            >
              {loading ? 'Working...' : 'Generate Schedule'}
            </button>
            <button
              disabled={loading}
              onClick={() => run(viewSchedule)}
              className="h-10 px-4 rounded-md border border-gray-300 text-gray-900 font-medium hover:bg-gray-50 disabled:text-gray-400 transition-colors"
            >
              View Last Schedule
            </button>
          </div>

          {scheduleError && (
            <div className="mt-4 p-3 rounded-md bg-red-50 border border-red-200">
              <p className="text-sm text-red-600">{scheduleError}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
