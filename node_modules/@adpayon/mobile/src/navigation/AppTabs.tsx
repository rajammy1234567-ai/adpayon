import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { THEME } from '../constants/theme';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { EarnHubScreen } from '../screens/earn/EarnHubScreen';
import { ProfileSettingsScreen } from '../screens/profile/ProfileSettingsScreen';
import { MyTeamScreen } from '../screens/team/MyTeamScreen';
import { WalletScreen } from '../screens/wallet/WalletScreen';
import { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

export const AppTabs: React.FC = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: THEME.colors.emerald,
        tabBarInactiveTintColor: THEME.colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.iconBox, focused ? styles.iconBoxActive : undefined]}>
              <Text style={{ fontSize: 18 }}>⚡</Text>
            </View>
          ),
        }}
      />

      <Tab.Screen
        name="Wallet"
        component={WalletScreen}
        options={{
          tabBarLabel: 'Wallet',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.iconBox, focused ? styles.iconBoxActive : undefined]}>
              <Text style={{ fontSize: 18 }}>💳</Text>
            </View>
          ),
        }}
      />

      <Tab.Screen
        name="Team"
        component={MyTeamScreen}
        options={{
          tabBarLabel: 'My Team',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.iconBox, focused ? styles.iconBoxActive : undefined]}>
              <Text style={{ fontSize: 18 }}>🌳</Text>
            </View>
          ),
        }}
      />

      <Tab.Screen
        name="Earn"
        component={EarnHubScreen}
        options={{
          tabBarLabel: 'Earn Hub',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.iconBox, focused ? styles.iconBoxActive : undefined]}>
              <Text style={{ fontSize: 18 }}>💎</Text>
            </View>
          ),
        }}
      />

      <Tab.Screen
        name="Profile"
        component={ProfileSettingsScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.iconBox, focused ? styles.iconBoxActive : undefined]}>
              <Text style={{ fontSize: 18 }}>👤</Text>
            </View>
          ),
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: THEME.colors.surface,
    borderTopColor: THEME.colors.borderSubtle,
    borderTopWidth: 1,
    height: 64,
    paddingBottom: 8,
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  iconBox: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  iconBoxActive: {
    backgroundColor: THEME.colors.emeraldGlow,
  },
});
