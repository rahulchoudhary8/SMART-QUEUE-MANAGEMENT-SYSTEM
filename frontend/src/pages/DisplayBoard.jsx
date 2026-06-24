import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';

export default function DisplayBoard() {
  const { deptId } = useParams();
  const [queue, setQueue] = useState([]);
  const [deptName, setDeptName] = useState('');
  const [activeToken, setActiveToken] = useState(null);
  const [waitingTokens, setWaitingTokens] = useState([]);

  useEffect(() => {
    if (!deptId) return;

    const fetchQueue = async () => {
      try {
        const res = await axios.get(`/api/dept/${deptId}/queue`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('hqs_token') || ''}` }
        });
        setQueue(res.data);

        const active = res.data.find(t => t.status === 'active');
        setActiveToken(active);

        const waiting = res.data.filter(t => t.status === 'waiting').slice(0, 5);
        setWaitingTokens(waiting);

        if (res.data[0]) {
          const dept = await axios.get(`/api/dept/${deptId}/summary`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('hqs_token') || ''}` }
          });
        }
      } catch (err) {
        console.error('Error fetching queue:', err);
      }
    };

    fetchQueue();

    const socket = io();
    socket.on('queue-updated', fetchQueue);

    const interval = setInterval(fetchQueue, 5000);

    return () => {
      socket.disconnect();
      clearInterval(interval);
    };
  }, [deptId]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary to-accent p-4 flex items-center justify-center">
      <div className="w-full max-w-4xl bg-white rounded-lg shadow-2xl overflow-hidden">
        <div className="bg-primary text-white p-8 text-center">
          <h1 className="text-5xl font-bold mb-2">Queue Display</h1>
          <p className="text-xl opacity-90">{deptName || 'Department'}</p>
        </div>

        <div className="grid grid-cols-2 gap-8 p-8">
          {/* Now Serving */}
          <div className="text-center">
            <p className="text-2xl font-semibold text-gray-600 mb-4">Now Serving</p>
            {activeToken ? (
              <div className="bg-green-100 p-12 rounded-lg">
                <p className="text-7xl font-bold text-green-600">{activeToken.tokenNumber}</p>
                <p className="text-xl text-gray-700 mt-4">Counter: {activeToken.assignedCounter || 'N/A'}</p>
              </div>
            ) : (
              <div className="bg-gray-100 p-12 rounded-lg">
                <p className="text-5xl text-gray-400">--</p>
              </div>
            )}
          </div>

          {/* Waiting Tokens */}
          <div className="text-center">
            <p className="text-2xl font-semibold text-gray-600 mb-4">Next in Queue</p>
            <div className="space-y-2">
              {waitingTokens.map((token, idx) => (
                <div key={token._id} className="bg-blue-50 p-3 rounded-lg border-2 border-blue-200">
                  <p className="text-3xl font-bold text-blue-600">{token.tokenNumber}</p>
                  <p className="text-sm text-gray-600">{token.priority}</p>
                </div>
              ))}
              {waitingTokens.length === 0 && (
                <div className="bg-gray-100 p-8 rounded-lg">
                  <p className="text-gray-400">No waiting tokens</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
