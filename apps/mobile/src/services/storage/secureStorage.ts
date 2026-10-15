import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const REFRESH_TOKEN_KEY = 'adpayon_auth_refresh_token';

// In-memory fallback for environments where SecureStore is unavailable (e.g. web testing)
let memoryRefreshTokenFallback: string | null = null;

async function isSecureStoreAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Persists the session refresh token securely into the device's hardware-backed
 * keystore / keychain (via expo-secure-store).
 */
export async function setRefreshToken(token: string): Promise<void> {
  try {
    const available = await isSecureStoreAvailable();
    if (available) {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      });
    } else {
      memoryRefreshTokenFallback = token;
    }
  } catch (error) {
    // Fallback to memory to prevent user lockout if storage encounters non-fatal device error
    memoryRefreshTokenFallback = token;
  }
}

/**
 * Retrieves the persisted refresh token from secure storage.
 */
export async function getRefreshToken(): Promise<string | null> {
  try {
    const available = await isSecureStoreAvailable();
    if (available) {
      return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    }
    return memoryRefreshTokenFallback;
  } catch {
    return memoryRefreshTokenFallback;
  }
}

/**
 * Removes the refresh token from secure storage upon user logout or session revocation.
 */
export async function clearRefreshToken(): Promise<void> {
  try {
    memoryRefreshTokenFallback = null;
    const available = await isSecureStoreAvailable();
    if (available) {
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    }
  } catch {
    memoryRefreshTokenFallback = null;
  }
}
