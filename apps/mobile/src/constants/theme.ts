export const THEME = {
  colors: {
    // Red / White Light Theme Surfaces
    background: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceSubtle: '#F1F5F9',
    surfaceElevated: '#FFFFFF',
    border: '#E2E8F0',
    borderSubtle: '#F1F5F9',

    // Red Primary Actions & Brand
    primary: '#DC2626',
    primaryDark: '#B91C1C',
    primaryLight: '#EF4444',
    primaryGlow: 'rgba(220, 38, 38, 0.08)',
    primarySubtle: '#FEF2F2',

    // Success (Green for earnings & verified status)
    emerald: '#16A34A',
    emeraldDark: '#15803D',
    emeraldLight: '#22C55E',
    emeraldGlow: 'rgba(22, 163, 74, 0.10)',
    emeraldSubtle: '#F0FDF4',

    // Amber / Gold (Pending, warnings, streaks & badges)
    gold: '#D97706',
    goldLight: '#F59E0B',
    goldDark: '#B45309',
    goldGlow: 'rgba(217, 119, 6, 0.10)',
    goldSubtle: '#FFFBEB',

    // Cyan / Info
    cyan: '#0284C7',
    cyanGlow: 'rgba(2, 132, 199, 0.10)',

    // Danger / Error
    danger: '#DC2626',
    dangerGlow: 'rgba(220, 38, 38, 0.10)',

    warning: '#D97706',
    info: '#2563EB',

    // Accessible Text Hierarchy (WCAG AAA/AA compliant on #FFFFFF and #F8FAFC)
    textPrimary: '#0F172A',
    textSecondary: '#475569',
    textMuted: '#64748B',
    textDisabled: '#94A3B8',
    textInverse: '#FFFFFF',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
  borderRadius: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    full: 9999,
  },
  shadows: {
    card: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    floating: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.10,
      shadowRadius: 16,
      elevation: 8,
    },
    modal: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.15,
      shadowRadius: 24,
      elevation: 12,
    },
  },
};
