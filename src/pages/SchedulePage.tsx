import * as React from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import ScheduleResults from '../components/ScheduleResults';
import { getGroup, viewSchedule } from '../lib/api';
import type { GroupConfig, ScheduleResult } from '../lib/types';

interface LocationState {
  result?: ScheduleResult;
}

export default function SchedulePage() {
  const { uuid = '' } = useParams<{ uuid: string }>();
  const location = useLocation();
  const initialResult = (location.state as LocationState | null)?.result ?? null;

  const [group, setGroup] = React.useState<GroupConfig | null>(null);
  const [result, setResult] = React.useState<ScheduleResult | null>(initialResult);
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    getGroup(uuid).then(setGroup).catch(() => setGroup(null));
  }, [uuid]);

  const loadLastSchedule = async () => {
    setLoading(true);
    setError(null);
    try {
      const scheduleResult = await viewSchedule(uuid, group?.hasAdminPassword ? password : null);
      setResult(scheduleResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {group ? `${group.groupName} — Schedule` : 'Schedule'}
              </h1>
              <Link to={`/${uuid}`} className="text-sm text-blue-600 hover:underline">
                &larr; Back to scheduler
              </Link>
            </div>
          </div>

          {!result && (
            <div className="mt-4 flex items-end gap-3">
              {group?.hasAdminPassword && (
                <div>
                  <label className="text-sm font-medium text-gray-900 block mb-1">Admin Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-10 rounded-md border border-gray-300 px-3 text-base text-gray-900 focus:outline focus:outline-2 focus:-outline-offset-1 focus:outline-blue-600"
                  />
                </div>
              )}
              <button
                disabled={loading}
                onClick={loadLastSchedule}
                className="h-10 px-4 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
              >
                {loading ? 'Loading...' : 'View Last Schedule'}
              </button>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 rounded-md bg-red-50 border border-red-200">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>

        {result && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <ScheduleResults result={result} />
          </div>
        )}
      </div>
    </div>
  );
}
