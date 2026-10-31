import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const FLOATING_TAB_BAR_HEIGHT = 64;
export const FLOATING_TAB_BAR_BASE_OFFSET = 12;
export const FLOATING_TAB_BAR_RAISE_OFFSET = 8; // Raised by +8dp per layout specification

/**
 * Calculates dynamic bottom padding for screens with a floating bottom tab bar.
 * Derives spacing from actual floating tab bar height, raised bottom position,
 * safe area insets (gesture / 3-button nav), and custom additional clearance.
 */
export function useBottomTabSpacing(extraPadding: number = 16): number {
  const insets = useSafeAreaInsets();
  const bottomOffset = Math.max(insets.bottom, FLOATING_TAB_BAR_BASE_OFFSET) + FLOATING_TAB_BAR_RAISE_OFFSET;
  return FLOATING_TAB_BAR_HEIGHT + bottomOffset + extraPadding;
}

/**
 * Calculates dynamic bottom padding for regular screens with fixed bottom action buttons or insets.
 */
export function useScreenBottomSpacing(extraPadding: number = 24): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, 16) + extraPadding;
}
