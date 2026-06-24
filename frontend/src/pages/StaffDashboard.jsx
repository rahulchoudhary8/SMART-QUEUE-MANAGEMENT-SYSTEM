import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';

export default function StaffDashboard() {
  const navigate = useNavigate();
  const [staff, setStaff] = useState(null);
  const [queue, setQueue] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const staffData = JSON.parse(localStorage.getItem('hqs_staff'));
    setStaff(staffData);

    if (staffData?.deptId) {
      fetchQueue(staffData.deptId);
      fetchSummary(staffData.deptId);

      const newSocket = io();
      newSocket.on('queue-updated', () => {
        fetchQueue(staffData.deptId);
        fetchSummary(staffData.deptId);
      });
      setSocket(newSocket);
    }

    return () => {
      if (newSocket) newSocket.disconnect();
    };
  }, []);

  const fetchQueue = async (deptId) => {
    try {
      const res = await axios.get(`/api/dept/${deptId}/queue`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('hqs_token')}` }
      });
      setQueue(res.data);
    } catch (err) {
      console.error('Error fetching queue:', err);
    }
  };

  const fetchSummary = async (deptId) => {
    try {
      const res = await axios.get(`/api/dept/${deptId}/summary`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('hqs_token')}` }
      });
      setSummary(res.data);
    } catch (err) {
      console.error('Error fetching summary:', err);
    }
  };

  const callNext = async () => {
    if (!staff?.deptId) return;
    setLoading(true);
    try {
      const res = await axios.post(`/api/dept/${staff.deptId}/staff/call`, 
        { counterLabel: staff.counterLabel },
        { headers: { Authorization: `Bearer ${localStorage.getItem('hqs_token')}` } }
      );
      await fetchQueue(staff.deptId);
      await fetchSummary(staff.deptId);
    } catch (err) {
      console.error('Error calling next:', err);
    } finally {
      setLoading(false);
    }
  };

  const markDone = async (tokenNumber) => {
    if (!staff?.deptId) return;
    try {
      await axios.post(`/api/dept/${staff.deptId}/staff/mark`,
        { tokenNumber, action: 'done' },
        { headers: { Authorization: `Bearer ${localStorage.getItem('hqs_token')}` } }
      );
      await fetchQueue(staff.deptId);
      await fetchSummary(staff.deptId);
    } catch (err) {
      console.error('Error marking done:', err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('hqs_token');
    localStorage.removeItem('hqs_staff');
    navigate('/staff/login');
  };

  if (!staff) return <div className="p-4">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-primary">Staff Dashboard</h1>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Logout
          </button>
        </div>

        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <p className="text-lg font-semibold">Welcome, {staff.name}</p>
          <p className="text-gray-600">Role: {staff.role}</p>
          {staff.counterLabel && <p className="text-gray-600">Counter: {staff.counterLabel}</p>}
        </div>

        {summary && (
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-100 p-4 rounded-lg">
              <p className="text-gray-600">Waiting</p>
              <p className="text-3xl font-bold text-blue-600">{summary.waiting}</p>
            </div>
            <div className="bg-green-100 p-4 rounded-lg">
              <p className="text-gray-600">Active</p>
              <p className="text-3xl font-bold text-green-600">{summary.active}</p>
            </div>
            <div className="bg-orange-100 p-4 rounded-lg">
              <p className="text-gray-600">Done</p>
              <p className="text-3xl font-bold text-orange-600">{summary.done}</p>
            </div>
            <div className="bg-purple-100 p-4 rounded-lg">
              <p className="text-gray-600">ETA (min)</p>
              <p className="text-3xl font-bold text-purple-600">{summary.etaMinutes}</p>
            </div>
          </div>
        )}

        <button
          onClick={callNext}
          disabled={loading}
          className="w-full bg-primary text-white font-bold py-3 rounded-lg mb-6 hover:bg-opacity-90 disabled:opacity-50"
        >
          {loading ? 'Processing...' : 'Call Next Token'}
        </button>

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-2 text-left">Token</th>
                <th className="px-4 py-2 text-left">Patient</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Priority</th>
                <th className="px-4 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {queue.map(token => (
                <tr key={token._id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2 font-semibold">{token.tokenNumber}</td>
                  <td className="px-4 py-2">{token.patientName}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-1 rounded text-white text-sm ${
                      token.status === 'active' ? 'bg-green-500' :
                      token.status === 'waiting' ? 'bg-orange-500' :
                      token.status === 'done' ? 'bg-blue-500' :
                      'bg-gray-500'
                    }`}>
                      {token.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-1 rounded text-white text-sm ${
                      token.priority === 'emergency' ? 'bg-red-500' :
                      token.priority === 'elderly' ? 'bg-yellow-500' :
                      'bg-gray-500'
                    }`}>
                      {token.priority}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {token.status === 'active' && (
                      <button
                        onClick={() => markDone(token.tokenNumber)}
                        className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                      >
                        Mark Done
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
