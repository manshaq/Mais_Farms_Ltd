import React, { useState } from 'react';
import { MaisDatabaseState, StaffRole, StaffUser } from '../../types/mais';
import { SelectWithCustom } from '../SelectWithCustom';

interface StaffTabProps {
  db: MaisDatabaseState;
  currentUser: StaffUser;
  canManageStaff: boolean;
  onCreateStaffUser: (payload: any) => Promise<void>;
  onUpdateStaffUser: (userId: string, payload: any) => Promise<void>;
  onDeleteStaffUser?: (userId: string) => Promise<void>;
}

export const StaffTab: React.FC<StaffTabProps> = ({
  db,
  currentUser,
  canManageStaff,
  onCreateStaffUser,
  onUpdateStaffUser,
  onDeleteStaffUser,
}) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<StaffRole>('Farm Manager');
  const [title, setTitle] = useState('Farm Manager');
  const [canApproveNewStaff, setCanApproveNewStaff] = useState(false);

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !password.trim()) return;
    await onCreateStaffUser({
      fullName,
      email,
      password,
      role,
      title,
      canApproveExpenses: role === 'Admin' ? true : role === 'Farm Manager' ? canApproveNewStaff : false,
    });
    setFullName('');
    setEmail('');
    setPassword('');
    setCanApproveNewStaff(false);
  };

  return (
    <div className="space-y-5">
      <div className="liquid-glass-panel rounded-xl overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <th className="py-3 px-4 font-semibold">Name</th>
              <th className="py-3 px-4 font-semibold">Email</th>
              <th className="py-3 px-4 font-semibold">Role</th>
              <th className="py-3 px-4 font-semibold">Expense Approval</th>
              <th className="py-3 px-4 font-semibold">Status</th>
              {canManageStaff && <th className="py-3 px-4 font-semibold text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {db.users.map((u) => {
              const isCurrent = u.id === currentUser.id;
              return (
                <tr key={u.id} className={isCurrent ? 'bg-emerald-50/40' : 'hover:bg-slate-50'}>
                  <td className="py-3 px-4">
                    <p className="font-semibold text-slate-900">{u.fullName}</p>
                    <p className="text-slate-500">{u.title}</p>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-600">{u.email}</td>
                  <td className="py-3 px-4">
                    {canManageStaff && !u.deleted ? (
                      <select
                        aria-label={`Role for ${u.fullName}`}
                        value={u.role}
                        onChange={(e) =>
                          onUpdateStaffUser(u.id, { role: e.target.value as StaffRole })
                        }
                        className="px-2.5 py-1 border border-slate-300 rounded bg-white font-semibold"
                      >
                        <option value="Admin">Admin</option>
                        <option value="Farm Manager">Farm Manager</option>
                        <option value="Read-Only Staff">Read-Only</option>
                      </select>
                    ) : (
                      <span className="font-semibold text-slate-900">{u.role}</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {canManageStaff && u.role === 'Farm Manager' && !u.deleted ? (
                      <input
                        type="checkbox"
                        aria-label={`Expense approval for ${u.fullName}`}
                        checked={u.canApproveExpenses}
                        onChange={(e) =>
                          onUpdateStaffUser(u.id, {
                            canApproveExpenses: e.target.checked,
                          })
                        }
                        className="mr-2"
                      />
                    ) : null}
                    <span>
                      {u.role === 'Admin'
                        ? 'Yes'
                        : u.role === 'Farm Manager' && u.canApproveExpenses
                        ? 'Yes (≤ ₦200,000)'
                        : 'No'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {canManageStaff && !isCurrent && !u.deleted ? (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateStaffUser(u.id, {
                            status: u.status === 'Active' ? 'Suspended' : 'Active',
                          })
                        }
                        className={`px-2.5 py-1 rounded-full font-semibold text-[11px] transition-colors ${
                          u.status === 'Active'
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-rose-100 hover:text-rose-800'
                            : 'bg-rose-100 text-rose-800 hover:bg-emerald-100 hover:text-emerald-800'
                        }`}
                        title={`Click to ${u.status === 'Active' ? 'suspend' : 'activate'} this account`}
                      >
                        {u.status}
                      </button>
                    ) : (
                      <span
                        className={`px-2.5 py-1 rounded-full font-semibold text-[11px] ${
                          u.deleted
                            ? 'bg-slate-100 text-slate-500'
                            : u.status === 'Active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {u.deleted ? 'Deactivated' : u.status}
                      </span>
                    )}
                  </td>
                  {canManageStaff && (
                    <td className="py-3 px-4 text-right">
                      {!isCurrent && !u.deleted && onDeleteStaffUser ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Are you sure you want to soft-delete ${u.fullName} (${u.email})? Their account will be deactivated and active sessions revoked, but all livestock, health, and expense records created by them will be preserved.`
                              )
                            ) {
                              onDeleteStaffUser(u.id);
                            }
                          }}
                          className="px-2.5 py-1 rounded text-rose-600 hover:bg-rose-50 border border-rose-200 font-semibold text-[11px] transition-colors"
                          title={`Soft-delete user ${u.fullName}`}
                        >
                          Delete
                        </button>
                      ) : u.deleted ? (
                        <span className="text-slate-400 text-[11px] italic">Deactivated</span>
                      ) : null}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canManageStaff && (
        <form
          onSubmit={handleAddStaff}
          className="liquid-glass-panel rounded-xl p-5 space-y-4 text-xs"
        >
          <h3 className="text-sm font-bold text-slate-900">Add Staff Member</h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-start">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Name *</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Full name"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Email *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@company.com"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono bg-white"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Password *</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              />
            </div>
            <SelectWithCustom
              label="Job Title"
              value={title}
              onChange={(v) => setTitle(v)}
              options={[
                'Farm Manager',
                'Veterinarian',
                'Store Officer',
                'Field Staff',
                'Accountant',
              ]}
              placeholder="Custom title..."
            />
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Role *</label>
              <div className="flex gap-2">
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as StaffRole)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Admin">Admin</option>
                  <option value="Farm Manager">Farm Manager</option>
                  <option value="Read-Only Staff">Read-Only</option>
                </select>
                <button
                  type="submit"
                  className="liquid-glass-btn-primary px-4 py-2 font-semibold rounded-lg shrink-0"
                >
                  Add
                </button>
              </div>
            </div>
            {role === 'Farm Manager' && (
              <div className="col-span-full flex items-center gap-2 pt-1 text-slate-700">
                <input
                  type="checkbox"
                  id="new-staff-can-approve"
                  checked={canApproveNewStaff}
                  onChange={(e) => setCanApproveNewStaff(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="new-staff-can-approve" className="font-semibold cursor-pointer">
                  Grant expense approval privileges up to ₦200,000 threshold
                </label>
              </div>
            )}
          </div>
        </form>
      )}
    </div>
  );
};
