export const fetchSiteSessions = async (siteId) => {
  try {
    const response = await fetch(`/api/sessions/${siteId}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching sessions for site ${siteId}:`, error);
    return { success: false, sessions: [], confirmedCount: 0, pendingCount: 0 };
  }
};

export const fetchSiteHistory = async (siteId) => {
  try {
    const response = await fetch(`/api/history/${siteId}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching history for site ${siteId}:`, error);
    return { success: false, history: [] };
  }
};

export const fetchSummary = async () => {
  try {
    const response = await fetch(`/api/summary`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching summary:', error);
    return { success: false, summary: [] };
  }
};
