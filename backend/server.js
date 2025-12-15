// SNMP Building Capacity Backend Service
// Polls Cisco switches via SNMP and provides REST API for frontend

const express = require('express');
const snmp = require('net-snmp');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Enable CORS for frontend
app.use(cors());
app.use(express.json());

// Store previous counter values for traffic rate calculation
const counterCache = new Map();

// Server-side session storage
const sessionStore = new Map(); // siteId -> Map of sessions
const historicalStore = new Map(); // siteId -> array of historical data

// Global settings
let globalSettings = {
  trafficThreshold: 50,
  sessionTimeout: 480,
  sessionResetTime: '00:00',
  refreshInterval: 90,
  confirmationPolls: 2
};

// Polling state
let pollingIntervals = new Map(); // siteId -> intervalId

// OID Definitions for Cisco switches
const OIDs = {
  ifDescr: '1.3.6.1.2.1.2.2.1.2',        // Interface description
  ifOperStatus: '1.3.6.1.2.1.2.2.1.8',   // Interface operational status
  ifInOctets: '1.3.6.1.2.1.2.2.1.10',    // Bytes in
  ifOutOctets: '1.3.6.1.2.1.2.2.1.16',   // Bytes out
  ifSpeed: '1.3.6.1.2.1.2.2.1.5',        // Interface speed
  macAddress: '1.3.6.1.2.1.17.4.3.1.1',  // MAC addresses in forwarding table
  macPort: '1.3.6.1.2.1.17.4.3.1.2',     // Port for each MAC
  bridgePortIfIndex: '1.3.6.1.2.1.17.1.4.1.2' // Bridge port to ifIndex mapping
};

/**
 * SNMP Session Manager
 */
class SnmpSession {
  constructor(host, community, version = snmp.Version2c) {
    this.host = host;
    this.community = community;
    this.version = version;
    this.session = null;
  }

  createSession() {
    this.session = snmp.createSession(this.host, this.community, {
      version: this.version,
      timeout: 5000,
      retries: 2
    });
    return this.session;
  }

  close() {
    if (this.session) {
      this.session.close();
      this.session = null;
    }
  }

  /**
   * Perform SNMP table walk
   */
  async tableWalk(oid) {
    return new Promise((resolve, reject) => {
      const session = this.createSession();
      const results = {};

      session.table(oid, (error, table) => {
        this.close();
        
        if (error) {
          reject(error);
        } else {
          resolve(table);
        }
      });
    });
  }

  /**
   * Get specific OID values
   */
  async get(oids) {
    return new Promise((resolve, reject) => {
      const session = this.createSession();

      session.get(oids, (error, varbinds) => {
        this.close();
        
        if (error) {
          reject(error);
        } else {
          resolve(varbinds);
        }
      });
    });
  }
}

/**
 * Switch Poller Class
 * Handles SNMP polling and traffic rate calculation
 */
class SwitchPoller {
  constructor(host, community, stackMembers = 1, excludedVlans = [], excludedPorts = []) {
    this.host = host;
    this.community = community;
    this.stackMembers = stackMembers;
    this.cacheKey = `${host}-${community}`;
    this.excludedVlans = excludedVlans;
    this.excludedPorts = excludedPorts;
  }

  /**
   * Main polling function
   */
  async poll() {
    try {
      const session = new SnmpSession(this.host, this.community);
      
      // Get interface data, MAC table, bridge map, and VLAN info in parallel
      const [interfaces, macTable, bridgeMap, vlanMap] = await Promise.all([
        this.getInterfaceData(session),
        this.getMacAddressTable(session),
        this.getBridgePortMapping(session),
        this.getVlanMapping(session)
      ]);

      // Calculate traffic rates and map MACs to interfaces
      const devices = this.processData(interfaces, macTable, bridgeMap, vlanMap);

      return {
        success: true,
        timestamp: new Date().toISOString(),
        host: this.host,
        devices: devices
      };

    } catch (error) {
      console.error(`Error polling ${this.host}:`, error.message);
      return {
        success: false,
        timestamp: new Date().toISOString(),
        host: this.host,
        error: error.message,
        devices: []
      };
    }
  }

  /**
   * Get interface statistics
   */
  async getInterfaceData(session) {
    const interfaces = {};
    
    try {
      // Use subtree walk instead of table walk for better compatibility
      const session2 = new SnmpSession(this.host, this.community);
      
      return new Promise((resolve, reject) => {
        const sess = session2.createSession();
        
        function feedCb(varbinds) {
          for (let i = 0; i < varbinds.length; i++) {
            if (snmp.isVarbindError(varbinds[i])) {
              console.error('Varbind error:', snmp.varbindError(varbinds[i]));
            } else {
              const oid = varbinds[i].oid;
              const value = varbinds[i].value;
              const parts = oid.split('.');
              
              // Extract ifIndex (last part of OID)
              const ifIndex = parts[parts.length - 1];
              // Extract column (second to last part)
              const column = parts[parts.length - 2];
              
              if (!interfaces[ifIndex]) {
                interfaces[ifIndex] = {};
              }
              
              // Map columns: 2=ifDescr, 5=ifSpeed, 8=ifOperStatus, 10=ifInOctets, 16=ifOutOctets
              if (column === '2') {
                interfaces[ifIndex].ifDescr = value.toString();
              } else if (column === '5') {
                interfaces[ifIndex].ifSpeed = parseInt(value) || 0;
              } else if (column === '8') {
                interfaces[ifIndex].ifOperStatus = parseInt(value) || 2;
              } else if (column === '10') {
                interfaces[ifIndex].ifInOctets = parseInt(value) || 0;
              } else if (column === '16') {
                interfaces[ifIndex].ifOutOctets = parseInt(value) || 0;
              }
            }
          }
        }
        
        sess.subtree('1.3.6.1.2.1.2.2.1', feedCb, (error) => {
          session2.close();
          if (error) {
            console.error('Error walking interface table:', error.message);
            reject(error);
          } else {
            console.log(`Found ${Object.keys(interfaces).length} interfaces on ${this.host}`);
            resolve(interfaces);
          }
        });
      });
    } catch (error) {
      console.error('Error getting interface data:', error.message);
      return interfaces;
    }
  }

  /**
   * Get MAC address forwarding table
   */
  async getMacAddressTable(session) {
    const macTable = {};
    
    try {
      const session2 = new SnmpSession(this.host, this.community);
      
      return new Promise((resolve, reject) => {
        const sess = session2.createSession();
        
        function feedCb(varbinds) {
          for (let i = 0; i < varbinds.length; i++) {
            if (snmp.isVarbindError(varbinds[i])) {
              console.error('MAC table varbind error:', snmp.varbindError(varbinds[i]));
            } else {
              const oid = varbinds[i].oid;
              const value = varbinds[i].value;
              const parts = oid.split('.');
              const column = parts[parts.length - 7]; // Column number
              
              // Get MAC address from OID (last 6 octets)
              const macOctets = parts.slice(-6);
              const mac = macOctets.map(o => parseInt(o).toString(16).padStart(2, '0')).join(':').toUpperCase();
              
              if (column === '2') { // dot1dTpFdbPort
                const bridgePort = parseInt(value);
                if (!macTable[bridgePort]) {
                  macTable[bridgePort] = [];
                }
                macTable[bridgePort].push(mac);
              }
            }
          }
        }
        
        sess.subtree('1.3.6.1.2.1.17.4.3.1', feedCb, (error) => {
          session2.close();
          if (error) {
            console.error('Error walking MAC table:', error.message);
            resolve(macTable);
          } else {
            const totalMacs = Object.values(macTable).reduce((sum, arr) => sum + arr.length, 0);
            console.log(`Found ${Object.keys(macTable).length} bridge ports with ${totalMacs} total MACs on ${this.host}`);
            
            // Debug: Show sample of MACs found
            if (totalMacs > 0) {
              const firstPort = Object.keys(macTable)[0];
              console.log(`Sample - Bridge port ${firstPort}: ${macTable[firstPort].slice(0, 3).join(', ')}`);
            }
            
            resolve(macTable);
          }
        });
      });
    } catch (error) {
      console.error('Error getting MAC table:', error.message);
      return macTable;
    }
  }

  /**
   * Get bridge port to interface index mapping
   */
  async getBridgePortMapping(session) {
    const bridgeMap = {};
    
    try {
      const session2 = new SnmpSession(this.host, this.community);
      
      return new Promise((resolve, reject) => {
        const sess = session2.createSession();
        
        function feedCb(varbinds) {
          for (let i = 0; i < varbinds.length; i++) {
            if (snmp.isVarbindError(varbinds[i])) {
              console.error('Bridge mapping varbind error:', snmp.varbindError(varbinds[i]));
            } else {
              const oid = varbinds[i].oid;
              const value = varbinds[i].value;
              const parts = oid.split('.');
              const bridgePort = parts[parts.length - 1];
              const ifIndex = parseInt(value);
              
              bridgeMap[bridgePort] = ifIndex;
            }
          }
        }
        
        sess.subtree('1.3.6.1.2.1.17.1.4.1.2', feedCb, (error) => {
          session2.close();
          if (error) {
            console.error('Error walking bridge mapping:', error.message);
            resolve(bridgeMap);
          } else {
            console.log(`Found ${Object.keys(bridgeMap).length} bridge port mappings on ${this.host}`);
            resolve(bridgeMap);
          }
        });
      });
    } catch (error) {
      console.error('Error getting bridge mapping:', error.message);
      return bridgeMap;
    }
  }

  /**
   * Get VLAN mapping for interfaces
   */
  async getVlanMapping(session) {
    const vlanMap = {};
    
    try {
      const session2 = new SnmpSession(this.host, this.community);
      
      return new Promise((resolve, reject) => {
        const sess = session2.createSession();
        
        function feedCb(varbinds) {
          for (let i = 0; i < varbinds.length; i++) {
            if (snmp.isVarbindError(varbinds[i])) {
              // Ignore VLAN errors
            } else {
              const oid = varbinds[i].oid;
              const value = varbinds[i].value;
              const parts = oid.split('.');
              const ifIndex = parts[parts.length - 1];
              
              // vmVlan OID returns VLAN ID for the interface
              vlanMap[ifIndex] = parseInt(value) || 1;
            }
          }
        }
        
        // Try to get VLAN membership (Cisco vmVlan OID)
        sess.subtree('1.3.6.1.4.1.9.9.68.1.2.2.1.2', feedCb, (error) => {
          session2.close();
          if (error) {
            console.log('VLAN info not available (this is OK) - using default VLAN 1 for all ports');
            resolve(vlanMap);
          } else {
            console.log(`Found VLAN info for ${Object.keys(vlanMap).length} interfaces on ${this.host}`);
            resolve(vlanMap);
          }
        });
      });
    } catch (error) {
      console.log('Error getting VLAN mapping:', error.message);
      return vlanMap;
    }
  }

  /**
   * Process raw SNMP data into usable format
   */
  processData(interfaces, macTable, bridgeMap, vlanMap) {
    const now = Date.now();
    const devices = [];
    const previousData = counterCache.get(this.cacheKey) || {};

    console.log(`Processing ${Object.keys(interfaces).length} interfaces...`);

    for (const [ifIndex, iface] of Object.entries(interfaces)) {
      // Skip down interfaces
      if (iface.ifOperStatus !== 1) {
        continue;
      }

      // Filter: Only process GigabitEthernet interfaces (access ports)
      const ifDescr = iface.ifDescr || '';
      const isGigabitEthernet = /^GigabitEthernet\d+\/\d+\/\d+$/i.test(ifDescr);
      
      // Skip if not GigabitEthernet (filters out VLANs, TenGig, uplinks, etc.)
      if (!isGigabitEthernet) {
        continue;
      }

      // Check if port is in excluded list
      if (this.excludedPorts.length > 0) {
        const isExcluded = this.excludedPorts.some(port => {
          // Match full name or shorthand (e.g., "Gi1/0/1" or "GigabitEthernet1/0/1")
          return ifDescr === port || 
                 ifDescr === `GigabitEthernet${port}` ||
                 ifDescr.toLowerCase().includes(port.toLowerCase());
        });
        
        if (isExcluded) {
          console.log(`Skipping excluded port: ${ifDescr}`);
          continue;
        }
      }

      // Check if port is on excluded VLAN
      if (this.excludedVlans.length > 0) {
        const portVlan = vlanMap[ifIndex] || 1;
        if (this.excludedVlans.includes(String(portVlan))) {
          console.log(`Skipping port ${ifDescr} on excluded VLAN ${portVlan}`);
          continue;
        }
      }

      // Calculate traffic rate (Kbps)
      let trafficRate = 0;
      const cacheKey = `${ifIndex}`;
      
      if (previousData[cacheKey]) {
        const timeDiff = (now - previousData[cacheKey].timestamp) / 1000; // seconds
        
        if (timeDiff > 0) {
          const inDiff = iface.ifInOctets - previousData[cacheKey].ifInOctets;
          const outDiff = iface.ifOutOctets - previousData[cacheKey].ifOutOctets;
          
          // Handle counter wrap (32-bit counters)
          const maxCounter = 4294967295;
          const inBytes = inDiff < 0 ? (maxCounter + inDiff) : inDiff;
          const outBytes = outDiff < 0 ? (maxCounter + outDiff) : outDiff;
          
          // Convert to Kbps
          const inRate = (inBytes * 8) / timeDiff / 1000;
          const outRate = (outBytes * 8) / timeDiff / 1000;
          trafficRate = inRate + outRate;
          
          if (trafficRate > 1) {
            console.log(`Interface ${ifIndex} (${iface.ifDescr}): ${trafficRate.toFixed(2)} Kbps`);
          }
        }
      } else {
        console.log(`First poll for interface ${ifIndex} (${iface.ifDescr}) - storing baseline`);
      }

      // Store current values for next calculation
      if (!previousData[cacheKey]) {
        previousData[cacheKey] = {};
      }
      previousData[cacheKey].ifInOctets = iface.ifInOctets;
      previousData[cacheKey].ifOutOctets = iface.ifOutOctets;
      previousData[cacheKey].timestamp = now;

      // Get MACs on this port via bridge mapping
      let macsOnPort = [];
      for (const [bridgePort, macs] of Object.entries(macTable)) {
        const mappedIfIndex = bridgeMap[bridgePort];
        if (mappedIfIndex == ifIndex) {
          macsOnPort = macsOnPort.concat(macs);
        }
      }

      // If no MACs found via bridge table and there's traffic, create a unique port identifier
      if (macsOnPort.length === 0 && trafficRate > 0) {
        // Use consistent port-based identifier that won't change between polls
        macsOnPort.push(`port-${ifIndex}@${this.host}`);
      }

      // Only create device entries if there's traffic or MACs
      if (macsOnPort.length > 0) {
        // Distribute traffic across MACs on the port
        const ratePerMac = trafficRate / macsOnPort.length;

        macsOnPort.forEach(mac => {
          devices.push({
            ifIndex: parseInt(ifIndex),
            ifDescr: iface.ifDescr || `Interface ${ifIndex}`,
            macAddress: mac,
            trafficRate: Math.round(ratePerMac * 100) / 100, // Round to 2 decimals
            timestamp: new Date().toISOString()
          });
        });
      }
    }

    // Update cache
    counterCache.set(this.cacheKey, previousData);
    
    console.log(`Returning ${devices.length} devices with traffic/MACs`);

    return devices;
  }

  /**
   * Helper: Convert SNMP octet string to readable string
   */
  parseOctetString(octets) {
    if (Buffer.isBuffer(octets)) {
      return octets.toString('utf8').replace(/\0/g, '');
    }
    return String(octets);
  }

  /**
   * Helper: Format MAC address from bytes
   */
  formatMacAddress(bytes) {
    if (Buffer.isBuffer(bytes)) {
      return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(':')
        .toUpperCase();
    } else if (typeof bytes === 'string') {
      // Already formatted
      return bytes;
    }
    return 'unknown';
  }
}

/**
 * API Routes
 */

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'SNMP Building Capacity Monitor'
  });
});

// Poll a single switch
app.get('/api/snmp/poll', async (req, res) => {
  const { host, community, stackMembers, excludedVlans, excludedPorts } = req.query;

  if (!host || !community) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters: host, community'
    });
  }

  // Parse exclusions
  const vlanList = excludedVlans ? excludedVlans.split(',').map(v => v.trim()) : [];
  const portList = excludedPorts ? excludedPorts.split(',').map(p => p.trim()) : [];

  const poller = new SwitchPoller(
    host,
    community,
    parseInt(stackMembers) || 1,
    vlanList,
    portList
  );

  const result = await poller.poll();
  res.json(result);
});

// Poll multiple switches (batch)
app.post('/api/snmp/poll-batch', async (req, res) => {
  const { switches } = req.body;

  if (!Array.isArray(switches) || switches.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameter: switches array'
    });
  }

  const results = await Promise.all(
    switches.map(async (sw) => {
      const poller = new SwitchPoller(
        sw.ipAddress,
        sw.community,
        sw.stackMembers || 1
      );
      return {
        switchId: sw.id,
        ...(await poller.poll())
      };
    })
  );

  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    results: results
  });
});

// Clear counter cache (useful for testing)
app.post('/api/snmp/clear-cache', (req, res) => {
  counterCache.clear();
  res.json({
    success: true,
    message: 'Counter cache cleared'
  });
});

// Get cache info
app.get('/api/snmp/cache-info', (req, res) => {
  res.json({
    success: true,
    cacheSize: counterCache.size,
    keys: Array.from(counterCache.keys())
  });
});

/**
 * Error handling middleware
 */
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: err.message
  });
});

/**
 * Start server
 */
app.listen(PORT, () => {
  console.log(`===========================================`);
  console.log(`SNMP Building Capacity Monitor Backend`);
  console.log(`===========================================`);
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`===========================================`);
  console.log(`Example API calls:`);
  console.log(`  GET  /api/snmp/poll?host=192.168.1.1&community=public&stackMembers=2`);
  console.log(`  POST /api/snmp/poll-batch`);
  console.log(`  GET  /api/config/sites - Get site configuration`);
  console.log(`===========================================`);
});

// Optional: Site configuration endpoint
// Create a config.json file in your backend directory with site definitions

app.get('/api/config/sites', (req, res) => {
  try {
    const configPath = path.join(__dirname, 'sites-config.json');
    
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      res.json({
        success: true,
        sites: config.sites || []
      });
    } else {
      // Return example config if file doesn't exist
      res.json({
        success: true,
        sites: [],
        message: 'No config file found. Create sites-config.json in backend directory.'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Save site configuration from frontend
app.post('/api/config/sites', (req, res) => {
  try {
    const configPath = path.join(__dirname, 'sites-config.json');
    fs.writeFileSync(configPath, JSON.stringify(req.body, null, 2));
    
    res.json({
      success: true,
      message: 'Configuration saved successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Save site configuration from frontend
app.post('/api/config/sites', (req, res) => {
  try {
    const configPath = path.join(__dirname, 'sites-config.json');
    fs.writeFileSync(configPath, JSON.stringify(req.body, null, 2));
    
    // Restart polling with new config
    if (req.body.sites) {
      startPolling(req.body.sites, req.body.globalSettings || globalSettings);
    }
    
    res.json({
      success: true,
      message: 'Configuration saved successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get current session data for a site
app.get('/api/sessions/:siteId', (req, res) => {
  const { siteId } = req.params;
  const sessions = sessionStore.get(siteId);
  
  if (!sessions) {
    return res.json({
      success: true,
      sessions: [],
      confirmedCount: 0,
      pendingCount: 0
    });
  }
  
  const sessionArray = Array.from(sessions.values()).map(s => ({
    ...s,
    firstSeen: s.firstSeen.toISOString(),
    lastSeen: s.lastSeen.toISOString(),
    lastActive: s.lastActive.toISOString(),
    lastReset: s.lastReset.toISOString()
  }));
  
  const confirmed = sessionArray.filter(s => s.confirmed);
  const pending = sessionArray.filter(s => !s.confirmed);
  
  res.json({
    success: true,
    sessions: sessionArray,
    confirmedCount: confirmed.length,
    pendingCount: pending.length,
    lastUpdate: new Date().toISOString()
  });
});

// Get historical data for a site
app.get('/api/history/:siteId', (req, res) => {
  const { siteId } = req.params;
  const history = historicalStore.get(siteId) || [];
  
  res.json({
    success: true,
    history: history.slice(-50) // Last 50 data points
  });
});

// Get all sites summary
app.get('/api/summary', (req, res) => {
  const summary = [];
  
  for (const [siteId, sessions] of sessionStore.entries()) {
    const confirmed = Array.from(sessions.values()).filter(s => s.confirmed);
    const pending = Array.from(sessions.values()).filter(s => !s.confirmed);
    
    summary.push({
      siteId,
      confirmedCount: confirmed.length,
      pendingCount: pending.length,
      totalSessions: sessions.size
    });
  }
  
  res.json({
    success: true,
    summary,
    lastUpdate: new Date().toISOString()
  });
});

// Start/stop polling endpoints
app.post('/api/polling/start', async (req, res) => {
  try {
    const config = await loadSitesConfig();
    if (config.sites) {
      startPolling(config.sites, config.globalSettings || globalSettings);
      res.json({ success: true, message: 'Polling started' });
    } else {
      res.status(400).json({ success: false, error: 'No sites configured' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/polling/stop', (req, res) => {
  stopPolling();
  res.json({ success: true, message: 'Polling stopped' });
});

// Helper: Load sites config
function loadSitesConfig() {
  return new Promise((resolve, reject) => {
    const configPath = path.join(__dirname, 'sites-config.json');
    
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        resolve(config);
      } catch (error) {
        reject(error);
      }
    } else {
      resolve({ sites: [] });
    }
  });
}

// Helper: Start polling all sites
function startPolling(sites, settings) {
  console.log('Starting server-side polling...');
  
  // Stop existing polling
  stopPolling();
  
  // Update global settings
  globalSettings = settings || globalSettings;
  
  // Start polling for each site
  sites.forEach(site => {
    if (!site.enabled) return;
    
    console.log(`Starting polling for site: ${site.name}`);
    
    // Initialize session store for this site
    if (!sessionStore.has(site.id)) {
      sessionStore.set(site.id, new Map());
    }
    if (!historicalStore.has(site.id)) {
      historicalStore.set(site.id, []);
    }
    
    // Poll immediately
    pollSite(site, globalSettings);
    
    // Set up interval
    const intervalId = setInterval(() => {
      pollSite(site, globalSettings);
    }, (settings?.refreshInterval || 90) * 1000);
    
    pollingIntervals.set(site.id, intervalId);
  });
}

// Helper: Stop all polling
function stopPolling() {
  console.log('Stopping all polling...');
  for (const [siteId, intervalId] of pollingIntervals.entries()) {
    clearInterval(intervalId);
  }
  pollingIntervals.clear();
}

// Helper: Poll a single site
async function pollSite(site, settings) {
  const now = new Date();
  const allDevices = [];
  
  try {
    // Poll each switch in the site
    for (const switchStack of site.switches) {
      if (!switchStack.enabled) continue;
      
      const poller = new SwitchPoller(
        switchStack.ipAddress,
        switchStack.community,
        switchStack.stackMembers || 1,
        switchStack.excludedVlans || [],
        switchStack.excludedPorts || []
      );
      
      const result = await poller.poll();
      if (result.success) {
        allDevices.push(...result.devices.map(d => ({
          ...d,
          switchId: switchStack.id,
          switchName: switchStack.name
        })));
      }
    }
    
    // Process sessions
    const sessions = sessionStore.get(site.id);
    const threshold = site.trafficThreshold ?? settings.trafficThreshold;
    const activeDevices = allDevices.filter(d => d.trafficRate > threshold);
    const detectedMacs = activeDevices.map(d => d.macAddress);
    
    // Update sessions
    detectedMacs.forEach(mac => {
      const deviceInfo = allDevices.find(d => d.macAddress === mac);
      
      if (sessions.has(mac)) {
        const existing = sessions.get(mac);
        const newPollCount = (existing.consecutivePollCount || 0) + 1;
        const isConfirmed = newPollCount >= (settings.confirmationPolls || 2);
        
        sessions.set(mac, {
          ...existing,
          lastSeen: now,
          lastActive: now,
          switchId: deviceInfo.switchId,
          switchName: deviceInfo.switchName,
          ifDescr: deviceInfo.ifDescr,
          currentTraffic: deviceInfo.trafficRate,
          consecutivePollCount: newPollCount,
          confirmed: isConfirmed
        });
      } else {
        sessions.set(mac, {
          mac,
          firstSeen: now,
          lastSeen: now,
          lastActive: now,
          lastReset: now,
          switchId: deviceInfo.switchId,
          switchName: deviceInfo.switchName,
          ifDescr: deviceInfo.ifDescr,
          currentTraffic: deviceInfo.trafficRate,
          consecutivePollCount: 1,
          confirmed: (settings.confirmationPolls || 2) === 1
        });
      }
    });
    
    // Clean up unconfirmed sessions that disappeared
    for (const [mac, session] of sessions.entries()) {
      if (!detectedMacs.includes(mac) && !session.confirmed) {
        sessions.delete(mac);
      } else if (!detectedMacs.includes(mac)) {
        session.consecutivePollCount = 0;
      }
    }
    
    // Remove timed-out sessions
    const timeoutMs = settings.sessionTimeout * 60 * 1000;
    for (const [mac, session] of sessions.entries()) {
      if (session.confirmed && (now - session.lastActive > timeoutMs)) {
        sessions.delete(mac);
      }
    }
    
    // Store historical data
    const history = historicalStore.get(site.id);
    const confirmed = Array.from(sessions.values()).filter(s => s.confirmed);
    
    history.push({
      time: now.toLocaleTimeString(),
      timestamp: now.getTime(),
      totalSessions: confirmed.length,
      currentActive: detectedMacs.length
    });
    
    // Keep only last 100 data points
    if (history.length > 100) {
      history.shift();
    }
    
    console.log(`[${site.name}] Polled: ${confirmed.length} confirmed, ${sessions.size - confirmed.length} pending`);
    
  } catch (error) {
    console.error(`Error polling site ${site.name}:`, error.message);
  }
}

// Auto-start polling on server start
(async () => {
  try {
    const config = await loadSitesConfig();
    if (config.sites && config.sites.length > 0) {
      startPolling(config.sites, config.globalSettings);
      console.log('Auto-started polling for configured sites');
    }
  } catch (error) {
    console.error('Failed to auto-start polling:', error);
  }
})();

module.exports = app;
