import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const API_BASE = 'https://checkinapp-wut1.onrender.com/api';

const EMPTY_SUMMARY = {
  total_employees: 0,
  present: 0,
  still_in: 0,
  checked_out: 0
};

const getTodayInIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

const formatTimeIST = (isoValue) => {
  if (!isoValue) return '--';
  return new Date(isoValue).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata'
  });
};

const getDuration = (checkInIso, checkOutIso) => {
  if (!checkInIso || !checkOutIso) return 'In Progress';

  const start = new Date(checkInIso).getTime();
  const end = new Date(checkOutIso).getTime();

  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return 'In Progress';
  }

  const totalMinutes = Math.floor((end - start) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours}h ${minutes}m`;
};

const getDepartment = (record) => record.employee_department || 'Unassigned';

function AdminDashboard() {
  const [token, setToken] = useState('');
  const [adminUser, setAdminUser] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [records, setRecords] = useState([]);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    date: getTodayInIST(),
    department: ''
  });

  // Create Employee Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    department: '',
    role: 'employee'
  });
  const [formStatus, setFormStatus] = useState({ type: '', message: '' });
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const rawUser = localStorage.getItem('user');
    let parsedUser = null;

    try {
      parsedUser = rawUser ? JSON.parse(rawUser) : null;
    } catch {
      parsedUser = null;
    }

    if (!storedToken || !parsedUser || parsedUser.role !== 'admin') {
      window.location.href = '/employee';
      return;
    }

    setToken(storedToken);
    setAdminUser(parsedUser);
  }, []);

  useEffect(() => {
    if (!token) return;

    let isMounted = true;

    const loadDashboardData = async () => {
      setLoading(true);
      setError('');

      try {
        const config = { headers: { Authorization: `Bearer ${token}` } };

        const [summaryResponse, recordsResponse] = await Promise.all([
          axios.get(`${API_BASE}/admin/summary`, config),
          axios.get(`${API_BASE}/admin/records`, config)
        ]);

        if (!isMounted) return;

        setSummary({ ...EMPTY_SUMMARY, ...(summaryResponse.data || {}) });
        setRecords(Array.isArray(recordsResponse.data) ? recordsResponse.data : []);
      } catch (requestError) {
        if (!isMounted) return;

        const statusCode = requestError?.response?.status;
        if (statusCode === 401 || statusCode === 403) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.href = '/employee';
          return;
        }

        setSummary({ ...EMPTY_SUMMARY });
        setRecords([]);
        setError('Failed to load admin monitoring data.');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadDashboardData();

    return () => {
      isMounted = false;
    };
  }, [token]);

  const departmentOptions = useMemo(() => {
    const values = new Set(records.map((record) => getDepartment(record)).filter(Boolean));
    return Array.from(values).sort((left, right) => left.localeCompare(right));
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const matchesDate = !filters.date || record.date === filters.date;
      const matchesDepartment = !filters.department || getDepartment(record) === filters.department;
      return matchesDate && matchesDepartment;
    });
  }, [records, filters]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/employee';
  };

  const handleCreateEmployee = async (e) => {
    e.preventDefault();
    setFormLoading(true);
    setFormStatus({ type: '', message: '' });

    try {
      const config = { headers: { Authorization: `Bearer ${token}` } };
      await axios.post(`${API_BASE}/auth/register`, formData, config);
      
      setFormStatus({ type: 'success', message: 'Employee created!' });
      setFormData({
        name: '',
        email: '',
        password: '',
        department: '',
        role: 'employee'
      });
      
      // Refresh dashboard data to reflect new employee in total count if applicable
      const summaryResponse = await axios.get(`${API_BASE}/admin/summary`, config);
      setSummary({ ...EMPTY_SUMMARY, ...(summaryResponse.data || {}) });
    } catch (err) {
      setFormStatus({ 
        type: 'error', 
        message: err.response?.data?.message || 'Failed to create employee.' 
      });
    } finally {
      setFormLoading(false);
    }
  };

  const exportCsv = () => {
    const headers = ['Name', 'Department', 'Date', 'Check In', 'Check Out', 'Duration', 'Status'];

    const rows = filteredRecords.map((record) => {
      const isCheckedOut = Boolean(record.check_out_time);
      return [
        record.employee_name || '',
        getDepartment(record),
        record.date || '',
        formatTimeIST(record.check_in_time),
        formatTimeIST(record.check_out_time),
        getDuration(record.check_in_time, record.check_out_time),
        isCheckedOut ? 'Checked Out' : 'Still In'
      ];
    });

    const escapeCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csvContent = [headers, ...rows]
      .map((row) => row.map(escapeCell).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const blobUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = blobUrl;
    link.setAttribute('download', `attendance-records-${filters.date || 'all'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(blobUrl);
  };

  const cards = [
    { label: 'Total Employees', value: summary.total_employees ?? 0 },
    { label: 'Present Today', value: summary.present ?? 0 },
    { label: 'Still In', value: summary.still_in ?? 0 },
    { label: 'Checked Out', value: summary.checked_out ?? 0 }
  ];

  return (
    <div style={styles.page}>
      <header style={styles.topbar}>
        <div style={styles.appName}>Innowell Attendance</div>
        <div style={styles.topbarRight}>
          <span style={styles.adminName}>{adminUser?.name || 'Admin'}</span>
          <button onClick={handleLogout} style={styles.logoutButton}>Logout</button>
        </div>
      </header>

      <main style={styles.main}>
        <div style={styles.tabBar}>
          <button
            onClick={() => setActiveTab('overview')}
            style={{
              ...styles.tabButton,
              ...(activeTab === 'overview' ? styles.tabButtonActive : null)
            }}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('records')}
            style={{
              ...styles.tabButton,
              ...(activeTab === 'records' ? styles.tabButtonActive : null)
            }}
          >
            Records
          </button>
          <button
            onClick={() => setActiveTab('create')}
            style={{
              ...styles.tabButton,
              ...(activeTab === 'create' ? styles.tabButtonActive : null)
            }}
          >
            Create Employee
          </button>
        </div>

        {loading && <div style={styles.loading}>Loading admin dashboard...</div>}
        {!loading && error && <div style={styles.error}>{error}</div>}

        {!loading && !error && activeTab === 'overview' && (
          <section style={styles.overviewGrid}>
            {cards.map((card) => (
              <article key={card.label} style={styles.summaryCard}>
                <div style={styles.summaryLabel}>{card.label}</div>
                <div style={styles.summaryValue}>{card.value}</div>
              </article>
            ))}
          </section>
        )}

        {!loading && !error && activeTab === 'create' && (
          <section style={styles.formContainer}>
            <h2 style={styles.sectionTitle}>Add New Employee</h2>
            <form onSubmit={handleCreateEmployee} style={styles.form}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Full Name</label>
                <input
                  required
                  style={styles.formControl}
                  type="text"
                  placeholder="Employee Name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Email Address</label>
                <input
                  required
                  style={styles.formControl}
                  type="email"
                  placeholder="email@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Password</label>
                <input
                  required
                  style={styles.formControl}
                  type="password"
                  placeholder="********"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Department</label>
                <input
                  required
                  style={styles.formControl}
                  type="text"
                  placeholder="e.g. Engineering, HR"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Role</label>
                <select
                  style={styles.formControl}
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                >
                  <option value="employee">Employee</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>

              <button
                disabled={formLoading}
                type="submit"
                style={{
                  ...styles.submitButton,
                  ...(formLoading ? styles.buttonDisabled : null)
                }}
              >
                {formLoading ? 'Creating...' : 'Create Employee'}
              </button>

              {formStatus.message && (
                <div style={{
                  ...styles.formMessage,
                  ...(formStatus.type === 'success' ? styles.formSuccess : styles.formError)
                }}>
                  {formStatus.message}
                </div>
              )}
            </form>
          </section>
        )}

        {!loading && !error && activeTab === 'records' && (
          <section style={styles.recordsSection}>
            <div style={styles.controlsRow}>
              <div style={styles.filtersRow}>
                <input
                  type="date"
                  value={filters.date}
                  onChange={(event) => {
                    const nextDate = event.target.value;
                    setFilters((previous) => ({ ...previous, date: nextDate }));
                  }}
                  style={styles.control}
                />

                <select
                  value={filters.department}
                  onChange={(event) => {
                    const nextDepartment = event.target.value;
                    setFilters((previous) => ({ ...previous, department: nextDepartment }));
                  }}
                  style={styles.control}
                >
                  <option value="">All Departments</option>
                  {departmentOptions.map((department) => (
                    <option key={department} value={department}>{department}</option>
                  ))}
                </select>
              </div>

              <button onClick={exportCsv} style={styles.exportButton}>Export CSV</button>
            </div>

            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Name</th>
                    <th style={styles.th}>Department</th>
                    <th style={styles.th}>Check-in Time</th>
                    <th style={styles.th}>Check-out Time</th>
                    <th style={styles.th}>Duration</th>
                    <th style={styles.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td style={styles.emptyCell} colSpan={6}>No records found for selected filters.</td>
                    </tr>
                  ) : (
                    filteredRecords.map((record) => {
                      const checkedOut = Boolean(record.check_out_time);
                      return (
                        <tr key={`${record.id}-${record.employee_name}-${record.date}`} style={styles.tr}>
                          <td style={styles.td}>{record.employee_name || '--'}</td>
                          <td style={styles.td}>{getDepartment(record)}</td>
                          <td style={styles.td}>{formatTimeIST(record.check_in_time)}</td>
                          <td style={styles.td}>{formatTimeIST(record.check_out_time)}</td>
                          <td style={styles.td}>{getDuration(record.check_in_time, record.check_out_time)}</td>
                          <td style={styles.td}>
                            <span style={checkedOut ? styles.statusCheckedOut : styles.statusStillIn}>
                              {checkedOut ? 'Checked Out' : 'Still In'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#f5f6f8'
  },
  topbar: {
    height: '58px',
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e7e9ee',
    padding: '0 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  appName: {
    fontSize: '17px',
    fontWeight: 700,
    color: '#151a24'
  },
  topbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  adminName: {
    fontSize: '13px',
    color: '#334155',
    fontWeight: 600
  },
  logoutButton: {
    border: '1px solid #d6deea',
    backgroundColor: '#ffffff',
    color: '#1e3a8a',
    fontSize: '12px',
    padding: '6px 12px',
    borderRadius: '8px',
    cursor: 'pointer'
  },
  main: {
    maxWidth: '1180px',
    margin: '0 auto',
    padding: '20px'
  },
  tabBar: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px'
  },
  tabButton: {
    border: '1px solid #d6deea',
    backgroundColor: '#ffffff',
    color: '#334155',
    fontSize: '13px',
    fontWeight: 600,
    borderRadius: '8px',
    padding: '8px 14px',
    cursor: 'pointer'
  },
  tabButtonActive: {
    backgroundColor: '#1d4ed8',
    color: '#ffffff',
    border: '1px solid #1d4ed8'
  },
  loading: {
    backgroundColor: '#ffffff',
    border: '1px solid #e7e9ee',
    borderRadius: '12px',
    padding: '20px',
    color: '#4b5563',
    fontSize: '14px'
  },
  error: {
    backgroundColor: '#fff1f2',
    border: '1px solid #fecdd3',
    color: '#9f1239',
    borderRadius: '12px',
    padding: '14px',
    fontSize: '13px'
  },
  overviewGrid: {
    display: 'grid',
    gap: '14px',
    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))'
  },
  summaryCard: {
    backgroundColor: '#ffffff',
    border: '1px solid #e7e9ee',
    borderRadius: '12px',
    padding: '16px'
  },
  summaryLabel: {
    fontSize: '12px',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.03em'
  },
  summaryValue: {
    marginTop: '10px',
    fontSize: '26px',
    lineHeight: 1,
    fontWeight: 700,
    color: '#0f172a'
  },
  recordsSection: {
    backgroundColor: '#ffffff',
    border: '1px solid #e7e9ee',
    borderRadius: '12px',
    padding: '14px'
  },
  controlsRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    flexWrap: 'wrap',
    marginBottom: '12px'
  },
  filtersRow: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap'
  },
  control: {
    height: '34px',
    border: '1px solid #d6deea',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    color: '#1f2937',
    fontSize: '13px',
    padding: '0 10px'
  },
  exportButton: {
    border: '1px solid #d6deea',
    backgroundColor: '#f8fafc',
    color: '#0f172a',
    fontSize: '13px',
    fontWeight: 600,
    borderRadius: '8px',
    padding: '8px 12px',
    cursor: 'pointer'
  },
  tableWrap: {
    width: '100%',
    overflowX: 'auto'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    minWidth: '760px'
  },
  th: {
    textAlign: 'left',
    fontSize: '12px',
    color: '#64748b',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    borderBottom: '1px solid #e7e9ee',
    padding: '10px 8px'
  },
  tr: {
    borderBottom: '1px solid #eef2f7'
  },
  td: {
    fontSize: '13px',
    color: '#1f2937',
    padding: '10px 8px'
  },
  emptyCell: {
    textAlign: 'center',
    color: '#94a3b8',
    padding: '18px 8px',
    fontSize: '13px'
  },
  statusStillIn: {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: '999px',
    padding: '4px 8px',
    backgroundColor: '#fff7ed',
    color: '#b45309',
    fontSize: '11px',
    fontWeight: 700
  },
  statusCheckedOut: {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: '999px',
    padding: '4px 8px',
    backgroundColor: '#ecfdf3',
    color: '#166534',
    fontSize: '11px',
    fontWeight: 700
  },
  formContainer: {
    backgroundColor: '#ffffff',
    border: '1px solid #e7e9ee',
    borderRadius: '12px',
    padding: '24px',
    maxWidth: '500px'
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: '#0f172a',
    margin: '0 0 20px 0'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  label: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#4b5563'
  },
  formControl: {
    height: '40px',
    border: '1px solid #d6deea',
    borderRadius: '8px',
    padding: '0 12px',
    fontSize: '14px',
    color: '#1f2937'
  },
  submitButton: {
    height: '42px',
    backgroundColor: '#1d4ed8',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '10px',
    transition: 'background-color 0.2s'
  },
  buttonDisabled: {
    backgroundColor: '#93c5fd',
    cursor: 'not-allowed'
  },
  formMessage: {
    padding: '10px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    marginTop: '12px',
    fontWeight: 500
  },
  formSuccess: {
    backgroundColor: '#ecfdf3',
    color: '#166534',
    border: '1px solid #d1fae5'
  },
  formError: {
    backgroundColor: '#fff1f2',
    color: '#9f1239',
    border: '1px solid #fee2e2'
  }
};

export default AdminDashboard;
