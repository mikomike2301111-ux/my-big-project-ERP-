import React, { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';

function ModalCard({ title, onClose, children, wide }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal-card ${wide ? 'wide' : ''}`} onClick={e => e.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function DepartmentSetupModal({ user, onClose, onSave, initial }) {
  const [form, setForm] = useState(initial && initial.id ? { ...initial } : {
    name: '', code: '', manager: '', description: '', budget: 0, location: '',
    costCenter: '', parentDepartment: '', status: 'Active', headcount: 0
  });
  const isEdit = Boolean(form.id);

  return (
    <ModalCard title={isEdit ? 'Edit Department' : 'Add New Department'} onClose={onClose} wide>
      <form className="settings-form-grid" onSubmit={e => { e.preventDefault(); onSave(form); }}>
        <fieldset className="settings-fieldset"><legend>Department Info</legend><div>
          <label>Department Name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Marketing" /></label>
          <label>Department Code<input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="e.g. MKT-001" /></label>
          <label>Manager<input value={form.manager} onChange={e => setForm({ ...form, manager: e.target.value })} placeholder="Department head name" /></label>
          <label>Parent Department<input value={form.parentDepartment} onChange={e => setForm({ ...form, parentDepartment: e.target.value })} placeholder="e.g. Operations" /></label>
          <label>Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            {['Active', 'Inactive', 'Restructuring'].map(s => <option key={s}>{s}</option>)}
          </select></label>
          <label>Headcount Target<input type="number" value={form.headcount} onChange={e => setForm({ ...form, headcount: Number(e.target.value) })} /></label>
        </div></fieldset>
        <fieldset className="settings-fieldset"><legend>Budget & Location</legend><div>
          <label>Annual Budget (KES)<input type="number" value={form.budget} onChange={e => setForm({ ...form, budget: Number(e.target.value) })} /></label>
          <label>Cost Center Code<input value={form.costCenter} onChange={e => setForm({ ...form, costCenter: e.target.value })} placeholder="CC-001" /></label>
          <label>Location/Office<input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Nairobi HQ, 2nd Floor" /></label>
          <label>Description<textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Department mandate, responsibilities..." /></label>
        </div></fieldset>
        <button className="primary-action" type="submit">{isEdit ? 'Update Department' : 'Save Department'}</button>
      </form>
    </ModalCard>
  );
}

export function EmployeeReportModal({ user, employee, onClose, onNavigate }) {
  if (!employee) return null;
  return (
    <ModalCard title={`Employee Report: ${employee.name}`} onClose={onClose} wide>
      <div className="dashboard-grid" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        <div className="span-12" style={{ display: 'flex', gap: 16, padding: 16, background: '#f9fafb', borderRadius: 12, marginBottom: 8 }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#050505', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700 }}>
            {employee.name?.[0] || 'U'}
          </div>
          <div>
            <h3 style={{ margin: 0 }}>{employee.name}</h3>
            <p style={{ margin: 0, color: '#667085' }}>{employee.position} · {employee.department}</p>
            <span className={`status ${(employee.status || 'Active').toLowerCase()}`}>{employee.status}</span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <button className="panel-action-button" onClick={() => { onNavigate?.('hr'); }}><span>📋</span> Full Profile</button>
            <button className="panel-action-button" onClick={() => downloadRowsFile(`employee-${employee.name}`, [employee], 'CSV')}><span>⬇</span> Export</button>
          </div>
        </div>

        <div className="settings-kv-grid span-6">
          <article><span>Employee No.</span><strong>{employee.employeeNo || 'N/A'}</strong></article>
          <article><span>Email</span><strong>{employee.email || 'N/A'}</strong></article>
          <article><span>Phone</span><strong>{employee.phone || 'N/A'}</strong></article>
          <article><span>Department</span><strong>{employee.department}</strong></article>
          <article><span>Position</span><strong>{employee.position}</strong></article>
          <article><span>Manager</span><strong>{employee.manager || 'N/A'}</strong></article>
          <article><span>Join Date</span><strong>{employee.joinDate || 'N/A'}</strong></article>
          <article><span>Employment Type</span><strong>{employee.employmentType}</strong></article>
        </div>

        <div className="settings-kv-grid span-6">
          <article><span>Pay Type</span><strong>{employee.payType}</strong></article>
          <article><span>Basic Salary</span><strong>{currency(employee.salary)}</strong></article>
          <article><span>Total Allowances</span><strong>{currency((employee.houseAllowance||0)+(employee.transportAllowance||0)+(employee.medicalAllowance||0)+(employee.communicationAllowance||0)+(employee.riskAllowance||0)+(employee.mealAllowance||0)+(employee.responsibilityAllowance||0))}</strong></article>
          <article><span>Annual Leave Balance</span><strong>{employee.leaveBalanceAnnual || 0} days</strong></article>
          <article><span>Sick Leave Balance</span><strong>{employee.leaveBalanceSick || 0} days</strong></article>
          <article><span>Casual Leave Balance</span><strong>{employee.leaveBalanceCasual || 0} days</strong></article>
          <article><span>KRA PIN</span><strong>{employee.kraPin || 'N/A'}</strong></article>
          <article><span>Payment Method</span><strong>{employee.paymentMethod || 'N/A'}</strong></article>
        </div>

        <div className="span-12">
          <table className="simple-table">
            <thead><tr><th>Metric</th><th>Value</th></tr></thead>
            <tbody>
              <tr><td>National ID</td><td>{employee.nationalId || 'N/A'}</td></tr>
              <tr><td>Bank Account</td><td>{employee.bankAccount ? `${employee.bankName} - ${employee.bankAccount}` : 'N/A'}</td></tr>
              <tr><td>M-Pesa Number</td><td>{employee.mpesaNumber || 'N/A'}</td></tr>
              <tr><td>Emergency Contact</td><td>{employee.emergencyContactName ? `${employee.emergencyContactName} (${employee.emergencyContactPhone})` : 'N/A'}</td></tr>
              <tr><td>Work Schedule</td><td>{employee.workSchedule || 'N/A'}</td></tr>
              <tr><td>Location</td><td>{employee.location || 'N/A'}</td></tr>
              <tr><td>Overtime Eligible</td><td>{employee.overtimeEligible || 'No'}</td></tr>
              <tr><td>Expected Hours/Day</td><td>{employee.expectedHoursPerDay || 8}h</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </ModalCard>
  );
}

export function SkillsMatrixModal({ user, employee, onClose, onSave }) {
  const [skills, setSkills] = useState(employee?.skills || [
    { name: '', category: 'Technical', proficiency: 'Beginner', yearsExperience: 0, certification: '' }
  ]);

  const addSkill = () => setSkills([...skills, { name: '', category: 'Technical', proficiency: 'Beginner', yearsExperience: 0, certification: '' }]);
  const updateSkill = (i, field, val) => {
    const next = [...skills];
    next[i] = { ...next[i], [field]: val };
    setSkills(next);
  };
  const removeSkill = i => setSkills(skills.filter((_, idx) => idx !== i));

  return (
    <ModalCard title={`Skills Matrix: ${employee?.name || 'Employee'}`} onClose={onClose} wide>
      <form onSubmit={e => { e.preventDefault(); onSave?.({ employeeId: employee?.id, skills }); }}>
        {skills.map((skill, i) => (
          <div key={i} className="modal-grid" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1.2fr auto', gap: 8, alignItems: 'end', marginBottom: 8, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
            <label>Skill<input value={skill.name} onChange={e => updateSkill(i, 'name', e.target.value)} placeholder="e.g. React" /></label>
            <label>Category<select value={skill.category} onChange={e => updateSkill(i, 'category', e.target.value)}>
              {['Technical', 'Soft Skills', 'Management', 'Industry', 'Compliance', 'Safety'].map(c => <option key={c}>{c}</option>)}
            </select></label>
            <label>Proficiency<select value={skill.proficiency} onChange={e => updateSkill(i, 'proficiency', e.target.value)}>
              {['Beginner', 'Intermediate', 'Advanced', 'Expert'].map(p => <option key={p}>{p}</option>)}
            </select></label>
            <label>Years<input type="number" value={skill.yearsExperience} onChange={e => updateSkill(i, 'yearsExperience', Number(e.target.value))} /></label>
            <label>Certification<input value={skill.certification} onChange={e => updateSkill(i, 'certification', e.target.value)} placeholder="Cert name" /></label>
            <button type="button" className="mini-action" onClick={() => removeSkill(i)} style={{ color: '#ef4444', marginBottom: 8 }}><Trash2 size={14} /></button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button type="button" className="panel-action-button" onClick={addSkill}><Plus size={14} /> Add Skill</button>
          <button type="submit" className="primary-action">Save Skills Matrix</button>
        </div>
      </form>
    </ModalCard>
  );
}

export function TrainingModal({ user, employees, onClose, onSave }) {
  const [form, setForm] = useState({
    employeeId: '', courseName: '', provider: '', startDate: new Date().toISOString().slice(0, 10),
    endDate: '', cost: 0, status: 'Planned', certificationExpiry: '', notes: ''
  });

  return (
    <ModalCard title="Training & Development Record" onClose={onClose} wide>
      <form className="settings-form-grid" onSubmit={e => { e.preventDefault(); onSave(form); }}>
        <fieldset className="settings-fieldset"><legend>Training Details</legend><div>
          <label>Employee<select value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })} required>
            <option value="">Select employee...</option>
            {employees?.map(emp => <option key={emp.id} value={emp.id}>{emp.name} - {emp.department}</option>)}
          </select></label>
          <label>Course Name<input value={form.courseName} onChange={e => setForm({ ...form, courseName: e.target.value })} required placeholder="e.g. Advanced Excel" /></label>
          <label>Training Provider<input value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })} placeholder="e.g. KASNEB" /></label>
          <label>Start Date<input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} /></label>
          <label>End Date<input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} /></label>
          <label>Cost (KES)<input type="number" value={form.cost} onChange={e => setForm({ ...form, cost: Number(e.target.value) })} /></label>
          <label>Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            {['Planned', 'In Progress', 'Completed', 'Cancelled'].map(s => <option key={s}>{s}</option>)}
          </select></label>
          <label>Certification Expiry<input type="date" value={form.certificationExpiry} onChange={e => setForm({ ...form, certificationExpiry: e.target.value })} /></label>
          <label>Notes<textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
        </div></fieldset>
        <button className="primary-action" type="submit">Save Training Record</button>
      </form>
    </ModalCard>
  );
}

export function DisciplinaryModal({ user, employees, onClose, onSave }) {
  const [form, setForm] = useState({
    employeeId: '', incidentDate: new Date().toISOString().slice(0, 10), type: 'Warning',
    description: '', issuedBy: '', action: '', status: 'Open', followUpDate: ''
  });

  return (
    <ModalCard title="Disciplinary Record" onClose={onClose} wide>
      <form className="settings-form-grid" onSubmit={e => { e.preventDefault(); onSave(form); }}>
        <fieldset className="settings-fieldset"><legend>Incident Details</legend><div>
          <label>Employee<select value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })} required>
            <option value="">Select employee...</option>
            {employees?.map(emp => <option key={emp.id} value={emp.id}>{emp.name} - {emp.department}</option>)}
          </select></label>
          <label>Incident Date<input type="date" value={form.incidentDate} onChange={e => setForm({ ...form, incidentDate: e.target.value })} /></label>
          <label>Type<select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            {['Warning', 'Verbal Warning', 'Written Warning', 'Suspension', 'Termination'].map(t => <option key={t}>{t}</option>)}
          </select></label>
          <label>Description<textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required placeholder="Describe the incident..." /></label>
          <label>Action Taken<input value={form.action} onChange={e => setForm({ ...form, action: e.target.value })} placeholder="e.g. Final written warning issued" /></label>
          <label>Issued By<input value={form.issuedBy} onChange={e => setForm({ ...form, issuedBy: e.target.value })} placeholder="Manager/HR name" /></label>
          <label>Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            {['Open', 'Resolved', 'Dismissed'].map(s => <option key={s}>{s}</option>)}
          </select></label>
          <label>Follow-up Date<input type="date" value={form.followUpDate} onChange={e => setForm({ ...form, followUpDate: e.target.value })} /></label>
        </div></fieldset>
        <button className="primary-action" type="submit">Save Disciplinary Record</button>
      </form>
    </ModalCard>
  );
}

export function OnboardingModal({ user, employees, onClose, onSave }) {
  const tasks = [
    'Employment Contract Signed', 'ID/Passport Copy', 'KRA PIN Registration', 'NSSF Registration',
    'NHIF Registration', 'Bank Account Setup', 'Emergency Contact Form', 'Company Policy Acknowledgment',
    'IT Account Setup (Email, System)', 'Workstation/Equipment Assigned', 'Office Badge/ID Card',
    'Orientation Session Scheduled', 'Department Onboarding', 'Safety Training', 'Mentor/Buddy Assigned'
  ];
  const [form, setForm] = useState({
    employeeId: '', startDate: new Date().toISOString().slice(0, 10),
    completedTasks: [], status: 'In Progress', notes: ''
  });
  const toggleTask = task => {
    setForm({
      ...form,
      completedTasks: form.completedTasks.includes(task)
        ? form.completedTasks.filter(t => t !== task)
        : [...form.completedTasks, task]
    });
  };

  return (
    <ModalCard title="Onboarding Checklist" onClose={onClose} wide>
      <form className="settings-form-grid" onSubmit={e => { e.preventDefault(); onSave(form); }}>
        <fieldset className="settings-fieldset"><legend>Onboarding Details</legend><div>
          <label>Employee<select value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })} required>
            <option value="">Select employee...</option>
            {employees?.filter(e => e.status === 'Active').map(emp => <option key={emp.id} value={emp.id}>{emp.name} - {emp.position}</option>)}
          </select></label>
          <label>Start Date<input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} /></label>
          <label>Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
            {['In Progress', 'Completed', 'On Hold'].map(s => <option key={s}>{s}</option>)}
          </select></label>
        </div></fieldset>
        <fieldset className="settings-fieldset"><legend>Checklist ({form.completedTasks.length}/{tasks.length} completed)</legend><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {tasks.map(task => (
            <label key={task} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 0' }}>
              <input type="checkbox" checked={form.completedTasks.includes(task)} onChange={() => toggleTask(task)} />
              <span style={{ textDecoration: form.completedTasks.includes(task) ? 'line-through' : 'none', color: form.completedTasks.includes(task) ? '#22c55e' : '#344054', fontSize: 13 }}>{task}</span>
            </label>
          ))}
        </div></fieldset>
        <fieldset className="settings-fieldset"><legend>Notes</legend><div>
          <label>Notes<textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Additional onboarding notes..." /></label>
        </div></fieldset>
        <button className="primary-action" type="submit">Save Onboarding Record</button>
      </form>
    </ModalCard>
  );
}

export function ExitInterviewModal({ user, employees, onClose, onSave }) {
  const [form, setForm] = useState({
    employeeId: '', exitDate: new Date().toISOString().slice(0, 10), reason: '',
    resignationType: 'Voluntary', rehireEligible: 'Yes', feedback: '',
    exitInterviewDate: '', clearanceDone: false, finalSettlement: 0, notes: ''
  });

  return (
    <ModalCard title="Exit Management" onClose={onClose} wide>
      <form className="settings-form-grid" onSubmit={e => { e.preventDefault(); onSave(form); }}>
        <fieldset className="settings-fieldset"><legend>Exit Details</legend><div>
          <label>Employee<select value={form.employeeId} onChange={e => setForm({ ...form, employeeId: e.target.value })} required>
            <option value="">Select employee...</option>
            {employees?.map(emp => <option key={emp.id} value={emp.id}>{emp.name} - {emp.department}</option>)}
          </select></label>
          <label>Exit Date<input type="date" value={form.exitDate} onChange={e => setForm({ ...form, exitDate: e.target.value })} /></label>
          <label>Exit Interview Date<input type="date" value={form.exitInterviewDate} onChange={e => setForm({ ...form, exitInterviewDate: e.target.value })} /></label>
          <label>Resignation Type<select value={form.resignationType} onChange={e => setForm({ ...form, resignationType: e.target.value })}>
            {['Voluntary', 'Involuntary', 'Retirement', 'End of Contract'].map(t => <option key={t}>{t}</option>)}
          </select></label>
          <label>Reason for Leaving<textarea rows={3} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Reason for exit..." /></label>
          <label>Feedback<textarea rows={3} value={form.feedback} onChange={e => setForm({ ...form, feedback: e.target.value })} placeholder="Exit interview feedback..." /></label>
          <label>Rehire Eligible<select value={form.rehireEligible} onChange={e => setForm({ ...form, rehireEligible: e.target.value })}>
            {['Yes', 'No', 'Conditional'].map(r => <option key={r}>{r}</option>)}
          </select></label>
          <label>Final Settlement (KES)<input type="number" value={form.finalSettlement} onChange={e => setForm({ ...form, finalSettlement: Number(e.target.value) })} /></label>
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={form.clearanceDone} onChange={e => setForm({ ...form, clearanceDone: e.target.checked })} />
            Clearance Completed
          </label>
          <label>Notes<textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
        </div></fieldset>
        <button className="primary-action" type="submit">Save Exit Record</button>
      </form>
    </ModalCard>
  );
}

export function HRCalendar({ employees }) {
  const today = new Date();
  const currentMonth = today.toLocaleString('default', { month: 'long', year: 'numeric' });
  
  const birthdays = (employees || []).filter(e => {
    if (!e.joinDate) return false;
    const d = new Date(e.joinDate);
    return d.getMonth() === today.getMonth();
  });

  const anniversaries = (employees || []).filter(e => {
    if (!e.joinDate) return false;
    const d = new Date(e.joinDate);
    return d.getMonth() === today.getMonth() && d.getDate() >= today.getDate() - 7;
  });

  return (
    <div className="dashboard-grid">
      <Panel className="span-6" title={`Birthdays - ${currentMonth}`}>
        {birthdays.length === 0 && <div className="empty-state">No birthdays this month</div>}
        {birthdays.map(e => (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #f2f4f7' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🎂</div>
            <div><strong>{e.name}</strong><br /><span style={{ fontSize: 12, color: '#667085' }}>{e.department} · {new Date(e.joinDate).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}</span></div>
          </div>
        ))}
      </Panel>
      <Panel className="span-6" title="Work Anniversaries">
        {anniversaries.length === 0 && <div className="empty-state">No work anniversaries this period</div>}
        {anniversaries.map(e => {
          const years = Math.floor((Date.now() - new Date(e.joinDate).getTime()) / 31536000000);
          return (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #f2f4f7' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🎉</div>
              <div><strong>{e.name}</strong><br /><span style={{ fontSize: 12, color: '#667085' }}>{years} year{years !== 1 ? 's' : ''} · {e.position}</span></div>
            </div>
          );
        })}
      </Panel>
      <Panel className="span-12" title="Upcoming Events & Holidays">
        <div className="empty-state">Event calendar integration coming soon. Use the HR calendar to track public holidays, team events, and important dates.</div>
      </Panel>
    </div>
  );
}

export function ShiftScheduler({ employees, attendanceRecords }) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const shifts = ['Day Shift (06:00-14:00)', 'Afternoon Shift (14:00-22:00)', 'Night Shift (22:00-06:00)', 'Flexible'];
  const [schedule, setSchedule] = useState({});

  const setShift = (empId, day, shift) => {
    setSchedule({ ...schedule, [`${empId}-${day}`]: shift });
  };

  return (
    <div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Department</th>
              {days.map(d => <th key={d}>{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {(employees || []).filter(e => e.status === 'Active').slice(0, 30).map(emp => (
              <tr key={emp.id}>
                <td><strong>{emp.name}</strong></td>
                <td>{emp.department}</td>
                {days.map(day => (
                  <td key={day}>
                    <select value={schedule[`${emp.id}-${day}`] || ''} onChange={e => setShift(emp.id, day, e.target.value)} style={{ maxWidth: 120, fontSize: 11, padding: '2px 4px' }}>
                      <option value="">-</option>
                      {shifts.map(s => <option key={s} value={s}>{s.replace(' (', ' ').slice(0, 15)}</option>)}
                    </select>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button className="primary-action">Save Schedule</button>
        <button className="panel-action-button">Print Schedule</button>
      </div>
    </div>
  );
}

export function OrgChart({ employees }) {
  const managers = [...new Set((employees || []).map(e => e.manager).filter(Boolean))];
  const topLevel = (employees || []).filter(e => !e.manager || e.manager === 'CEO');
  const getReports = manager => (employees || []).filter(e => e.manager === manager);

  return (
    <div style={{ textAlign: 'center', padding: 20 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'inline-block', padding: '16px 32px', background: '#050505', color: '#fff', borderRadius: 12, fontSize: 20, fontWeight: 700 }}>CEO</div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
        {managers.slice(0, 8).map(mgr => {
          const reports = getReports(mgr);
          return (
            <div key={mgr} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, minWidth: 180, background: '#f9fafb' }}>
              <div style={{ fontWeight: 700, color: '#050505', marginBottom: 8 }}>{mgr}</div>
              {reports.slice(0, 5).map(r => (
                <div key={r.id} style={{ padding: '4px 8px', margin: 2, background: '#fff', borderRadius: 6, fontSize: 12, border: '1px solid #f2f4f7' }}>
                  {r.name}<br /><span style={{ color: '#667085' }}>{r.position}</span>
                </div>
              ))}
              {reports.length > 5 && <div style={{ fontSize: 11, color: '#667085', marginTop: 4 }}>+{reports.length - 5} more</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Panel({ title, action, className = '', children }) {
  return (
    <div className={`panel ${className}`}>
      {(title || action) && (
        <div className="panel-header">
          {title && <h3>{title}</h3>}
          {action && <span className="panel-action">{action}</span>}
        </div>
      )}
      <div className="panel-content">{children}</div>
    </div>
  );
}