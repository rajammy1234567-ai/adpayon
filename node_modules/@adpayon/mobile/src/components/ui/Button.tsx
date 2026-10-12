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
          backgroundColor: THEME.colors.emerald,
          shadowColor: THEME.colors.emerald,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 4,
        };
      case 'gold':
        return {
          ...base,
          backgroundColor: THEME.colors.gold,
          shadowColor: THEME.colors.gold,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 4,
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
          borderColor: THEME.colors.emerald,
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
        return { ...base, color: '#000000' };
      case 'outline':
        return { ...base, color: THEME.colors.emerald };
      case 'danger':
        return { ...base, color: '#FFFFFF' };
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
          color={variant === 'primary' || variant === 'gold' ? '#000000' : '#FFFFFF'}
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
