import React, { useState, useEffect } from 'react';
import { Users, TrendingUp, AlertCircle, RefreshCw, Settings, Clock, UserCheck, Database, Activity, Plus, Edit2, Trash2, Building2, Network, ChevronDown, ChevronRight, Globe } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const BuildingCapacityDashboard = () => {
  // Configuration State
  const [sites, setSites] = useState([]);
  const [selectedSite, setSelectedSite] = useState(null);
  const [showSiteConfig, setShowSiteConfig] = useState(false);
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);
  const [editingSite, setEditingSite] = useState(null);
  
  // Global Settings
  const [globalSettings, setGlobalSettings] = useState({
    trafficThreshold: 50,
    sessionTimeout: 480,
    sessionResetTime: '00:00',
    refreshInterval: 60
  });
  
  // Session and Activity Data
  const [siteSessions, setSiteSessions] = useState({});
  const [siteHistoricalData, setSiteHistoricalData] = useState({});
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [expandedSites, setExpandedSites] = useState(new Set());

  // Initialize - load sites and sessions
  useEffect(() => {
    loadConfiguration();
    loadAllSessions();
  }, []);

  // Save configuration whenever sites change
  useEffect(() => {
    saveConfiguration();
  }, [sites]);

  // Main polling loop
  useEffect(() => {
    const pollAllSites = async () => {
      for (const site of sites) {
        await pollSiteSwitches(site);
      }
      setLastUpdate(new Date());
    };

    pollAllSites();
    const interval = setInterval(pollAllSites, globalSettings.refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [sites, globalSettings]);

  const loadConfiguration = async () => {
    try {
      const stored = await window.storage.get('capacity-sites-config');
      if (stored && stored.value) {
        const config = JSON.parse(stored.value);
        setSites(config.sites || []);
        setGlobalSettings(config.globalSettings || globalSettings);
      }
    } catch (error) {
      console.log('No existing configuration found:', error);
    }
  };

  const saveConfiguration = async () => {
    try {
      await window.storage.set('capacity-sites-config', JSON.stringify({
        sites,
        globalSettings,
        lastUpdate: new Date().toISOString()
      }));
    } catch (error) {
      console.error('Error saving configuration:', error);
    }
  };

  const loadAllSessions = async () => {
    const loadedSessions = {};
    for (const site of sites) {
      try {
        const stored = await window.storage.get(`sessions-${site.id}`);
        if (stored && stored.value) {
          const data = JSON.parse(stored.value);
          loadedSessions[site.id] = new Map(
            data.sessions.map(s => [
              s.mac,
              {
                ...s,
                firstSeen: new Date(s.firstSeen),
                lastSeen: new Date(s.lastSeen),
                lastActive: new Date(s.lastActive),
                lastReset: new Date(s.lastReset)
              }
            ])
          );
        }
      } catch (error) {
        console.log(`No sessions found for site ${site.id}`);
      }
    }
    setSiteSessions(loadedSessions);
  };

  const saveSiteSessions = async (siteId, sessions) => {
    try {
      const sessionsArray = Array.from(sessions.values()).map(s => ({
        ...s,
        firstSeen: s.firstSeen.toISOString(),
        lastSeen: s.lastSeen.toISOString(),
        lastActive: s.lastActive.toISOString(),
        lastReset: s.lastReset.toISOString()
      }));
      
      await window.storage.set(`sessions-${siteId}`, JSON.stringify({
        sessions: sessionsArray,
        lastUpdate: new Date().toISOString()
      }));
    } catch (error) {
      console.error('Error saving sessions:', error);
    }
  };

  const pollSiteSwitches = async (site) => {
    const now = new Date();
    const allDevices = [];

    // Poll each switch in the site
    for (const switchStack of site.switches) {
      const devices = await pollSwitch(switchStack);
      allDevices.push(...devices.map(d => ({ ...d, switchId: switchStack.id, switchName: switchStack.name })));
    }

    // Update sessions for this site
    const currentSessions = siteSessions[site.id] || new Map();
    const newSessions = new Map(currentSessions);

    // Check if we should reset
    if (shouldResetSessions(Array.from(newSessions.values())[0]?.lastReset)) {
      newSessions.clear();
    }

    // Process active devices
    const activeDevices = allDevices.filter(d => d.trafficRate > globalSettings.trafficThreshold);
    const detectedMacs = activeDevices.map(d => d.macAddress);

    detectedMacs.forEach(mac => {
      const deviceInfo = allDevices.find(d => d.macAddress === mac);
      
      if (newSessions.has(mac)) {
        const existing = newSessions.get(mac);
        newSessions.set(mac, {
          ...existing,
          lastSeen: now,
          lastActive: now,
          switchId: deviceInfo.switchId,
          switchName: deviceInfo.switchName
        });
      } else {
        newSessions.set(mac, {
          mac,
          firstSeen: now,
          lastSeen: now,
          lastActive: now,
          lastReset: now,
          switchId: deviceInfo.switchId,
          switchName: deviceInfo.switchName
        });
      }
    });

    // Remove timed-out sessions
    const timeoutMs = globalSettings.sessionTimeout * 60 * 1000;
    for (const [mac, session] of newSessions.entries()) {
      if (now - session.lastActive > timeoutMs) {
        newSessions.delete(mac);
      }
    }

    // Update state
    setSiteSessions(prev => ({ ...prev, [site.id]: newSessions }));
    saveSiteSessions(site.id, newSessions);

    // Update historical data
    setSiteHistoricalData(prev => {
      const siteHistory = prev[site.id] || [];
      const newHistory = [...siteHistory, {
        time: now.toLocaleTimeString(),
        totalSessions: newSessions.size,
        currentActive: detectedMacs.length,
        timestamp: now.getTime()
      }].slice(-30);
      
      return { ...prev, [site.id]: newHistory };
    });
  };

const pollSwitch = async (switchStack) => {
  const response = await fetch(
    `http://localhost:3000/api/snmp/poll?host=${switchStack.ipAddress}&community=${switchStack.community}&stackMembers=${switchStack.stackMembers}`
  );
  const data = await response.json();
  return data.success ? data.devices : [];
};

  const shouldResetSessions = (lastReset) => {
    const now = new Date();
    const [resetHour, resetMinute] = globalSettings.sessionResetTime.split(':').map(Number);
    const todayReset = new Date(now.getFullYear(), now.getMonth(), now.getDate(), resetHour, resetMinute);
    
    if (!lastReset) return true;
    return lastReset < todayReset && now >= todayReset;
  };

  const addSite = () => {
    const newSite = {
      id: `site-${Date.now()}`,
      name: 'New Site',
      location: '',
      capacity: 150,
      switches: [],
      enabled: true
    };
    setSites([...sites, newSite]);
    setEditingSite(newSite);
    setShowSiteConfig(true);
  };

  const updateSite = (siteId, updates) => {
    setSites(sites.map(s => s.id === siteId ? { ...s, ...updates } : s));
  };

  const deleteSite = async (siteId) => {
    if (confirm('Delete this site? All session data will be lost.')) {
      setSites(sites.filter(s => s.id !== siteId));
      try {
        await window.storage.delete(`sessions-${siteId}`);
      } catch (error) {
        console.error('Error deleting sessions:', error);
      }
    }
  };

  const addSwitchToSite = (siteId) => {
    const newSwitch = {
      id: `switch-${Date.now()}`,
      name: 'New Switch',
      ipAddress: '',
      community: 'public',
      stackMembers: 1,
      enabled: true
    };
    
    updateSite(siteId, {
      switches: [...(sites.find(s => s.id === siteId)?.switches || []), newSwitch]
    });
  };

  const updateSwitch = (siteId, switchId, updates) => {
    const site = sites.find(s => s.id === siteId);
    if (site) {
      const updatedSwitches = site.switches.map(sw => 
        sw.id === switchId ? { ...sw, ...updates } : sw
      );
      updateSite(siteId, { switches: updatedSwitches });
    }
  };

  const deleteSwitch = (siteId, switchId) => {
    const site = sites.find(s => s.id === siteId);
    if (site) {
      updateSite(siteId, {
        switches: site.switches.filter(sw => sw.id !== switchId)
      });
    }
  };

  const getSiteOccupancyStatus = (site) => {
    const sessions = siteSessions[site.id] || new Map();
    const occupancy = sessions.size;
    const percent = (occupancy / site.capacity) * 100;
    
    if (percent < 50) return { color: 'text-green-600', bg: 'bg-green-100', label: 'Low' };
    if (percent < 80) return { color: 'text-yellow-600', bg: 'bg-yellow-100', label: 'Moderate' };
    if (percent < 100) return { color: 'text-orange-600', bg: 'bg-orange-100', label: 'High' };
    return { color: 'text-red-600', bg: 'bg-red-100', label: 'At Capacity' };
  };

  const toggleSiteExpanded = (siteId) => {
    const newExpanded = new Set(expandedSites);
    if (newExpanded.has(siteId)) {
      newExpanded.delete(siteId);
    } else {
      newExpanded.add(siteId);
    }
    setExpandedSites(newExpanded);
  };

  const getTotalOccupancy = () => {
    return Object.values(siteSessions).reduce((sum, sessions) => sum + sessions.size, 0);
  };

  const getTotalCapacity = () => {
    return sites.reduce((sum, site) => sum + site.capacity, 0);
  };

  const getSitesByStatus = () => {
    const statusCounts = { low: 0, moderate: 0, high: 0, atCapacity: 0 };
    sites.forEach(site => {
      const status = getSiteOccupancyStatus(site);
      if (status.label === 'Low') statusCounts.low++;
      else if (status.label === 'Moderate') statusCounts.moderate++;
      else if (status.label === 'High') statusCounts.high++;
      else statusCounts.atCapacity++;
    });
    return statusCounts;
  };

  const COLORS = ['#10b981', '#eab308', '#f97316', '#ef4444'];

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">Multi-Site Capacity Monitor</h1>
              <p className="text-gray-600">Enterprise building occupancy tracking across all locations</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowGlobalSettings(!showGlobalSettings)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-2"
              >
                <Settings className="w-5 h-5" />
                Settings
              </button>
              <button
                onClick={addSite}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Add Site
              </button>
            </div>
          </div>
        </div>

        {/* Global Settings Modal */}
        {showGlobalSettings && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Global Settings</h2>
            <div className="grid md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Traffic Threshold (Kbps)
                </label>
                <input
                  type="number"
                  value={globalSettings.trafficThreshold}
                  onChange={(e) => setGlobalSettings({ ...globalSettings, trafficThreshold: Number(e.target.value) })}
                  className="w-full p-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Session Timeout (minutes)
                </label>
                <input
                  type="number"
                  value={globalSettings.sessionTimeout}
                  onChange={(e) => setGlobalSettings({ ...globalSettings, sessionTimeout: Number(e.target.value) })}
                  className="w-full p-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Daily Reset Time
                </label>
                <input
                  type="time"
                  value={globalSettings.sessionResetTime}
                  onChange={(e) => setGlobalSettings({ ...globalSettings, sessionResetTime: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Refresh Interval (seconds)
                </label>
                <input
                  type="number"
                  value={globalSettings.refreshInterval}
                  onChange={(e) => setGlobalSettings({ ...globalSettings, refreshInterval: Number(e.target.value) })}
                  className="w-full p-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
          </div>
        )}

        {/* Site Configuration Modal */}
        {showSiteConfig && editingSite && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <h2 className="text-2xl font-bold mb-6">Configure Site: {editingSite.name}</h2>
                
                {/* Site Details */}
                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-semibold mb-3">Site Information</h3>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Site Name</label>
                      <input
                        type="text"
                        value={editingSite.name}
                        onChange={(e) => setEditingSite({ ...editingSite, name: e.target.value })}
                        className="w-full p-2 border border-gray-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
                      <input
                        type="text"
                        value={editingSite.location}
                        onChange={(e) => setEditingSite({ ...editingSite, location: e.target.value })}
                        placeholder="City, State"
                        className="w-full p-2 border border-gray-300 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Building Capacity</label>
                      <input
                        type="number"
                        value={editingSite.capacity}
                        onChange={(e) => setEditingSite({ ...editingSite, capacity: Number(e.target.value) })}
                        className="w-full p-2 border border-gray-300 rounded-md"
                      />
                    </div>
                  </div>
                </div>

                {/* Switch Configuration */}
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="font-semibold">Switch Stacks</h3>
                    <button
                      onClick={() => addSwitchToSite(editingSite.id)}
                      className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-1 text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      Add Switch
                    </button>
                  </div>
                  
                  <div className="space-y-3">
                    {editingSite.switches.map(sw => (
                      <div key={sw.id} className="p-4 border border-gray-200 rounded-lg bg-white">
                        <div className="grid md:grid-cols-5 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Switch Name</label>
                            <input
                              type="text"
                              value={sw.name}
                              onChange={(e) => updateSwitch(editingSite.id, sw.id, { name: e.target.value })}
                              className="w-full p-2 border border-gray-300 rounded-md text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">IP Address</label>
                            <input
                              type="text"
                              value={sw.ipAddress}
                              onChange={(e) => updateSwitch(editingSite.id, sw.id, { ipAddress: e.target.value })}
                              placeholder="192.168.1.1"
                              className="w-full p-2 border border-gray-300 rounded-md text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">SNMP Community</label>
                            <input
                              type="text"
                              value={sw.community}
                              onChange={(e) => updateSwitch(editingSite.id, sw.id, { community: e.target.value })}
                              className="w-full p-2 border border-gray-300 rounded-md text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Stack Members</label>
                            <input
                              type="number"
                              value={sw.stackMembers}
                              onChange={(e) => updateSwitch(editingSite.id, sw.id, { stackMembers: Number(e.target.value) })}
                              min="1"
                              className="w-full p-2 border border-gray-300 rounded-md text-sm"
                            />
                          </div>
                          <div className="mt-3 flex items-center gap-6 text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                              <Network className="w-4 h-4" />
                              <span>{site.switches.length} Switch{site.switches.length !== 1 ? 'es' : ''}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4" />
                              <span>{sessions.size} / {site.capacity} people</span>
                            </div>
                          </div>
                        </div>
                      </div>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingSite(site);
                            setShowSiteConfig(true);
                          }}
                          className="p-2 hover:bg-gray-100 rounded-lg"
                        >
                          <Edit2 className="w-5 h-5 text-gray-600" />
                        </button>
                        <button
                          onClick={() => deleteSite(site.id)}
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
                          <h4 className="font-semibold text-gray-800 mb-3">Active Sessions (Last 10)</h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b">
                                  <th className="text-left p-2">Device (MAC)</th>
                                  <th className="text-left p-2">Switch</th>
                                  <th className="text-left p-2">First Seen</th>
                                  <th className="text-left p-2">Last Active</th>
                                  <th className="text-left p-2">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {Array.from(sessions.values())
                                  .sort((a, b) => b.lastActive - a.lastActive)
                                  .slice(0, 10)
                                  .map(session => {
                                    const isActive = (new Date() - session.lastActive) < globalSettings.refreshInterval * 2000;
                                    return (
                                      <tr key={session.mac} className="border-b hover:bg-gray-50">
                                        <td className="p-2 font-mono text-xs">{session.mac}</td>
                                        <td className="p-2">{session.switchName || 'Unknown'}</td>
                                        <td className="p-2">{session.firstSeen.toLocaleTimeString()}</td>
                                        <td className="p-2">{session.lastActive.toLocaleTimeString()}</td>
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

                      {/* Alert for this site */}
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
            })
          )}
        </div>

        {/* Implementation Guide */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-6">
          <h3 className="font-semibold text-blue-900 mb-3">Backend Integration Guide</h3>
          <div className="text-sm text-blue-800 space-y-2">
            <p><strong>Replace the pollSwitch() function with real SNMP calls to your backend API:</strong></p>
            <pre className="bg-blue-100 p-3 rounded text-xs overflow-x-auto mt-2">
{`// In the pollSwitch function, replace with:
const response = await fetch(\`/api/snmp/poll?\` + new URLSearchParams({
  host: switchStack.ipAddress,
  community: switchStack.community,
  stackMembers: switchStack.stackMembers
}));
const data = await response.json();
return data.devices; // Array of { ifIndex, ifDescr, macAddress, trafficRate }`}
            </pre>
            <p className="mt-3"><strong>Features implemented:</strong></p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Multi-site management with add/edit/delete</li>
              <li>Multiple switch stacks per site</li>
              <li>Stack member count for proper port indexing</li>
              <li>Persistent session storage per site</li>
              <li>Site grouping and aggregation</li>
              <li>Expandable/collapsible site views</li>
              <li>Global overview and per-site details</li>
              <li>Real-time status monitoring</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BuildingCapacityDashboard;="flex items-end">
                            <button
                              onClick={() => deleteSwitch(editingSite.id, sw.id)}
                              className="w-full p-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 text-sm"
                            >
                              <Trash2 className="w-4 h-4 mx-auto" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setShowSiteConfig(false);
                      setEditingSite(null);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      updateSite(editingSite.id, editingSite);
                      setShowSiteConfig(false);
                      setEditingSite(null);
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Global Overview Stats */}
        <div className="grid md:grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <Globe className="w-8 h-8 text-blue-600" />
              <div>
                <div className="text-2xl font-bold text-gray-800">{sites.length}</div>
                <div className="text-sm text-gray-600">Total Sites</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <UserCheck className="w-8 h-8 text-green-600" />
              <div>
                <div className="text-2xl font-bold text-gray-800">{getTotalOccupancy()}</div>
                <div className="text-sm text-gray-600">Total Occupancy</div>
              </div>
            </div>
            <div className="text-xs text-gray-500">Across all sites</div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <Building2 className="w-8 h-8 text-purple-600" />
              <div>
                <div className="text-2xl font-bold text-gray-800">{getTotalCapacity()}</div>
                <div className="text-sm text-gray-600">Total Capacity</div>
              </div>
            </div>
            <div className="text-xs text-gray-500">
              {Math.round((getTotalOccupancy() / getTotalCapacity()) * 100)}% utilized
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="w-8 h-8 text-orange-600" />
              <div>
                <div className="text-lg font-bold text-gray-800">{lastUpdate.toLocaleTimeString()}</div>
                <div className="text-sm text-gray-600">Last Update</div>
              </div>
            </div>
          </div>
        </div>

        {/* Sites Overview Chart */}
        {sites.length > 0 && (
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Site Status Distribution</h2>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Low', value: getSitesByStatus().low },
                      { name: 'Moderate', value: getSitesByStatus().moderate },
                      { name: 'High', value: getSitesByStatus().high },
                      { name: 'At Capacity', value: getSitesByStatus().atCapacity }
                    ]}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => value > 0 ? `${name}: ${value}` : ''}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {COLORS.map((color, index) => (
                      <Cell key={`cell-${index}`} fill={color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Top 5 Sites by Occupancy</h2>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart
                  data={sites
                    .map(site => ({
                      name: site.name,
                      occupancy: (siteSessions[site.id] || new Map()).size,
                      capacity: site.capacity
                    }))
                    .sort((a, b) => b.occupancy - a.occupancy)
                    .slice(0, 5)
                  }
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="occupancy" fill="#3b82f6" name="Current" />
                  <Bar dataKey="capacity" fill="#e5e7eb" name="Capacity" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Individual Site Cards */}
        <div className="space-y-4">
          {sites.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-12 text-center">
              <Building2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-700 mb-2">No Sites Configured</h3>
              <p className="text-gray-600 mb-6">Get started by adding your first site location</p>
              <button
                onClick={addSite}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Add Your First Site
              </button>
            </div>
          ) : (
            sites.map(site => {
              const sessions = siteSessions[site.id] || new Map();
              const status = getSiteOccupancyStatus(site);
              const isExpanded = expandedSites.has(site.id);
              const history = siteHistoricalData[site.id] || [];
              const capacityPercent = Math.min((sessions.size / site.capacity) * 100, 100);

              return (
                <div key={site.id} className="bg-white rounded-lg shadow-md overflow-hidden">
                  {/* Site Header */}
                  <div className="p-6 border-b border-gray-200">
                    <div className="flex justify-between items-start">
                      <div className="flex items-start gap-4 flex-1">
                        <button
                          onClick={() => toggleSiteExpanded(site.id)}
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
