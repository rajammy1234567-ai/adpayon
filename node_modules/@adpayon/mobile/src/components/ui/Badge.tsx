import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { THEME } from '../../constants/theme';

export type BadgeVariant =
  | 'active'
  | 'inactive'
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'gold'
  | 'cyan'
  | 'neutral';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  style?: ViewStyle;
}

export const Badge: React.FC<BadgeProps> = ({ label, variant = 'neutral', style }) => {
  const getColors = () => {
    switch (variant) {
      case 'active':
      case 'verified':
        return {
          bg: THEME.colors.emeraldGlow,
          text: THEME.colors.emerald,
          border: THEME.colors.emeraldDark,
        };
      case 'inactive':
      case 'rejected':
        return {
          bg: THEME.colors.dangerGlow,
          text: THEME.colors.danger,
          border: THEME.colors.danger,
        };
      case 'pending':
      case 'gold':
        return {
          bg: THEME.colors.goldGlow,
          text: THEME.colors.gold,
          border: THEME.colors.goldDark,
        };
      case 'cyan':
        return {
          bg: THEME.colors.cyanGlow,
          text: THEME.colors.cyan,
          border: THEME.colors.cyan,
        };
      case 'neutral':
      default:
        return {
          bg: THEME.colors.surfaceElevated,
          text: THEME.colors.textSecondary,
          border: THEME.colors.border,
        };
    }
  };

  const colors = getColors();

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: colors.bg, borderColor: colors.border },
        style,
      ]}
    >
      <Text style={[styles.text, { color: colors.text }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: THEME.borderRadius.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
