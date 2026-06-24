import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Patient from './pages/Patient';
import StaffLogin from './pages/StaffLogin';
import StaffDashboard from './pages/StaffDashboard';
import AdminDashboard from './pages/AdminDashboard';
import DisplayBoard from './pages/DisplayBoard';
import TokenStatus from './pages/TokenStatus';

function getStaff() {
  try { return JSON.parse(localStorage.getItem('hqs_staff') || 'null'); } catch { return null; }
}

function ProtectedRoute({ children, adminOnly = false }) {
  const token = localStorage.getItem('hqs_token');
  const staff = getStaff();
  if (!token) return <Navigate to="/staff/login" replace />;
  if (adminOnly && staff?.role !== 'admin') return <Navigate to="/staff/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/patient" replace />} />
        <Route path="/patient" element={<Patient />} />
        <Route path="/token-status" element={<TokenStatus />} />
        <Route path="/display/:deptId" element={<DisplayBoard />} />
        <Route path="/display" element={<DisplayBoard />} />
        <Route path="/staff/login" element={<StaffLogin />} />
        <Route path="/staff/dashboard" element={
          <ProtectedRoute><StaffDashboard /></ProtectedRoute>
        } />
        <Route path="/admin" element={
          <ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}
