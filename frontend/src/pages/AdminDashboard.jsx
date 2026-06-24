import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('hospitals');
  const [hospitals, setHospitals] = useState([]);
  const [staff, setStaff] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [selectedHospital, setSelectedHospital] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const staffData = JSON.parse(localStorage.getItem('hqs_staff'));
    if (staffData?.role !== 'admin') {
      navigate('/staff/dashboard');
      return;
    }
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const headers = { Authorization: `Bearer ${localStorage.getItem('hqs_token')}` };
      const [hRes, sRes] = await Promise.all([
        axios.get('/api/admin/hospitals', { headers }),
        axios.get('/api/admin/staff', { headers })
      ]);
      setHospitals(hRes.data);
      setStaff(sRes.data);
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('hqs_token');
    localStorage.removeItem('hqs_staff');
    navigate('/staff/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-primary">Admin Dashboard</h1>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Logout
          </button>
        </div>

        <div className="flex space-x-4 mb-6">
          <button
            onClick={() => setActiveTab('hospitals')}
            className={`px-4 py-2 rounded ${activeTab === 'hospitals' ? 'bg-primary text-white' : 'bg-white'}`}
          >
            Hospitals
          </button>
          <button
            onClick={() => setActiveTab('staff')}
            className={`px-4 py-2 rounded ${activeTab === 'staff' ? 'bg-primary text-white' : 'bg-white'}`}
          >
            Staff
          </button>
        </div>

        {activeTab === 'hospitals' && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Address</th>
                  <th className="px-4 py-2 text-left">Phone</th>
                </tr>
              </thead>
              <tbody>
                {hospitals.map(h => (
                  <tr key={h._id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2">{h.name}</td>
                    <td className="px-4 py-2">{h.address}</td>
                    <td className="px-4 py-2">{h.phone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'staff' && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left">Username</th>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Role</th>
                  <th className="px-4 py-2 text-left">Department</th>
                </tr>
              </thead>
              <tbody>
                {staff.map(s => (
                  <tr key={s._id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2">{s.username}</td>
                    <td className="px-4 py-2">{s.name}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-1 rounded text-white text-sm ${
                        s.role === 'admin' ? 'bg-red-500' :
                        s.role === 'doctor' ? 'bg-blue-500' :
                        'bg-green-500'
                      }`}>
                        {s.role}
                      </span>
                    </td>
                    <td className="px-4 py-2">{s.deptId?.name || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
