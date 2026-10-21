import { Platform } from 'react-native';

declare const process: {
  env: {
    EXPO_PUBLIC_API_URL?: string;
    [key: string]: string | undefined;
  };
};

/**
 * Resolves and validates the backend API base URL for mobile requests.
 * Prioritizes EXPO_PUBLIC_API_URL. Defaults dynamically per platform in dev:
 * - Android Emulator: http://10.0.2.2:5000/api
 * - iOS / Web / Loopback: http://127.0.0.1:5000/api
 * - Physical Android: Configure EXPO_PUBLIC_API_URL with your dev PC's LAN IP (e.g. http://192.168.1.X:5000/api)
 */
function resolveApiBaseUrl(): string {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

  let resolved = configuredUrl;
  if (!resolved) {
    if (Platform.OS === 'android') {
      resolved = 'http://10.0.2.2:5000/api';
    } else {
      resolved = 'http://127.0.0.1:5000/api';
    }
  }

  // Ensure trailing slash is removed
  if (resolved.endsWith('/')) {
    resolved = resolved.slice(0, -1);
  }

  // Ensure /api base path is appended if missing
  if (!resolved.endsWith('/api')) {
    resolved = `${resolved}/api`;
  }

  // Strict production safety assertion: Must use HTTPS in production
  const isProductionRelease = !__DEV__ && process.env.EXPO_PUBLIC_APP_ENV === 'production';
  if (isProductionRelease && !resolved.startsWith('https://')) {
    throw new Error('Security Violation: Production mobile API must use HTTPS');
  }

  return resolved;
}

export const API_BASE_URL = resolveApiBaseUrl();
export const API_REQUEST_TIMEOUT_MS = 15000;
