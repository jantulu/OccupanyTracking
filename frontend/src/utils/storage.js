export const loadFromStorage = async (key) => {
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.log(`No data found for ${key}:`, error);
  }
  return null;
};

export const saveToStorage = async (key, data) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error(`Error saving ${key}:`, error);
  }
};

export const deleteFromStorage = async (key) => {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`Error deleting ${key}:`, error);
  }
};
