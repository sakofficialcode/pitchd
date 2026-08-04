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
    <div className="ui-page">
      <div className="ui-page-content">
        <div className="ui-card">
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
                  <label className="ui-label">Admin Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="ui-input"
                  />
                </div>
              )}
              <button disabled={loading} onClick={loadLastSchedule} className="ui-btn-primary">
                {loading ? 'Loading...' : 'View Last Schedule'}
              </button>
            </div>
          )}

          {error && (
            <div className="ui-banner-error">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>

        {result && (
          <div className="ui-card">
            <ScheduleResults result={result} />
          </div>
        )}
      </div>
    </div>
  );
}
