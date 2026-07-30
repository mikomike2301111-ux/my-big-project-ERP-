import React, { useRef } from 'react';

const fmt = (v) => {
  const n = Number(v || 0);
  return `KES ${n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtInt = (v) => Number(v || 0).toLocaleString('en-KE');

export default function PaySlip({ employee, payroll, company, period, onClose, onPrint }) {
  const ref = useRef(null);

  const comp = company || {};
  const emp = employee || {};
  const pay = payroll || {};
  const per = period || { from: '—', to: '—', date: '—' };

  const earnings = [
    { label: 'Basic Salary', rate: pay.basicSalary || emp.salary || 0, hours: pay.hoursWorked || 0, current: pay.basicSalary || emp.salary || 0, ytd: pay.ytdBasic || (pay.basicSalary || emp.salary || 0) * 12 },
    { label: 'House Allowance', rate: 0, hours: 0, current: pay.houseAllowance || 0, ytd: pay.ytdHouseAllowance || (pay.houseAllowance || 0) * 12 },
    { label: 'Transport Allowance', rate: 0, hours: 0, current: pay.transportAllowance || 0, ytd: pay.ytdTransportAllowance || (pay.transportAllowance || 0) * 12 },
    { label: 'Medical Allowance', rate: 0, hours: 0, current: pay.medicalAllowance || 0, ytd: pay.ytdMedicalAllowance || (pay.medicalAllowance || 0) * 12 },
    { label: 'Overtime Pay', rate: pay.overtimeRate || 0, hours: pay.overtimeHours || 0, current: pay.overtimePay || 0, ytd: pay.ytdOvertimePay || (pay.overtimePay || 0) * 12 },
    { label: 'Bonus / Commission', rate: 0, hours: 0, current: pay.bonus || 0, ytd: pay.ytdBonus || (pay.bonus || 0) * 12 },
  ].filter(e => Number(e.current) > 0 || Number(e.ytd) > 0);

  const deductions = [
    { label: 'PAYE (Income Tax)', current: pay.paye || 0, ytd: pay.ytdPaye || (pay.paye || 0) * 12 },
    { label: 'NSSF (Pension)', current: pay.nssf || 0, ytd: pay.ytdNssf || (pay.nssf || 0) * 12 },
    { label: 'NHIF (Health Insurance)', current: pay.nhif || 0, ytd: pay.ytdNhif || (pay.nhif || 0) * 12 },
    { label: 'SHIF (Social Health)', current: pay.shif || 0, ytd: pay.ytdShif || (pay.shif || 0) * 12 },
    { label: 'Affordable Housing Levy', current: pay.ahl || 0, ytd: pay.ytdAhl || (pay.ahl || 0) * 12 },
    { label: 'Staff Loan Repayment', current: pay.loanDeduction || 0, ytd: pay.ytdLoanDeduction || (pay.loanDeduction || 0) * 12 },
    { label: 'SACCO / Cooperative', current: pay.sacco || 0, ytd: pay.ytdSacco || (pay.sacco || 0) * 12 },
    { label: 'Other Deductions', current: pay.otherDeductions || 0, ytd: pay.ytdOtherDeductions || (pay.otherDeductions || 0) * 12 },
  ].filter(d => Number(d.current) > 0 || Number(d.ytd) > 0);

  const totalEarnings = earnings.reduce((s, e) => s + Number(e.current), 0);
  const totalEarningsYtd = earnings.reduce((s, e) => s + Number(e.ytd), 0);
  const totalDeductions = deductions.reduce((s, d) => s + Number(d.current), 0);
  const totalDeductionsYtd = deductions.reduce((s, d) => s + Number(d.ytd), 0);
  const grossPay = pay.grossPay || totalEarnings;
  const grossPayYtd = pay.ytdGrossPay || totalEarningsYtd;
  const netPay = pay.netPay || (grossPay - totalDeductions);
  const netPayYtd = pay.ytdNetPay || (grossPayYtd - totalDeductionsYtd);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="pay-slip-modal" onClick={e => e.stopPropagation()} ref={ref}>
        <div className="pay-slip-header">
          <div className="pay-slip-company">
            <strong>{comp.company_name || 'FarmTrack ERP'}</strong>
            <span>{comp.company_address || 'Nairobi, Kenya'}</span>
            <span>{comp.company_phone || '—'} | Email: {comp.company_email || '—'}</span>
            <span>{comp.website || 'www.farmtrack.co.ke'}</span>
          </div>
        </div>

        <h1 className="pay-slip-title">Pay Stub</h1>

        <div className="pay-slip-info-grid">
          <div className="pay-slip-info-block">
            <div className="pay-slip-info-row">
              <label>Employer Name:</label>
              <span>{comp.company_name || 'FarmTrack ERP'}</span>
            </div>
          </div>
          <div className="pay-slip-info-block">
            <div className="pay-slip-info-row">
              <label>Address:</label>
              <span>{comp.company_address || 'Nairobi, Kenya'}</span>
            </div>
          </div>
        </div>

        <div className="pay-slip-divider" />

        <div className="pay-slip-info-grid">
          <div className="pay-slip-info-block">
            <div className="pay-slip-info-row">
              <label>Employee Name:</label>
              <span>{emp.name || '—'}</span>
            </div>
            <div className="pay-slip-info-row">
              <label>Position/Title:</label>
              <span>{emp.position || '—'}</span>
            </div>
            <div className="pay-slip-info-row">
              <label>Payment Method:</label>
              <span>{emp.paymentMethod || emp.bankName || 'Bank Transfer'}</span>
            </div>
          </div>
          <div className="pay-slip-info-block">
            <div className="pay-slip-info-row">
              <label>Employee ID No:</label>
              <span>{emp.employeeNo || emp.id || '—'}</span>
            </div>
            <div className="pay-slip-info-row">
              <label>Address:</label>
              <span>{emp.address || emp.location || '—'}</span>
            </div>
          </div>
        </div>

        <div className="pay-slip-period-bar">
          <div>
            <label>Payment Period (From)</label>
            <span>{per.from}</span>
          </div>
          <div>
            <label>Payment Period (To)</label>
            <span>{per.to}</span>
          </div>
          <div>
            <label>Payment Date</label>
            <span>{per.date}</span>
          </div>
        </div>

        <h2 className="pay-slip-section-title">Earnings</h2>
        <table className="pay-slip-table">
          <thead>
            <tr>
              <th className="pay-slip-col-label">Description</th>
              <th className="pay-slip-col-rate">Rate</th>
              <th className="pay-slip-col-hours">Hours</th>
              <th className="pay-slip-col-currency">Current Total</th>
              <th className="pay-slip-col-currency">YTD (Year to Date)</th>
            </tr>
          </thead>
          <tbody>
            {earnings.map((e, i) => (
              <tr key={i}>
                <td className="pay-slip-col-label">{e.label}</td>
                <td className="pay-slip-col-rate">{Number(e.rate) > 0 ? fmt(e.rate) : '—'}</td>
                <td className="pay-slip-col-hours">{Number(e.hours) > 0 ? fmtInt(e.hours) : '—'}</td>
                <td className="pay-slip-col-currency">{fmt(e.current)}</td>
                <td className="pay-slip-col-currency">{fmt(e.ytd)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="pay-slip-gross-row">
          <span className="pay-slip-gross-label">Gross Pay</span>
          <span className="pay-slip-gross-value">{fmt(grossPay)}</span>
          <span className="pay-slip-gross-value">{fmt(grossPayYtd)}</span>
        </div>

        <h2 className="pay-slip-section-title">Deductions</h2>
        <table className="pay-slip-table deductions">
          <thead>
            <tr>
              <th className="pay-slip-col-label">Description</th>
              <th className="pay-slip-col-currency">Current Total</th>
              <th className="pay-slip-col-currency">YTD (Year to Date)</th>
            </tr>
          </thead>
          <tbody>
            {deductions.map((d, i) => (
              <tr key={i}>
                <td className="pay-slip-col-label">{d.label}</td>
                <td className="pay-slip-col-currency">{fmt(d.current)}</td>
                <td className="pay-slip-col-currency">{fmt(d.ytd)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="pay-slip-total-row">
          <span className="pay-slip-total-label">Total Deductions</span>
          <span className="pay-slip-total-value">{fmt(totalDeductions)}</span>
          <span className="pay-slip-total-value">{fmt(totalDeductionsYtd)}</span>
        </div>

        <h2 className="pay-slip-section-title">Net Pay</h2>
        <div className="pay-slip-net-table">
          <div className="pay-slip-net-header">
            <span>Description</span>
            <span>Current Total</span>
            <span>YTD (Year to Date)</span>
          </div>
          <div className="pay-slip-net-row">
            <span className="pay-slip-net-label">Net Pay</span>
            <span className="pay-slip-net-value">{fmt(netPay)}</span>
            <span className="pay-slip-net-value">{fmt(netPayYtd)}</span>
          </div>
        </div>

        <div className="pay-slip-footer">
          <div className="pay-slip-bank-info">
            <strong>Bank Details</strong>
            <span>Bank: {emp.bankName || '—'}</span>
            <span>Account: {emp.bankAccount || '—'}</span>
            <span>Account Name: {emp.bankAccountName || emp.name || '—'}</span>
          </div>
          <div className="pay-slip-tax-info">
            <strong>Tax Information</strong>
            <span>KRA PIN: {emp.kraPin || '—'}</span>
            <span>Tax Category: {emp.taxCategory || 'Resident'}</span>
          </div>
        </div>

        <div className="pay-slip-actions">
          <button className="secondary-action" onClick={onClose}>Close</button>
          <button className="primary-action" onClick={() => onPrint?.(ref)}>Print / Save PDF</button>
        </div>
      </div>
    </div>
  );
}
