import React, { useState } from 'react';
import axios from 'axios';

export default function TokenStatus() {
  const [tokenNumber, setTokenNumber] = useState('');
  const [deptId, setDeptId] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCheck = async (e) => {
    e.preventDefault();
    
    if (!tokenNumber || !deptId) {
      setError('Please enter token number and department ID');
      return;
    }

    setLoading(true);
    setError('');
    setStatus(null);

    try {
      const res = await axios.get('/api/token/status', {
        params: { tokenNumber: parseInt(tokenNumber), deptId }
      });
      setStatus(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Error checking token status');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-md mx-auto mt-10 bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-3xl font-bold text-center text-primary mb-6">Check Token Status</h1>

        <form onSubmit={handleCheck} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Token Number</label>
            <input
              type="number"
              value={tokenNumber}
              onChange={(e) => setTokenNumber(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Department ID</label>
            <input
              type="text"
              value={deptId}
              onChange={(e) => setDeptId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white font-semibold py-2 rounded-md hover:bg-opacity-90 disabled:opacity-50"
          >
            {loading ? 'Checking...' : 'Check Status'}
          </button>
        </form>

        {error && (
          <p className="mt-4 text-center text-sm text-red-600">{error}</p>
        )}

        {status && (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded">
            <p className="text-sm font-semibold text-gray-700">Token #{status.tokenNumber}</p>
            <p className="text-sm text-gray-600 mt-2">Patient: {status.patientName}</p>
            <p className="text-sm text-gray-600">Department: {status.deptName}</p>
            <p className={`text-lg font-bold mt-2 ${
              status.status === 'active' ? 'text-green-600' :
              status.status === 'done' ? 'text-blue-600' :
              status.status === 'waiting' ? 'text-orange-600' :
              'text-gray-600'
            }`}>
              Status: {status.status.toUpperCase()}
            </p>
            <p className="text-sm text-gray-600 mt-2">Position ahead: {status.positionAhead}</p>
            <p className="text-sm text-gray-600">ETA: {status.etaMinutes} minutes</p>
            {status.assignedCounter && (
              <p className="text-sm text-gray-600">Counter: {status.assignedCounter}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
