import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BellRing,
  Mail,
  Plus,
} from 'lucide-react';
import {
  Animal,
  MaisDatabaseState,
  StaffUser,
} from '../types/mais';
import {
  addDaysToIsoDate,
  canPerformAction,
  collectDueTomorrowReminders,
} from '../domain/farmRules';
import { SelectWithCustom } from './SelectWithCustom';

export interface TasksViewProps {
  db: MaisDatabaseState;
  currentUser: StaffUser;
  onOpenAnimalProfile: (animal: Animal) => void;
  onCreateTask: (payload: any) => Promise<void>;
  onUpdateTaskStatus: (
    taskId: string,
    status: 'Completed' | 'Dismissed' | 'Pending',
    completionNotes: string
  ) => Promise<void>;
  onRunDueReminders?: (forceResend?: boolean) => Promise<void>;
}

export const TasksRemindersView: React.FC<TasksViewProps> = ({
  db,
  currentUser,
  onOpenAnimalProfile,
  onCreateTask,
  onUpdateTaskStatus,
  onRunDueReminders,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const tomorrowStr = addDaysToIsoDate(todayStr, db.notificationSettings?.reminderLeadDays || 1);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'OVERDUE' | 'COMPLETED'>(
    'ACTIVE'
  );
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Follow-up');
  const [dueDate, setDueDate] = useState(tomorrowStr);
  const [priority, setPriority] = useState<'High' | 'Medium' | 'Low'>('High');
  const [assignedTo, setAssignedTo] = useState(currentUser.fullName);
  const [animalId, setAnimalId] = useState('');

  const canWrite = canPerformAction(currentUser.role, 'EDIT_ANIMALS');
  const dueTomorrowItems = useMemo(
    () =>
      collectDueTomorrowReminders(
        db,
        todayStr,
        db.notificationSettings?.reminderLeadDays || 1
      ),
    [db, todayStr]
  );

  const handleTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await onCreateTask({
      title,
      category,
      dueDate,
      priority,
      assignedTo,
      animalId: animalId || null,
    });
    setTitle('');
    setShowNewTaskForm(false);
  };

  const filteredTasks = db.tasks.filter((t) => {
    const isOverdue = t.status === 'Overdue' || (t.status === 'Pending' && t.dueDate < todayStr);
    if (statusFilter === 'ACTIVE') return t.status !== 'Completed' && t.status !== 'Dismissed';
    if (statusFilter === 'OVERDUE') return isOverdue && t.status !== 'Completed';
    if (statusFilter === 'COMPLETED') return t.status === 'Completed' || t.status === 'Dismissed';
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="liquid-glass-panel rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-slate-900">Tasks & 1-Day Reminders</h2>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter('ACTIVE')}
              className={`px-3 py-1.5 font-medium rounded-lg whitespace-nowrap shrink-0 ${
                statusFilter === 'ACTIVE' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('OVERDUE')}
              className={`px-3 py-1.5 font-medium rounded-lg whitespace-nowrap shrink-0 ${
                statusFilter === 'OVERDUE' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Overdue
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('COMPLETED')}
              className={`px-3 py-1.5 font-medium rounded-lg whitespace-nowrap shrink-0 ${
                statusFilter === 'COMPLETED'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600'
              }`}
            >
              Completed
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 font-medium rounded-lg whitespace-nowrap shrink-0 ${
                statusFilter === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              All
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onRunDueReminders && (
            <button
              type="button"
              disabled={sendingReminders}
              onClick={async () => {
                setSendingReminders(true);
                try {
                  await onRunDueReminders(true);
                } finally {
                  setSendingReminders(false);
                }
              }}
              className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Mail className="w-3.5 h-3.5 text-emerald-700" />
              {sendingReminders
                ? 'Sending Reminders...'
                : `Send 1-Day Reminder Emails (${dueTomorrowItems.length})`}
            </button>
          )}
          {canWrite && (
            <button
              type="button"
              onClick={() => setShowNewTaskForm((v) => !v)}
              className="liquid-glass-btn-primary px-4 py-2 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              New Task
            </button>
          )}
        </div>
      </div>

      {/* 1-Day Advance Revisit & Due Date Reminder Panel */}
      <div className="liquid-glass-panel rounded-xl p-4 space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BellRing className="w-4 h-4 text-amber-700 shrink-0" />
            <span className="font-bold text-slate-900">
              Upcoming 1-Day Advance Reminders (Due / Revisit Date: <span className="font-mono">{tomorrowStr}</span>)
            </span>
          </div>
          <span className="text-slate-500 font-mono">
            Covers Tasks · Vet Treatment Revisits · Vaccinations · Pregnancy & Calving
          </span>
        </div>

        {dueTomorrowItems.length === 0 ? (
          <p className="text-slate-500 py-1">
            No tasks, veterinary treatment revisits, vaccinations, or pregnancy checks are scheduled for tomorrow ({tomorrowStr}).
          </p>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="py-2.5 px-3 font-semibold">Due / Revisit Date</th>
                  <th className="py-2.5 px-3 font-semibold">Source Type</th>
                  <th className="py-2.5 px-3 font-semibold">Event / Protocol</th>
                  <th className="py-2.5 px-3 font-semibold">Animal Tag</th>
                  <th className="py-2.5 px-3 font-semibold">Assigned Staff & Recipients</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {dueTomorrowItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono font-semibold text-amber-800 whitespace-nowrap">
                      {item.dueDate}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-800 whitespace-nowrap">
                      {item.sourceType}
                    </td>
                    <td className="py-2.5 px-3">
                      <p className="font-semibold text-slate-900">{item.title}</p>
                      <p className="text-slate-500">{item.details}</p>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-emerald-800">
                      {item.animalTag || 'General'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">
                      <p className="font-medium text-slate-900">{item.assignedStaffName}</p>
                      <p className="font-mono text-[11px] text-slate-500">
                        {item.recipientEmails.join(', ')}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNewTaskForm && (
        <form
          onSubmit={handleTaskSubmit}
          className="liquid-glass-panel rounded-xl p-5 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs"
        >
          <div className="md:col-span-2">
            <label className="block font-semibold text-slate-700 mb-1.5">Task *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            />
          </div>

          <SelectWithCustom
            label="Category"
            required
            value={category}
            onChange={(v) => setCategory(v)}
            options={[
              'Follow-up',
              'Vaccination',
              'Pregnancy Check',
              'Calving',
              'Feed',
              'Health',
              'General',
            ]}
            placeholder="Custom category..."
          />

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Due Date *</label>
            <input
              type="date"
              required
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono bg-white"
            />
          </div>

          <SelectWithCustom
            label="Assigned To"
            required
            value={assignedTo}
            onChange={(v) => setAssignedTo(v)}
            options={db.users.map((u) => u.fullName)}
            placeholder="Staff name..."
          />

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Animal (Optional)</label>
            <select
              value={animalId}
              onChange={(e) => setAnimalId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-mono"
            >
              <option value="">General</option>
              {db.animals.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.currentTag} — {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3 flex justify-end gap-2">
            <button
              type="submit"
              className="px-4 py-2 font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
            >
              Save
            </button>
          </div>
        </form>
      )}

      <div className="liquid-glass-panel rounded-xl overflow-hidden">
        {filteredTasks.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No tasks found.
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="py-3 px-4 font-semibold">Due Date</th>
                <th className="py-3 px-4 font-semibold">Category</th>
                <th className="py-3 px-4 font-semibold">Task</th>
                <th className="py-3 px-4 font-semibold">Assigned</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredTasks.map((task) => {
                const isOverdue =
                  task.status === 'Overdue' ||
                  (task.status === 'Pending' && task.dueDate < todayStr);
                const anm = task.animalId
                  ? db.animals.find((a) => a.id === task.animalId)
                  : null;

                return (
                  <tr key={task.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono">
                      <div
                        className={
                          isOverdue && task.status !== 'Completed'
                            ? 'text-red-700 font-bold flex items-center gap-1'
                            : 'text-slate-900 font-semibold'
                        }
                      >
                        {isOverdue && task.status !== 'Completed' && (
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        )}
                        {task.dueDate}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800">{task.category}</td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{task.title}</p>
                      {anm && (
                        <button
                          type="button"
                          onClick={() => onOpenAnimalProfile(anm)}
                          className="font-mono text-emerald-700 hover:underline mt-0.5 inline-block"
                        >
                          {anm.currentTag} ({anm.name})
                        </button>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-700">{task.assignedTo}</td>
                    <td className="py-3 px-4">
                      <span
                        className={
                          task.status === 'Completed'
                            ? 'text-emerald-700 font-semibold'
                            : isOverdue
                            ? 'text-red-700 font-semibold'
                            : 'text-slate-700 font-medium'
                        }
                      >
                        {isOverdue && task.status === 'Pending' ? 'Overdue' : task.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                      {canWrite && task.status !== 'Completed' && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateTaskStatus(
                                task.id,
                                'Completed',
                                `Completed by ${currentUser.fullName}`
                              )
                            }
                            className="px-2.5 py-1 text-xs font-medium text-emerald-800 border border-emerald-300 rounded hover:bg-emerald-50"
                          >
                            Done
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateTaskStatus(
                                task.id,
                                'Dismissed',
                                `Dismissed by ${currentUser.fullName}`
                              )
                            }
                            className="px-2.5 py-1 text-xs font-medium text-slate-600 border border-slate-300 rounded hover:bg-slate-100"
                          >
                            Dismiss
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
