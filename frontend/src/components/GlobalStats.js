import React from 'react';
import { Globe, UserCheck, Building2, Clock } from 'lucide-react';

const GlobalStats = ({ totalSites, totalOccupancy, totalCapacity, lastUpdate }) => {
  const utilizationPercent = totalCapacity > 0 
    ? Math.round((totalOccupancy / totalCapacity) * 100) 
    : 0;

  return (
    <div className="grid md:grid-cols-4 gap-6 mb-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <Globe className="w-8 h-8 text-blue-600" />
          <div>
            <div className="text-2xl font-bold text-gray-800">{totalSites}</div>
            <div className="text-sm text-gray-600">Total Sites</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <UserCheck className="w-8 h-8 text-green-600" />
          <div>
            <div className="text-2xl font-bold text-gray-800">{totalOccupancy}</div>
            <div className="text-sm text-gray-600">Total Occupancy</div>
          </div>
        </div>
        <div className="text-xs text-gray-500">Across all sites</div>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <Building2 className="w-8 h-8 text-purple-600" />
          <div>
            <div className="text-2xl font-bold text-gray-800">{totalCapacity}</div>
            <div className="text-sm text-gray-600">Total Capacity</div>
          </div>
        </div>
        <div className="text-xs text-gray-500">{utilizationPercent}% utilized</div>
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
  );
};

export default GlobalStats;
