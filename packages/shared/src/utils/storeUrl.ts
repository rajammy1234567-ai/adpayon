/**
 * Official Google Play Store URL & Intent Utilities
 *
 * Implements strict, fail-closed validation for official Google Play Store destinations,
 * Android package name syntax, and safe URL resolution.
 */

import { ANDROID_PACKAGE_NAME_REGEX } from '../validators/appInstall';

/**
 * Validates that an Android application ID/package name is syntactically well-formed.
 */
export function isValidAndroidPackageName(packageName?: string | null): boolean {
  if (!packageName || typeof packageName !== 'string') return false;
  const trimmed = packageName.trim();
  if (trimmed.length < 3 || trimmed.length > 150) return false;
  return ANDROID_PACKAGE_NAME_REGEX.test(trimmed);
}

/**
 * Validates whether a store URL is an authentic, approved Google Play Store URL
 * pointing to the exact expected package name.
 *
 * Rejects:
 * - Third-party app stores (e.g., apkpure, apkmirror)
 * - Arbitrary redirect chains or shorteners
 * - Insecure HTTP protocols
 * - Direct APK downloads (.apk)
 * - URLs with mismatched package IDs
 */
export function isValidPlayStoreUrl(url?: string | null, expectedPackageName?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  if (!expectedPackageName || !isValidAndroidPackageName(expectedPackageName)) return false;

  const trimmed = url.trim();

  // 1. Native Market Intent URI (market://details?id=<package>)
  if (trimmed.startsWith('market://')) {
    try {
      const simulatedUrl = trimmed.replace('market://', 'https://market.android.com/');
      const parsed = new URL(simulatedUrl);
      if (parsed.pathname !== '/details') return false;
      const pkg = parsed.searchParams.get('id');
      return pkg === expectedPackageName;
    } catch {
      return false;
    }
  }

  // 2. Official Web Play Store URL (https://play.google.com/store/apps/details?id=<package>)
  if (!trimmed.startsWith('https://')) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();

    // Strictly whitelist official Google Play Store hostnames
    if (host !== 'play.google.com' && host !== 'market.android.com') {
      return false;
    }

    // Strictly reject direct APK file links anywhere in the URL
    if (trimmed.toLowerCase().includes('.apk')) {
      return false;
    }

    // Must be /store/apps/details path on play.google.com, or /details on market.android.com
    const isPlayStorePath = parsed.pathname.startsWith('/store/apps/details');
    const isMarketPath = host === 'market.android.com' && parsed.pathname.startsWith('/details');
    if (!isPlayStorePath && !isMarketPath) {
      return false;
    }

    // Must have matching package id parameter
    const pkg = parsed.searchParams.get('id');
    if (!pkg || pkg !== expectedPackageName) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Builds the canonical official Google Play Store web URL for an application ID.
 */
export function buildCanonicalPlayStoreUrl(packageName: string): string {
  const trimmed = String(packageName || '').trim();
  return `https://play.google.com/store/apps/details?id=${encodeURIComponent(trimmed)}`;
}

/**
 * Builds the native Android Market intent URI for an application ID.
 */
export function buildMarketIntentUri(packageName: string): string {
  const trimmed = String(packageName || '').trim();
  return `market://details?id=${encodeURIComponent(trimmed)}`;
}
