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
    borderColor: THEME.colors.border,
  },
  default: {
    backgroundColor: THEME.colors.surface,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  elevated: {
    backgroundColor: THEME.colors.surface,
    borderColor: THEME.colors.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  glass: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderColor: THEME.colors.border,
  },
  gold: {
    backgroundColor: THEME.colors.goldSubtle,
    borderColor: '#FDE68A',
    borderWidth: 1,
  },
  emerald: {
    backgroundColor: THEME.colors.emeraldSubtle,
    borderColor: '#BBF7D0',
    borderWidth: 1,
  },
});
