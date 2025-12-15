import React from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#10b981', '#eab308', '#f97316', '#ef4444'];

const SiteCharts = ({ sites, siteSessions }) => {
  const getSiteOccupancyStatus = (site) => {
    const sessions = siteSessions[site.id] || new Map();
    const percent = (sessions.size / site.capacity) * 100;
    
    if (percent < 50) return 'low';
    if (percent < 80) return 'moderate';
    if (percent < 100) return 'high';
    return 'atCapacity';
  };

  const getSitesByStatus = () => {
    const statusCounts = { low: 0, moderate: 0, high: 0, atCapacity: 0 };
    sites.forEach(site => {
      const status = getSiteOccupancyStatus(site);
      statusCounts[status]++;
    });
    return statusCounts;
  };

  const statusData = getSitesByStatus();

  return (
    <div className="grid md:grid-cols-2 gap-6 mb-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">Site Status Distribution</h2>
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={[
                { name: 'Low', value: statusData.low },
                { name: 'Moderate', value: statusData.moderate },
                { name: 'High', value: statusData.high },
                { name: 'At Capacity', value: statusData.atCapacity }
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
  );
};

export default SiteCharts;
