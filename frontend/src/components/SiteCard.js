import React from 'react';
import { Users, Network, Edit2, Trash2, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const SiteCard = ({ site, sessions, history, isExpanded, globalSettings, onToggle, onEdit, onDelete }) => {
  const getSiteOccupancyStatus = () => {
    // Only count confirmed sessions
    const confirmedSessions = Array.from(sessions.values()).filter(s => s.confirmed);
    const occupancy = confirmedSessions.length;
    const percent = (occupancy / site.capacity) * 100;
    
    if (percent < 50) return { color: 'text-green-600', bg: 'bg-green-100', label: 'Low' };
    if (percent < 80) return { color: 'text-yellow-600', bg: 'bg-yellow-100', label: 'Moderate' };
    if (percent < 100) return { color: 'text-orange-600', bg: 'bg-orange-100', label: 'High' };
    return { color: 'text-red-600', bg: 'bg-red-100', label: 'At Capacity' };
  };

  const status = getSiteOccupancyStatus();
  const confirmedSessions = Array.from(sessions.values()).filter(s => s.confirmed);
  const capacityPercent = Math.min((confirmedSessions.length / site.capacity) * 100, 100);

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      {/* Site Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex justify-between items-start">
          <div className="flex items-start gap-4 flex-1">
            <button
              onClick={onToggle}
              className="mt-1 hover:bg-gray-100 rounded p-1"
            >
              {isExpanded ? (
                <ChevronDown className="w-5 h-5 text-gray-600" />
              ) : (
                <ChevronRight className="w-5 h-5 text-gray-600" />
              )}
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-2xl font-bold text-gray-800">{site.name}</h3>
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${status.bg} ${status.color}`}>
                  {status.label}
                </span>
              </div>
              <p className="text-gray-600">{site.location || 'Location not set'}</p>
              <div className="mt-3 flex items-center gap-6 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <Network className="w-4 h-4" />
                  <span>{site.switches.length} Switch{site.switches.length !== 1 ? 'es' : ''}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  <span>{confirmedSessions.length} / {site.capacity} people</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={onEdit}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <Edit2 className="w-5 h-5 text-gray-600" />
            </button>
            <button
              onClick={onDelete}
              className="p-2 hover:bg-red-100 rounded-lg"
            >
              <Trash2 className="w-5 h-5 text-red-600" />
            </button>
          </div>
        </div>

        {/* Capacity Bar */}
        <div className="mt-4">
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div
              className={`h-4 rounded-full transition-all ${
                capacityPercent >= 100 ? 'bg-red-600' :
                capacityPercent >= 80 ? 'bg-orange-500' :
                capacityPercent >= 50 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${capacityPercent}%` }}
            />
          </div>
          <div className="text-sm text-gray-600 mt-1">{capacityPercent.toFixed(1)}% capacity</div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-6 bg-gray-50">
          {/* Switches List */}
          <div className="mb-6">
            <h4 className="font-semibold text-gray-800 mb-3">Switch Stacks</h4>
            <div className="grid md:grid-cols-2 gap-3">
              {site.switches.map(sw => (
                <div key={sw.id} className="bg-white p-4 rounded-lg border border-gray-200">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-medium text-gray-800">{sw.name}</div>
                      <div className="text-sm text-gray-600">{sw.ipAddress}</div>
                    </div>
                    <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                      {sw.stackMembers} member{sw.stackMembers !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    Community: {sw.community}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Charts */}
          {history.length > 0 && (
            <div className="grid md:grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-lg p-4">
                <h4 className="font-semibold text-gray-800 mb-3">Occupancy Trend</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={history}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="stepAfter" dataKey="totalSessions" stroke="#3b82f6" strokeWidth={2} name="Total Sessions" />
                    <Line type="monotone" dataKey="currentActive" stroke="#10b981" strokeWidth={2} name="Active Now" strokeDasharray="5 5" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-lg p-4">
                <h4 className="font-semibold text-gray-800 mb-3">Recent Activity</h4>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={history.slice(-10)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="totalSessions" fill="#3b82f6" name="Sessions" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Session List */}
          {sessions.size > 0 && (
            <div className="bg-white rounded-lg p-4">
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-semibold text-gray-800">Active Sessions</h4>
                <div className="text-sm text-gray-600">
                  {confirmedSessions.length} confirmed, {sessions.size - confirmedSessions.length} pending
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Device (MAC)</th>
                      <th className="text-left p-2">Switch</th>
                      <th className="text-left p-2">First Seen</th>
                      <th className="text-left p-2">Last Active</th>
                      <th className="text-left p-2">Traffic (Kbps)</th>
                      <th className="text-left p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(sessions.values())
                      .filter(s => s.confirmed) // Only show confirmed sessions
                      .sort((a, b) => b.lastActive - a.lastActive)
                      .slice(0, 10)
                      .map(session => {
                        const isActive = (new Date() - session.lastActive) < globalSettings.refreshInterval * 2000;
                        // Display port name if no real MAC, otherwise show MAC
                        const displayId = session.mac.startsWith('port-') 
                          ? session.ifDescr || session.mac 
                          : session.mac;
                        
                        return (
                          <tr key={session.mac} className="border-b hover:bg-gray-50">
                            <td className="p-2 font-mono text-xs">{displayId}</td>
                            <td className="p-2">{session.switchName || 'Unknown'}</td>
                            <td className="p-2">{session.firstSeen.toLocaleTimeString()}</td>
                            <td className="p-2">{session.lastActive.toLocaleTimeString()}</td>
                            <td className="p-2 font-semibold">
                              {session.currentTraffic ? session.currentTraffic.toFixed(1) : '-'}
                            </td>
                            <td className="p-2">
                              <span className={`px-2 py-1 rounded-full text-xs ${isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                {isActive ? 'Active' : 'Break'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Alert */}
          {capacityPercent >= 90 && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg mt-4">
              <div className="flex items-center">
                <AlertCircle className="w-5 h-5 text-red-600 mr-3" />
                <div>
                  <h4 className="text-red-800 font-semibold">Capacity Warning</h4>
                  <p className="text-red-700 text-sm">This site is at {capacityPercent.toFixed(1)}% capacity</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SiteCard;
