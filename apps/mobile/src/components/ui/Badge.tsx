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
          bg: THEME.colors.emeraldSubtle,
          text: THEME.colors.emerald,
          border: '#BBF7D0',
        };
      case 'inactive':
      case 'rejected':
        return {
          bg: THEME.colors.primarySubtle,
          text: THEME.colors.danger,
          border: '#FECACA',
        };
      case 'pending':
      case 'gold':
        return {
          bg: THEME.colors.goldSubtle,
          text: THEME.colors.gold,
          border: '#FDE68A',
        };
      case 'cyan':
        return {
          bg: '#F0F9FF',
          text: THEME.colors.cyan,
          border: '#BAE6FD',
        };
      case 'neutral':
      default:
        return {
          bg: THEME.colors.surfaceSubtle,
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
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
