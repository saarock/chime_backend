const getEnv = (key: string, fallback?: string): string => {
  const value = process.env[key];
  if (value === undefined || value === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`❌ Environment variable ${key} is not set`);
  }
  return value;
};

export default getEnv;