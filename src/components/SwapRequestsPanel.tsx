import * as React from 'react';
import { respondToSwapRequest } from '../lib/api';
import { formatDateTime } from '../lib/datetime';
import type { SwapRequest } from '../lib/types';

interface Props {
  uuid: string;
  loggedInName: string;
  loggedInPassword: string;
  incoming: SwapRequest[];
  outgoing: SwapRequest[];
  onChanged: () => void;
  onPreview: (request: SwapRequest | null) => void;
}

function rangeLabel(start: string, end: string): string {
  return `${formatDateTime(start)} – ${formatDateTime(end)}`;
}

function statusBadge(status: SwapRequest['status']): React.ReactNode {
  const styles: Record<SwapRequest['status'], string> = {
    pending: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    accepted: 'bg-green-50 text-green-700 border-green-200',
    declined: 'bg-gray-50 text-gray-500 border-gray-200',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${styles[status]}`}>
      {status}
    </span>
  );
}

export default function SwapRequestsPanel({
  uuid,
  loggedInName,
  loggedInPassword,
  incoming,
  outgoing,
  onChanged,
  onPreview,
}: Props) {
  const [respondingId, setRespondingId] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const respond = async (id: number, accept: boolean) => {
    setRespondingId(id);
    setError(null);
    try {
      await respondToSwapRequest(uuid, id, loggedInName, loggedInPassword, accept);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to respond to request');
    } finally {
      setRespondingId(null);
    }
  };

  if (incoming.length === 0 && outgoing.length === 0) {
    return <p className="text-sm text-gray-500">No swap requests yet.</p>;
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {incoming.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Requests for you</h3>
          <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md overflow-hidden">
            {incoming.map((r) => (
              <li
                key={r.id}
                className="px-4 py-3 text-sm space-y-2"
                onMouseEnter={() => onPreview(r)}
                onMouseLeave={() => onPreview(null)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-gray-900">
                      <span className="font-medium">{r.fromMember}</span> wants you to take{' '}
                      <span className="font-medium">{rangeLabel(r.fromStart, r.fromEnd)}</span>
                    </p>
                    {r.toStart && r.toEnd && (
                      <p className="text-gray-600">
                        in exchange for your <span className="font-medium">{rangeLabel(r.toStart, r.toEnd)}</span>
                      </p>
                    )}
                    {r.message && <p className="text-gray-500 italic mt-1">"{r.message}"</p>}
                  </div>
                  {statusBadge(r.status)}
                </div>
                {r.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      disabled={respondingId === r.id}
                      onClick={() => respond(r.id, true)}
                      className="ui-btn-primary h-8 px-3 text-sm"
                    >
                      Accept
                    </button>
                    <button
                      disabled={respondingId === r.id}
                      onClick={() => respond(r.id, false)}
                      className="ui-btn-secondary h-8 px-3 text-sm"
                    >
                      Decline
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {outgoing.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Your requests</h3>
          <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md overflow-hidden">
            {outgoing.map((r) => (
              <li
                key={r.id}
                className="px-4 py-3 text-sm flex items-center justify-between gap-3"
                onMouseEnter={() => onPreview(r)}
                onMouseLeave={() => onPreview(null)}
              >
                <div>
                  <p className="text-gray-900">
                    Asked <span className="font-medium">{r.toMember}</span> to take{' '}
                    <span className="font-medium">{rangeLabel(r.fromStart, r.fromEnd)}</span>
                  </p>
                  {r.toStart && r.toEnd && (
                    <p className="text-gray-600">
                      in exchange for their <span className="font-medium">{rangeLabel(r.toStart, r.toEnd)}</span>
                    </p>
                  )}
                </div>
                {statusBadge(r.status)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
