import React, { useState } from 'react';

const GlobalSettings = ({ settings, onUpdate }) => {
  const [hasChanges, setHasChanges] = useState(false);
  const [localSettings, setLocalSettings] = useState(settings);

  const handleChange = (field, value) => {
    setLocalSettings({ ...localSettings, [field]: value });
    setHasChanges(true);
  };

  const handleSave = () => {
    onUpdate(localSettings);
    setHasChanges(false);
  };

  const handleCancel = () => {
    setLocalSettings(settings);
    setHasChanges(false);
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Global Settings</h2>
        {hasChanges && (
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Save Changes
            </button>
          </div>
        )}
      </div>
      <div className="grid md:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Traffic Threshold (Kbps)
          </label>
          <input
            type="number"
            value={localSettings.trafficThreshold}
            onChange={(e) => handleChange('trafficThreshold', Number(e.target.value))}
            className="w-full p-2 border border-gray-300 rounded-md"
          />
          <p className="text-xs text-gray-500 mt-1">Default for all sites</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Confirmation Polls Required
          </label>
          <input
            type="number"
            min="1"
            max="5"
            value={localSettings.confirmationPolls || 2}
            onChange={(e) => handleChange('confirmationPolls', Number(e.target.value))}
            className="w-full p-2 border border-gray-300 rounded-md"
          />
          <p className="text-xs text-gray-500 mt-1">Polls before counting user</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Session Timeout (minutes)
          </label>
          <input
            type="number"
            value={localSettings.sessionTimeout}
            onChange={(e) => handleChange('sessionTimeout', Number(e.target.value))}
            className="w-full p-2 border border-gray-300 rounded-md"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Refresh Interval (seconds)
          </label>
          <input
            type="number"
            value={localSettings.refreshInterval}
            onChange={(e) => handleChange('refreshInterval', Number(e.target.value))}
            className="w-full p-2 border border-gray-300 rounded-md"
          />
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4 mt-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Daily Reset Time
          </label>
          <input
            type="time"
            value={localSettings.sessionResetTime}
            onChange={(e) => handleChange('sessionResetTime', e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-md"
          />
        </div>
      </div>
    </div>
  );
};

export default GlobalSettings;
