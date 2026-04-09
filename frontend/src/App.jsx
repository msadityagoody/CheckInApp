import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import EmployeeApp from './pages/EmployeeApp';
import AdminDashboard from './pages/AdminDashboard';

function RootRedirect() {
  const rawUser = localStorage.getItem('user');
  let role = '';

  try {
    const parsedUser = rawUser ? JSON.parse(rawUser) : null;
    role = parsedUser?.role || '';
  } catch {
    role = '';
  }

  return <Navigate to={role === 'admin' ? '/admin' : '/employee'} replace />;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/employee" element={<EmployeeApp />} />
      <Route path="/admin" element={<AdminDashboard />} />
    </Routes>
  );
}

export default App;
