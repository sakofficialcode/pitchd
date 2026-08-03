import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import WeekScheduler from './WeekScheduler';
import { getGroup, loginMember, saveMemberAvailability } from '../lib/api';
import type { AvailabilityMap, GroupConfig } from '../lib/types';

function storageKey(uuid: string) {
  return `pitchd:lastName:${uuid}`;
}

type AuthStatus = 'idle' | 'checking' | 'existing' | 'new' | 'invalid';

export default function GroupPage() {
  const { uuid = '' } = useParams<{ uuid: string }>();

  const [group, setGroup] = React.useState<GroupConfig | null>(null);
  const [groupError, setGroupError] = React.useState<string | null>(null);

  const [memberName, setMemberName] = React.useState('');
  const [memberPassword, setMemberPassword] = React.useState('');
  const [authStatus, setAuthStatus] = React.useState<AuthStatus>('idle');
  const [authError, setAuthError] = React.useState<string | null>(null);

  const [loadedAvailability, setLoadedAvailability] = React.useState<AvailabilityMap>({});
  const [currentAvailability, setCurrentAvailability] = React.useState<AvailabilityMap>({});

  const [saveStatus, setSaveStatus] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = React.useState<string | null>(null);

  React.useEffect(() => {
    getGroup(uuid)
      .then(setGroup)
      .catch((err) => setGroupError(err instanceof Error ? err.message : 'Failed to load group'));
  }, [uuid]);

  React.useEffect(() => {
    const savedName = localStorage.getItem(storageKey(uuid));
    if (savedName) setMemberName(savedName);
  }, [uuid]);

  // Checks the name+password pair against the server. A name with no
  // account yet is reported as such (so the scheduler can be used to create
  // one on submit) rather than silently exposing someone else's data.
  const attemptLogin = async (name: string, password: string) => {
    const trimmed = name.trim();
    if (!trimmed || !password) return;

    setAuthStatus('checking');
    setAuthError(null);
    try {
      const member = await loginMember(uuid, trimmed, password);
      if (member) {
        setLoadedAvailability(member.availability);
        setCurrentAvailability(member.availability);
        setAuthStatus('existing');
      } else {
        setLoadedAvailability({});
        setCurrentAvailability({});
        setAuthStatus('new');
      }
      localStorage.setItem(storageKey(uuid), trimmed);
    } catch (err) {
      setAuthStatus('invalid');
      setAuthError(err instanceof Error ? err.message : 'Failed to verify password');
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMemberName(e.target.value);
    setAuthStatus('idle');
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMemberPassword(e.target.value);
    setAuthStatus('idle');
  };

  const handleCredentialsBlur = () => {
    attemptLogin(memberName, memberPassword);
  };

  const handleSubmit = async () => {
    const trimmed = memberName.trim();
    if (!trimmed || !memberPassword) return;

    setSaveStatus('saving');
    setSaveError(null);
    try {
      await saveMemberAvailability(uuid, trimmed, currentAvailability, memberPassword);
      setAuthStatus('existing');
      setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('error');
      setSaveError(err instanceof Error ? err.message : 'Failed to save availability');
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

  const unlocked = memberName.trim() !== '' && memberPassword !== '' && authStatus !== 'invalid';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <h1 className="text-2xl font-bold text-gray-900">{group.groupName}</h1>
            <Link to={`/${uuid}/admin`} className="text-sm text-blue-600 hover:underline">
              Admin
            </Link>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            {group.numMembers} members &middot; {group.stdOnShift} per shift
            {group.nightShifts ? ` (${group.nightOnShift} at night)` : ''}
          </p>

          <div className="mt-4 flex flex-wrap gap-4">
            <div className="max-w-xs">
              <label className="text-sm font-medium text-gray-900 block mb-1">Your Name</label>
              <input
                type="text"
                value={memberName}
                onChange={handleNameChange}
                onBlur={handleCredentialsBlur}
                placeholder="Enter your name"
                className="h-10 w-full rounded-md border border-gray-300 px-3 text-base text-gray-900 focus:outline focus:outline-2 focus:-outline-offset-1 focus:outline-blue-600"
              />
            </div>
            <div className="max-w-xs">
              <label className="text-sm font-medium text-gray-900 block mb-1">Password</label>
              <input
                type="password"
                value={memberPassword}
                onChange={handlePasswordChange}
                onBlur={handleCredentialsBlur}
                placeholder="New here? Just pick one"
                className="h-10 w-full rounded-md border border-gray-300 px-3 text-base text-gray-900 focus:outline focus:outline-2 focus:-outline-offset-1 focus:outline-blue-600"
              />
            </div>
          </div>

          {authStatus === 'checking' && <p className="mt-2 text-sm text-gray-500">Checking...</p>}
          {authStatus === 'new' && (
            <p className="mt-2 text-sm text-blue-700">
              No account yet for this name — submitting availability will create one with this password.
            </p>
          )}
          {authStatus === 'existing' && <p className="mt-2 text-sm text-green-700">Welcome back, {memberName.trim()}.</p>}
          {authStatus === 'invalid' && <p className="mt-2 text-sm text-red-600">{authError}</p>}
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <WeekScheduler
            key={memberName.trim() || 'anonymous'}
            slotMinutes={group.timeGranularity}
            initialAvailability={loadedAvailability}
            initialStartDateTime={group.shiftStart}
            initialEndDateTime={group.shiftEnd}
            onAvailabilityChange={setCurrentAvailability}
            readOnly={!unlocked}
            nightShifts={group.nightShifts}
            nightShiftStart={group.nightShiftStart}
            nightShiftEnd={group.nightShiftEnd}
          />
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 flex items-center justify-between">
          <div>
            {saveStatus === 'saved' && <p className="text-sm text-green-600">Availability saved.</p>}
            {saveStatus === 'error' && <p className="text-sm text-red-600">{saveError}</p>}
          </div>
          <button
            disabled={!memberName.trim() || !memberPassword || saveStatus === 'saving'}
            onClick={handleSubmit}
            className="h-11 px-6 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 transition-colors"
          >
            {saveStatus === 'saving' ? 'Saving...' : 'Submit Availability'}
          </button>
        </div>
      </div>
    </div>
  );
}
