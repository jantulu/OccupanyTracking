import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Building2, Plus, Settings as SettingsIcon } from 'lucide-react';
import GlobalStats from './components/GlobalStats';
import GlobalSettings from './components/GlobalSettings';
import SiteConfigModal from './components/SiteConfigModal';
import SiteCard from './components/SiteCard';
import SiteCharts from './components/SiteCharts';
import { loadFromStorage, saveToStorage, deleteFromStorage } from './utils/storage';
import { fetchSiteSessions, fetchSiteHistory } from './utils/api';

const App = () => {
  const [sites, setSites] = useState([]);
  const [showSiteConfig, setShowSiteConfig] = useState(false);
  const [showGlobalSettings, setShowGlobalSettings] = useState(false);
  const [editingSite, setEditingSite] = useState(null);
  
  const [globalSettings, setGlobalSettings] = useState({
    trafficThreshold: 50,
    sessionTimeout: 480,
    sessionResetTime: '00:00',
    refreshInterval: 90,  // Changed to 90 seconds
    confirmationPolls: 2   // Require 2 consecutive polls to confirm
  });
  
  const [siteSessions, setSiteSessions] = useState({});
  const [siteHistoricalData, setSiteHistoricalData] = useState({});
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [expandedSites, setExpandedSites] = useState(new Set());
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Use ref to track current sites for polling without triggering re-renders
  const sitesRef = useRef(sites);
  
  useEffect(() => {
    sitesRef.current = sites;
  }, [sites]);

  // Initialize - load configuration first
  useEffect(() => {
    const init = async () => {
      // Try to load from backend first
      try {
        const response = await fetch('/api/config/sites');
        const backendConfig = await response.json();
        
        if (backendConfig.success && backendConfig.sites && backendConfig.sites.length > 0) {
          console.log('Loaded configuration from backend');
          setSites(backendConfig.sites);
          
          if (backendConfig.globalSettings) {
            setGlobalSettings(backendConfig.globalSettings);
          }
          
          // Also save to localStorage as backup
          await saveToStorage('capacity-sites-config', {
            sites: backendConfig.sites,
            globalSettings: backendConfig.globalSettings || globalSettings,
            source: 'backend'
          });
          
          setIsLoaded(true);
          return;
        }
      } catch (error) {
        console.log('Backend config not available, trying localStorage:', error.message);
      }
      
      // Fallback to localStorage
      const config = await loadFromStorage('capacity-sites-config');
      if (config) {
        console.log('Loaded configuration from localStorage');
        setSites(config.sites || []);
        
        const loadedSettings = config.globalSettings || {
          trafficThreshold: 50,
          sessionTimeout: 480,
          sessionResetTime: '00:00',
          refreshInterval: 60
        };
        setGlobalSettings(loadedSettings);
        
        setTimeout(() => {
          const loadSessions = async () => {
            const loadedSessions = {};
            for (const site of config.sites || []) {
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
          loadSessions();
        }, 100);
      }
      setIsLoaded(true);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save configuration whenever sites change (but only after initial load)
  useEffect(() => {
    if (isLoaded && sites.length >= 0) {
      const configData = {
        sites,
        globalSettings,
        lastUpdate: new Date().toISOString()
      };
      
      // Save to localStorage as backup
      saveToStorage('capacity-sites-config', configData);
      
      // Save to backend (will restart polling with new config)
      fetch('/api/config/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configData)
      }).catch(err => console.error('Failed to save config to backend:', err));
    }
  }, [sites, globalSettings, isLoaded]);

  const shouldResetSessions = useCallback((lastReset) => {
    const now = new Date();
    const [resetHour, resetMinute] = globalSettings.sessionResetTime.split(':').map(Number);
    const todayReset = new Date(now.getFullYear(), now.getMonth(), now.getDate(), resetHour, resetMinute);
    
    if (!lastReset) return true;
    return lastReset < todayReset && now >= todayReset;
  }, [globalSettings.sessionResetTime]);

  const saveSiteSessions = useCallback(async (siteId, sessions) => {
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
  }, []);

 const fetchSiteData = useCallback(async (siteId) => {
  try {
    // Fetch sessions
    const sessionsResponse = await fetch(`/api/sessions/${siteId}`);
    const sessionsData = await sessionsResponse.json();
    
    // Fetch history
    const historyResponse = await fetch(`/api/history/${siteId}`);
    const historyData = await historyResponse.json();
    
    if (sessionsData.success) {
      // Convert back to Map with Date objects
      const sessionsMap = new Map(
        sessionsData.sessions.map(s => [
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
      
      setSiteSessions(prev => ({ ...prev, [siteId]: sessionsMap }));
    }
    
    if (historyData.success) {
      setSiteHistoricalData(prev => ({ ...prev, [siteId]: historyData.history }));
    }
    
  } catch (error) {
    console.error(`Error fetching data for site ${siteId}:`, error);
  }
}, []);

// Replace the polling useEffect with this:
useEffect(() => {
  if (!isLoaded) return;

  const fetchAllSites = async () => {
    const currentSites = sitesRef.current;
    if (currentSites.length === 0) return;
    
    for (const site of currentSites) {
      await fetchSiteData(site.id);
    }
    setLastUpdate(new Date());
  };

  // Fetch immediately
  fetchAllSites();
  
  // Refresh every 10 seconds (backend is doing the heavy lifting)
  const interval = setInterval(fetchAllSites, 10000);
  
  return () => clearInterval(interval);
}, [isLoaded, fetchSiteData]);
  // Fetch data from backend - lightweight polling
  useEffect(() => {
    if (!isLoaded) return;

    const fetchAllSites = async () => {
      const currentSites = sitesRef.current;
      if (currentSites.length === 0) return;
      
      for (const site of currentSites) {
        await fetchSiteData(site.id);
      }
      setLastUpdate(new Date());
    };

    // Fetch immediately
    fetchAllSites();
    
    // Refresh UI every 10 seconds (backend does the SNMP polling)
    console.log('Setting up frontend refresh every 10 seconds');
    const interval = setInterval(fetchAllSites, 10000);
    
    return () => {
      console.log('Clearing frontend refresh interval');
      clearInterval(interval);
    };
  }, [isLoaded, fetchSiteData]);

  const addSite = () => {
    const newSite = {
      id: `site-${Date.now()}`,
      name: 'New Site',
      location: '',
      capacity: 150,
      switches: [],
      enabled: true
      // Removed site-level exclusions
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
    return Object.values(siteSessions).reduce((sum, sessions) => {
      const confirmed = Array.from(sessions.values()).filter(s => s.confirmed);
      return sum + confirmed.length;
    }, 0);
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
