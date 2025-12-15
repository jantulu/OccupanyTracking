import React, { useState, useEffect } from 'react';
import { Globe, Building2, Plus, Settings as SettingsIcon } from 'lucide-react';
import GlobalStats from './components/GlobalStats';
import GlobalSettings from './components/GlobalSettings';
import SiteConfigModal from './components/SiteConfigModal';
import SiteCard from './components/SiteCard';
import SiteCharts from './components/SiteCharts';
import { loadFromStorage, saveToStorage, deleteFromStorage } from './utils/storage';
import { pollSwitch } from './utils/api';

const App = () => {
  const [sites, setSites] = useState([]);
  const [showSiteConfig, setShowSiteConfig] = useState(false);
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);
  const [editingSite, setEditingSite] = useState(null);
  
  const [globalSettings, setGlobalSettings] = useState({
    trafficThreshold: 50,
    sessionTimeout: 480,
    sessionResetTime: '00:00',
    refreshInterval: 60
  });
  
  const [siteSessions, setSiteSessions] = useState({});
  const [siteHistoricalData, setSiteHistoricalData] = useState({});
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [expandedSites, setExpandedSites] = useState(new Set());

  // Initialize
  useEffect(() => {
    loadConfiguration();
    loadAllSessions();
  }, []);

  useEffect(() => {
    saveConfiguration();
  }, [sites]);

  // Polling loop
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
    const config = await loadFromStorage('capacity-sites-config');
    if (config) {
      setSites(config.sites || []);
      setGlobalSettings(config.globalSettings || globalSettings);
    }
  };

  const saveConfiguration = async () => {
    await saveToStorage('capacity-sites-config', {
      sites,
      globalSettings,
      lastUpdate: new Date().toISOString()
    });
  };

  const loadAllSessions = async () => {
    const loadedSessions = {};
    for (const site of sites) {
      const data = await loadFromStorage(`sessions-${site.id}`);
      if (data) {
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
    }
    setSiteSessions(loadedSessions);
  };

  const saveSiteSessions = async (siteId, sessions) => {
    const sessionsArray = Array.from(sessions.values()).map(s => ({
      ...s,
      firstSeen: s.firstSeen.toISOString(),
      lastSeen: s.lastSeen.toISOString(),
      lastActive: s.lastActive.toISOString(),
      lastReset: s.lastReset.toISOString()
    }));
    
    await saveToStorage(`sessions-${siteId}`, {
      sessions: sessionsArray,
      lastUpdate: new Date().toISOString()
    });
  };

  const pollSiteSwitches = async (site) => {
    const now = new Date();
    const allDevices = [];

    for (const switchStack of site.switches) {
      const devices = await pollSwitch(switchStack);
      allDevices.push(...devices.map(d => ({ ...d, switchId: switchStack.id, switchName: switchStack.name })));
    }

    const currentSessions = siteSessions[site.id] || new Map();
    const newSessions = new Map(currentSessions);

    if (shouldResetSessions(Array.from(newSessions.values())[0]?.lastReset)) {
      newSessions.clear();
    }

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

    const timeoutMs = globalSettings.sessionTimeout * 60 * 1000;
    for (const [mac, session] of newSessions.entries()) {
      if (now - session.lastActive > timeoutMs) {
        newSessions.delete(mac);
      }
    }

    setSiteSessions(prev => ({ ...prev, [site.id]: newSessions }));
    saveSiteSessions(site.id, newSessions);

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
    if (window.confirm('Delete this site? All session data will be lost.')) {
      setSites(sites.filter(s => s.id !== siteId));
      await deleteFromStorage(`sessions-${siteId}`);
    }
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
                <SettingsIcon className="w-5 h-5" />
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

        {/* Global Settings */}
        {showGlobalSettings && (
          <GlobalSettings 
            settings={globalSettings}
            onUpdate={setGlobalSettings}
          />
        )}

        {/* Site Config Modal */}
        {showSiteConfig && editingSite && (
          <SiteConfigModal
            site={editingSite}
            onSave={(updated) => {
              updateSite(updated.id, updated);
              setShowSiteConfig(false);
              setEditingSite(null);
            }}
            onCancel={() => {
              setShowSiteConfig(false);
              setEditingSite(null);
            }}
          />
        )}

        {/* Global Stats */}
        <GlobalStats
          totalSites={sites.length}
          totalOccupancy={getTotalOccupancy()}
          totalCapacity={getTotalCapacity()}
          lastUpdate={lastUpdate}
        />

        {/* Site Charts */}
        {sites.length > 0 && (
          <SiteCharts sites={sites} siteSessions={siteSessions} />
        )}

        {/* Site Cards */}
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
            sites.map(site => (
              <SiteCard
                key={site.id}
                site={site}
                sessions={siteSessions[site.id] || new Map()}
                history={siteHistoricalData[site.id] || []}
                isExpanded={expandedSites.has(site.id)}
                globalSettings={globalSettings}
                onToggle={() => toggleSiteExpanded(site.id)}
                onEdit={() => {
                  setEditingSite(site);
                  setShowSiteConfig(true);
                }}
                onDelete={() => deleteSite(site.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default App;
