import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function Patient() {
  const [hospitals, setHospitals] = useState([]);
  const [selectedHospital, setSelectedHospital] = useState('');
  const [departments, setDepartments] = useState([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [formData, setFormData] = useState({ patientName: '', phone: '', priority: 'normal' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [token, setToken] = useState(null);

  useEffect(() => {
    fetchHospitals();
  }, []);

  const fetchHospitals = async () => {
    try {
      const res = await axios.get('/api/hospitals');
      setHospitals(res.data);
    } catch (err) {
      console.error('Error fetching hospitals:', err);
      setMessage('Error loading hospitals');
    }
  };

  const handleHospitalChange = async (hId) => {
    setSelectedHospital(hId);
    setSelectedDept('');
    setDepartments([]);
    
    try {
      const res = await axios.get(`/api/hospital/${hId}/departments`);
      setDepartments(res.data.filter(d => d.isActive));
    } catch (err) {
      console.error('Error fetching departments:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.patientName || !formData.phone || !selectedDept) {
      setMessage('Please fill all fields');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const res = await axios.post(`/api/hospital/${selectedHospital}/dept/${selectedDept}/token`, {
        patientName: formData.patientName,
        phone: formData.phone,
        priority: formData.priority,
        source: 'app'
      });
      
      setToken(res.data);
      setMessage(`Token generated successfully!`);
      setFormData({ patientName: '', phone: '', priority: 'normal' });
    } catch (err) {
      setMessage(err.response?.data?.error || 'Error creating token');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-md mx-auto mt-10 bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-3xl font-bold text-center text-primary mb-6">Get Token</h1>

        {token && (
          <div className="mb-6 p-4 bg-green-100 border-l-4 border-green-500 rounded">
            <p className="text-green-800 font-semibold">Your Token</p>
            <p className="text-4xl font-bold text-green-600 text-center mt-2">{token.tokenNumber}</p>
            <p className="text-green-700 mt-2">Department: {token.deptId}</p>
            <p className="text-green-700">Estimated wait: {token.etaMinutes} minutes</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hospital</label>
            <select
              value={selectedHospital}
              onChange={(e) => handleHospitalChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              required
            >
              <option value="">Select Hospital</option>
              {hospitals.map(h => (
                <option key={h._id} value={h._id}>{h.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              required
            >
              <option value="">Select Department</option>
              {departments.map(d => (
                <option key={d._id} value={d._id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Patient Name</label>
            <input
              type="text"
              value={formData.patientName}
              onChange={(e) => setFormData({ ...formData, patientName: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="10 digits"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="normal">Normal</option>
              <option value="elderly">Elderly</option>
              <option value="emergency">Emergency</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white font-semibold py-2 rounded-md hover:bg-opacity-90 disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Get Token'}
          </button>
        </form>

        {message && (
          <p className={`mt-4 text-center text-sm ${message.includes('Error') || message.includes('error') ? 'text-red-600' : 'text-green-600'}`}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
