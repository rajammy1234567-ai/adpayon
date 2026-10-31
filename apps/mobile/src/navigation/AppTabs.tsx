import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  BottomTabBarProps,
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Wallet, Users, Sparkles, User } from 'lucide-react-native';
import { THEME } from '../constants/theme';
import { DashboardScreen } from '../screens/dashboard/DashboardScreen';
import { EarnHubScreen } from '../screens/earn/EarnHubScreen';
import { ProfileSettingsScreen } from '../screens/profile/ProfileSettingsScreen';
import { MyTeamScreen } from '../screens/team/MyTeamScreen';
import { WalletScreen } from '../screens/wallet/WalletScreen';
import { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

interface TabConfig {
  label: string;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
}

const TAB_CONFIG: Record<keyof MainTabParamList, TabConfig> = {
  Dashboard: {
    label: 'Home',
    Icon: Home,
  },
  Wallet: {
    label: 'Wallet',
    Icon: Wallet,
  },
  Team: {
    label: 'My Team',
    Icon: Users,
  },
  Earn: {
    label: 'Earn Hub',
    Icon: Sparkles,
  },
  Profile: {
    label: 'Profile',
    Icon: User,
  },
};

const FloatingTabBar: React.FC<BottomTabBarProps> = ({ state, descriptors, navigation }) => {
  const insets = useSafeAreaInsets();
  const bottomOffset = Math.max(insets.bottom, 12) + 8; // Raised by +8dp per layout specification

  return (
    <View
      style={[
        styles.floatingContainer,
        {
          bottom: bottomOffset,
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.tabBar}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const config = TAB_CONFIG[route.name as keyof MainTabParamList];
          const label = config?.label ?? route.name;
          const Icon = config?.Icon ?? Home;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          const activeColor = '#FFFFFF';
          const inactiveColor = 'rgba(255, 255, 255, 0.72)';

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={label}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.tabButton}
            >
              <View
                style={[
                  styles.iconContainer,
                  isFocused ? styles.iconContainerActive : null,
                ]}
              >
                <Icon
                  size={20}
                  color={isFocused ? activeColor : inactiveColor}
                  strokeWidth={isFocused ? 2.3 : 1.8}
                />
              </View>
              <Text
                numberOfLines={1}
                style={[
                  styles.tabLabel,
                  isFocused ? styles.tabLabelActive : styles.tabLabelInactive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

export const AppTabs: React.FC = () => {
  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Wallet" component={WalletScreen} />
      <Tab.Screen name="Team" component={MyTeamScreen} />
      <Tab.Screen name="Earn" component={EarnHubScreen} />
      <Tab.Screen name="Profile" component={ProfileSettingsScreen} />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  floatingContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 100,
  },
  tabBar: {
    flexDirection: 'row',
    width: '100%',
    height: 64,
    backgroundColor: THEME.colors.primary, // Solid red rounded pill
    borderRadius: 32,
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  tabButton: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  iconContainer: {
    width: 42,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainerActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)', // Lighter active-tab highlight on solid red
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 2,
    letterSpacing: 0.1,
  },
  tabLabelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  tabLabelInactive: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontWeight: '500',
  },
});
