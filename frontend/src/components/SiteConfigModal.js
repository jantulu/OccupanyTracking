import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

const SiteConfigModal = ({ site, onSave, onCancel }) => {
  const [editedSite, setEditedSite] = useState({ ...site });

  const addSwitch = () => {
    const newSwitch = {
      id: `switch-${Date.now()}`,
      name: 'New Switch',
      ipAddress: '',
      community: 'public',
      stackMembers: 1,
      enabled: true
    };
    
    setEditedSite({
      ...editedSite,
      switches: [...editedSite.switches, newSwitch]
    });
  };

  const updateSwitch = (switchId, updates) => {
    setEditedSite({
      ...editedSite,
      switches: editedSite.switches.map(sw => 
        sw.id === switchId ? { ...sw, ...updates } : sw
      )
    });
  };

  const deleteSwitch = (switchId) => {
    setEditedSite({
      ...editedSite,
      switches: editedSite.switches.filter(sw => sw.id !== switchId)
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-6">Configure Site: {editedSite.name}</h2>
          
          {/* Site Details */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-3">Site Information</h3>
            <div className="grid md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Site Name</label>
                <input
                  type="text"
                  value={editedSite.name}
                  onChange={(e) => setEditedSite({ ...editedSite, name: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
                <input
                  type="text"
                  value={editedSite.location}
                  onChange={(e) => setEditedSite({ ...editedSite, location: e.target.value })}
                  placeholder="City, State"
                  className="w-full p-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Building Capacity</label>
                <input
                  type="number"
                  value={editedSite.capacity}
                  onChange={(e) => setEditedSite({ ...editedSite, capacity: Number(e.target.value) })}
                  className="w-full p-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
            
            {/* Remove site-level exclusions, now at switch level */}
          </div>

          {/* Switch Configuration */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">Switch Stacks</h3>
              <button
                onClick={addSwitch}
                className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-1 text-sm"
              >
                <Plus className="w-4 h-4" />
                Add Switch
              </button>
            </div>
            
            <div className="space-y-3">
              {editedSite.switches.map(sw => (
                <div key={sw.id} className="p-4 border border-gray-200 rounded-lg bg-white">
                  <div className="grid md:grid-cols-5 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Switch Name</label>
                      <input
                        type="text"
                        value={sw.name}
                        onChange={(e) => updateSwitch(sw.id, { name: e.target.value })}
                        className="w-full p-2 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">IP Address</label>
                      <input
                        type="text"
                        value={sw.ipAddress}
                        onChange={(e) => updateSwitch(sw.id, { ipAddress: e.target.value })}
                        placeholder="192.168.1.1"
                        className="w-full p-2 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">SNMP Community</label>
                      <input
                        type="text"
                        value={sw.community}
                        onChange={(e) => updateSwitch(sw.id, { community: e.target.value })}
                        className="w-full p-2 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Stack Members</label>
                      <input
                        type="number"
                        value={sw.stackMembers}
                        onChange={(e) => updateSwitch(sw.id, { stackMembers: Number(e.target.value) })}
                        min="1"
                        className="w-full p-2 border border-gray-300 rounded-md text-sm"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        onClick={() => deleteSwitch(sw.id)}
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
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(editedSite)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SiteConfigModal;
