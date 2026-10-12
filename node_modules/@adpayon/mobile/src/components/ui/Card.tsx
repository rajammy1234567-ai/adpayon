import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { THEME } from '../../constants/theme';

export type CardVariant = 'default' | 'elevated' | 'glass' | 'gold' | 'emerald';

interface CardProps {
  children: React.ReactNode;
  variant?: CardVariant;
  style?: ViewStyle;
}

export const Card: React.FC<CardProps> = ({ children, variant = 'default', style }) => {
  const getStyle = (): ViewStyle => {
    switch (variant) {
      case 'elevated':
        return styles.elevated;
      case 'glass':
        return styles.glass;
      case 'gold':
        return styles.gold;
      case 'emerald':
        return styles.emerald;
      case 'default':
      default:
        return styles.default;
    }
  };

  return <View style={[styles.base, getStyle(), style]}>{children}</View>;
};

const styles = StyleSheet.create({
  base: {
    borderRadius: THEME.borderRadius.lg,
    padding: THEME.spacing.lg,
    backgroundColor: THEME.colors.surface,
    borderWidth: 1,
    borderColor: THEME.colors.borderSubtle,
  },
  default: {
    backgroundColor: THEME.colors.surface,
  },
  elevated: {
    backgroundColor: THEME.colors.surfaceSubtle,
    borderColor: THEME.colors.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  glass: {
    backgroundColor: 'rgba(28, 35, 49, 0.75)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  gold: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderColor: THEME.colors.gold,
    borderWidth: 1.5,
  },
  emerald: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: THEME.colors.emerald,
    borderWidth: 1.5,
  },
});
