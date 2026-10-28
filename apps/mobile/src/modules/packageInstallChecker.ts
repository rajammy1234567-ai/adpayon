import { NativeModules, Platform } from 'react-native';

const { PackageInstallChecker } = NativeModules;

export type InstallationStatus =
  | 'INSTALLED'
  | 'NOT_INSTALLED'
  | 'UNAVAILABLE';

export interface CheckInstallResult {
  status: InstallationStatus;
  message?: string;
  timestamp: number;
}

export const SUPPORTED_SCOPED_PACKAGES = ['com.sfarmart.userapp'];

export function isPackageVisibilitySupported(packageName: string): boolean {
  return SUPPORTED_SCOPED_PACKAGES.includes(packageName);
}

/**
 * Checks whether an Android package is installed on the device
 * using scoped PackageManager queries.
 *
 * In Expo Go, where custom native modules cannot be compiled into the binary,
 * or for packages not declared in AndroidManifest <queries>,
 * this explicitly returns 'UNAVAILABLE' with the required notice,
 * never a fake 'INSTALLED' result.
 */
export async function checkPackageInstallation(packageName: string): Promise<CheckInstallResult> {
  const now = Date.now();

  if (Platform.OS !== 'android') {
    return {
      status: 'UNAVAILABLE',
      message: 'Package verification is exclusively supported on Android.',
      timestamp: now,
    };
  }

  // Scoped package visibility check (Android 11+ requirement)
  if (!isPackageVisibilitySupported(packageName)) {
    return {
      status: 'UNAVAILABLE',
      message: `Package "${packageName}" is not declared in native visibility queries. Scoped queries are currently restricted to SFARMART24 (com.sfarmart.userapp).`,
      timestamp: now,
    };
  }

  // Detect missing native module
  if (!PackageInstallChecker || typeof PackageInstallChecker.isPackageInstalled !== 'function') {
    return {
      status: 'UNAVAILABLE',
      message: 'Installation verification requires the test APK',
      timestamp: now,
    };
  }

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Package check timed out')), 5000)
    );
    const isInstalled: boolean = await Promise.race([
      PackageInstallChecker.isPackageInstalled(packageName),
      timeoutPromise,
    ]);
    return {
      status: isInstalled ? 'INSTALLED' : 'NOT_INSTALLED',
      timestamp: now,
    };
  } catch (err: any) {
    return {
      status: 'UNAVAILABLE',
      message: err?.message || 'Installation verification requires the test APK',
      timestamp: now,
    };
  }
}

/**
 * Opens an installed package via Android PackageManager launch intent.
 */
export async function openInstalledPackage(packageName: string): Promise<boolean> {
  if (Platform.OS !== 'android' || !PackageInstallChecker || typeof PackageInstallChecker.openInstalledApp !== 'function') {
    return false;
  }

  try {
    const success: boolean = await PackageInstallChecker.openInstalledApp(packageName);
    return Boolean(success);
  } catch {
    return false;
  }
}
