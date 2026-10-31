import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { THEME } from '../../constants/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'gold' | 'outline' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  disabled?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  leftIcon,
  rightIcon,
  style,
  textStyle,
}) => {
  const getContainerStyle = (): ViewStyle => {
    const base: ViewStyle = {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: THEME.borderRadius.md,
      opacity: disabled || isLoading ? 0.6 : 1,
    };

    // Size
    switch (size) {
      case 'sm':
        base.paddingVertical = 8;
        base.paddingHorizontal = 14;
        break;
      case 'lg':
        base.paddingVertical = 16;
        base.paddingHorizontal = 24;
        break;
      case 'md':
      default:
        base.paddingVertical = 12;
        base.paddingHorizontal = 18;
        break;
    }

    // Variant
    switch (variant) {
      case 'primary':
        return {
          ...base,
          backgroundColor: THEME.colors.primary,
          shadowColor: THEME.colors.primary,
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.25,
          shadowRadius: 6,
          elevation: 3,
        };
      case 'gold':
        return {
          ...base,
          backgroundColor: THEME.colors.goldLight,
          shadowColor: THEME.colors.gold,
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.2,
          shadowRadius: 6,
          elevation: 3,
        };
      case 'secondary':
        return {
          ...base,
          backgroundColor: THEME.colors.surfaceSubtle,
          borderWidth: 1,
          borderColor: THEME.colors.border,
        };
      case 'outline':
        return {
          ...base,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderColor: THEME.colors.primary,
        };
      case 'danger':
        return {
          ...base,
          backgroundColor: THEME.colors.danger,
        };
      case 'ghost':
        return {
          ...base,
          backgroundColor: 'transparent',
        };
    }
  };

  const getTextStyle = (): TextStyle => {
    const base: TextStyle = {
      fontWeight: '700',
      letterSpacing: 0.3,
    };

    switch (size) {
      case 'sm':
        base.fontSize = 13;
        break;
      case 'lg':
        base.fontSize = 16;
        break;
      case 'md':
      default:
        base.fontSize = 14;
        break;
    }

    switch (variant) {
      case 'primary':
      case 'gold':
      case 'danger':
        return { ...base, color: '#FFFFFF' };
      case 'outline':
        return { ...base, color: THEME.colors.primary };
      case 'ghost':
      case 'secondary':
      default:
        return { ...base, color: THEME.colors.textPrimary };
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      disabled={disabled || isLoading}
      style={[getContainerStyle(), style]}
    >
      {isLoading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' || variant === 'gold' || variant === 'danger' ? '#FFFFFF' : THEME.colors.textPrimary}
        />
      ) : (
        <>
          {leftIcon ? <>{leftIcon}</> : null}
          <Text
            style={[
              getTextStyle(),
              leftIcon ? { marginLeft: 8 } : undefined,
              rightIcon ? { marginRight: 8 } : undefined,
              textStyle,
            ]}
          >
            {title}
          </Text>
          {rightIcon ? <>{rightIcon}</> : null}
        </>
      )}
    </TouchableOpacity>
  );
};
