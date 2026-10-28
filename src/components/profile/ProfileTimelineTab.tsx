import React, { useState } from 'react';
import { Animal, AnimalEvent } from '../../types/mais';

interface ProfileTimelineTabProps {
  animal: Animal;
  timeline: AnimalEvent[];
}

export const ProfileTimelineTab: React.FC<ProfileTimelineTabProps> = ({
  animal,
  timeline,
}) => {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">
          Activity Timeline ({timeline.length})
        </h3>
      </div>

      <div className="border border-slate-200/80 rounded-xl bg-white/80 divide-y divide-slate-200">
        {timeline.map((evt) => {
          const isExpanded = selectedEventId === evt.id;
          return (
            <div key={evt.id} className="p-4 hover:bg-slate-50/80 transition-colors">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono font-semibold text-slate-900">
                      {evt.eventDate}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-emerald-800 font-medium">
                      {evt.eventType}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{evt.recordedBy}</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">{evt.title}</p>
                  <p className="text-xs text-slate-600">{evt.summary}</p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {evt.costNgn !== null && evt.costNgn > 0 && (
                    <span className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                      NGN {evt.costNgn.toLocaleString()}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedEventId(isExpanded ? null : evt.id)}
                    className="px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-100"
                  >
                    {isExpanded ? 'Hide' : 'Details'}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-700 bg-slate-50 p-3 rounded-lg font-mono space-y-1">
                  <p>Animal ID: {animal.id} (Tag: {animal.currentTag})</p>
                  <p>Event ID: {evt.id} · Reference: {evt.referenceId}</p>
                  <p>
                    Cost:{' '}
                    {evt.costNgn !== null
                      ? `NGN ${evt.costNgn.toLocaleString()}`
                      : 'Non-financial event'}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
