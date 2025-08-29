// Environment configuration for frontend
export function getApiBaseUrl(): string {
  // Server-side: use environment variable
  if (typeof window === 'undefined') {
    return process.env.API_BASE_URL || 'https://api.justarr.com';
  }
  
  // Client-side: use window location for relative URLs or env var
  return (window as any).__API_BASE_URL__ || 'https://api.justarr.com';
}
