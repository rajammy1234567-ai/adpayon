import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { THEME } from '../../constants/theme';
import { RootStackParamList } from '../../navigation/types';
import { useAuthStore } from '../../store/authStore';

type Props = NativeStackScreenProps<RootStackParamList, 'Splash'>;

export const SplashScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const { isAuthenticated, user, isInitialized, initializeAuth } = useAuthStore();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const hasNavigated = useRef(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 900,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        useNativeDriver: true,
      }),
    ]).start();

    // Trigger secure session rehydration from SecureStore
    initializeAuth();
  }, [fadeAnim, scaleAnim, initializeAuth]);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.content,
          { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
        ]}
      >
        <View style={styles.logoBadge}>
          <Text style={styles.logoSymbol}>⚡</Text>
        </View>
        <Text style={styles.appName}>{t('common.appName')}</Text>
        <Text style={styles.tagline}>{t('common.tagline')}</Text>

        <View style={styles.pillContainer}>
          <Text style={styles.pillText}>NETWORK MARKETING • FINTECH LEDGER</Text>
        </View>
      </Animated.View>

      <View style={styles.footer}>
        <ActivityIndicator size="small" color={THEME.colors.emerald} />
        <Text style={styles.versionText}>Production v1.0.0 • Secure Enclave</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: THEME.spacing.xl,
  },
  content: {
    alignItems: 'center',
  },
  logoBadge: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: THEME.colors.surfaceSubtle,
    borderWidth: 2,
    borderColor: THEME.colors.emerald,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: THEME.colors.emerald,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
    marginBottom: 20,
  },
  logoSymbol: {
    fontSize: 44,
  },
  appName: {
    fontSize: 36,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
    letterSpacing: 1.5,
  },
  tagline: {
    fontSize: 14,
    color: THEME.colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
    maxWidth: 260,
  },
  pillContainer: {
    marginTop: 24,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: THEME.colors.emerald,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: THEME.borderRadius.full,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.emerald,
    letterSpacing: 1,
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    alignItems: 'center',
  },
  versionText: {
    color: THEME.colors.textMuted,
    fontSize: 12,
    marginTop: 10,
  },
});
