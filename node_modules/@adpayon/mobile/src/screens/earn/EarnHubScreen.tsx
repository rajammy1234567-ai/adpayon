import React, { useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { formatPaiseToRupees } from '@adpayon/shared';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { Header } from '../../components/ui/Header';
import { THEME } from '../../constants/theme';
import { RootStackParamList } from '../../navigation/types';
import { useWalletStore } from '../../store/walletStore';

export const EarnHubScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { claimReward } = useWalletStore();

  const [activeTimerTask, setActiveTimerTask] = useState<string | null>(null);

  const handleSimulateWatchVideo = () => {
    Alert.alert('Watching Video Ad', 'Playing 30-second sponsored video...', [
      {
        text: 'Finish & Claim ₹1.50',
        onPress: () => {
          claimReward(150, 'ADS', 'Rewarded Video Ad Impression');
          Alert.alert('Reward Credited', '₹1.50 (150 paise) added to your spendable ledger!');
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleSimulateNewsRead = () => {
    setActiveTimerTask('news');
    Alert.alert(
      'Reading Tech News',
      'Article: "Digital Rupee & Web3 Network Expansion in India". Timer active for 15s.',
      [
        {
          text: 'Claim ₹2.00 Reward',
          onPress: () => {
            setActiveTimerTask(null);
            claimReward(200, 'ADS', 'News Reading Engagement Reward');
            Alert.alert('Success', '₹2.00 (200 paise) credited to wallet!');
          },
        },
      ]
    );
  };

  const handleSimulateMiniGame = () => {
    Alert.alert('Mini-Game: Coin Dash', 'Score: 1,420 pts! Milestone reached!', [
      {
        text: 'Claim ₹5.00 Prize',
        onPress: () => {
          claimReward(500, 'ENGAGEMENT', 'Mini-Game Achievement: Coin Dash High Score');
          Alert.alert('Reward Credited', '₹5.00 (500 paise) added to your ledger balance!');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title={t('earnHub.title')}
        subtitle="6 High-Payout Earning Streams Available Daily"
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Hub Banner */}
        <Card variant="gold" style={styles.hubBanner}>
          <View style={styles.hubBannerRow}>
            <Text style={styles.hubBannerEmoji}>🚀</Text>
            <View style={styles.hubBannerCol}>
              <Text style={styles.hubBannerTitle}>Maximum Payout Hub</Text>
              <Text style={styles.hubBannerDesc}>
                Complete tasks across any of our 6 networks to earn daily cash and generate
                team binary points.
              </Text>
            </View>
          </View>
        </Card>

        {/* 1. OfferWall */}
        <Card variant="default" style={styles.streamCard}>
          <View style={styles.streamRow}>
            <View style={[styles.streamIconBox, { backgroundColor: THEME.colors.emeraldGlow }]}>
              <Text style={styles.streamEmoji}>🏢</Text>
            </View>
            <View style={styles.streamInfo}>
              <View style={styles.streamTitleRow}>
                <Text style={styles.streamTitle}>{t('earnHub.offerwall')}</Text>
                <Badge label="Highest Payout" variant="gold" />
              </View>
              <Text style={styles.streamDesc}>
                Install verified partner banking & fintech apps, surveys, and demat accounts.
              </Text>
              <Text style={styles.payoutText}>Earn ₹25.00 - ₹250.00 / offer</Text>
            </View>
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => navigation.navigate('OnboardingChallenges')}
            style={styles.actionBtn}
          >
            <Text style={styles.actionBtnText}>Explore 14 Active Offers →</Text>
          </TouchableOpacity>
        </Card>

        {/* 2. AdJunction */}
        <Card variant="default" style={styles.streamCard}>
          <View style={styles.streamRow}>
            <View style={[styles.streamIconBox, { backgroundColor: THEME.colors.cyanGlow }]}>
              <Text style={styles.streamEmoji}>⚡</Text>
            </View>
            <View style={styles.streamInfo}>
              <View style={styles.streamTitleRow}>
                <Text style={styles.streamTitle}>{t('earnHub.adjunction')}</Text>
                <Badge label="Instant" variant="cyan" />
              </View>
              <Text style={styles.streamDesc}>
                View quick sponsored promotional cards and micro-banners.
              </Text>
              <Text style={styles.payoutText}>Earn ₹0.50 - ₹2.00 / impression</Text>
            </View>
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              claimReward(75, 'ADS', 'AdJunction Impression Reward');
              Alert.alert('Impression Verified', '₹0.75 credited to wallet!');
            }}
            style={styles.actionBtn}
          >
            <Text style={styles.actionBtnText}>View Next Ad Banner (+₹0.75) →</Text>
          </TouchableOpacity>
        </Card>

        {/* 3. Video Wall */}
        <Card variant="default" style={styles.streamCard}>
          <View style={styles.streamRow}>
            <View style={[styles.streamIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
              <Text style={styles.streamEmoji}>🎬</Text>
            </View>
            <View style={styles.streamInfo}>
              <View style={styles.streamTitleRow}>
                <Text style={styles.streamTitle}>{t('earnHub.videoWall')}</Text>
                <Badge label="Unlimited" variant="active" />
              </View>
              <Text style={styles.streamDesc}>
                Watch 30-second HD brand trailers and game promos.
              </Text>
              <Text style={styles.payoutText}>Earn ₹1.50 per completed stream</Text>
            </View>
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleSimulateWatchVideo}
            style={styles.actionBtn}
          >
            <Text style={styles.actionBtnText}>Watch 30s Video (+₹1.50) →</Text>
          </TouchableOpacity>
        </Card>

        {/* 4. News Reading */}
        <Card variant="default" style={styles.streamCard}>
          <View style={styles.streamRow}>
            <View style={[styles.streamIconBox, { backgroundColor: 'rgba(168, 85, 247, 0.15)' }]}>
              <Text style={styles.streamEmoji}>📰</Text>
            </View>
            <View style={styles.streamInfo}>
              <View style={styles.streamTitleRow}>
                <Text style={styles.streamTitle}>{t('earnHub.news')}</Text>
                <Badge label="Daily Cap ₹20" variant="neutral" />
              </View>
              <Text style={styles.streamDesc}>
                Read breaking business, tech, and financial news for 60 seconds.
              </Text>
              <Text style={styles.payoutText}>Earn ₹2.00 per verified article</Text>
            </View>
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleSimulateNewsRead}
            style={styles.actionBtn}
          >
            <Text style={styles.actionBtnText}>Read Today's Top Story (+₹2.00) →</Text>
          </TouchableOpacity>
        </Card>

        {/* 5. Blogging & Community */}
        <Card variant="default" style={styles.streamCard}>
          <View style={styles.streamRow}>
            <View style={[styles.streamIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
              <Text style={styles.streamEmoji}>✍️</Text>
            </View>
            <View style={styles.streamInfo}>
              <View style={styles.streamTitleRow}>
                <Text style={styles.streamTitle}>{t('earnHub.blogging')}</Text>
                <Badge label="Creators" variant="gold" />
              </View>
              <Text style={styles.streamDesc}>
                Publish network-marketing tips or engage with community discussions.
              </Text>
              <Text style={styles.payoutText}>Earn ₹5.00 - ₹20.00 / published post</Text>
            </View>
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => Alert.alert('Blogging Community', 'Community blog editor opens. Draft submitted for moderation!')}
            style={styles.actionBtn}
          >
            <Text style={styles.actionBtnText}>Write Article / View Community →</Text>
          </TouchableOpacity>
        </Card>

        {/* 6. Mini-Games */}
        <Card variant="default" style={styles.streamCard}>
          <View style={styles.streamRow}>
            <View style={[styles.streamIconBox, { backgroundColor: THEME.colors.emeraldGlow }]}>
              <Text style={styles.streamEmoji}>🎮</Text>
            </View>
            <View style={styles.streamInfo}>
              <View style={styles.streamTitleRow}>
                <Text style={styles.streamTitle}>{t('earnHub.games')}</Text>
                <Badge label="Fun Earning" variant="cyan" />
              </View>
              <Text style={styles.streamDesc}>
                Play browser arcade puzzles, spin wheels, and endless runners.
              </Text>
              <Text style={styles.payoutText}>Earn ₹3.00 - ₹10.00 / achievement</Text>
            </View>
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleSimulateMiniGame}
            style={styles.actionBtn}
          >
            <Text style={styles.actionBtnText}>Launch Arcade (+₹5.00 Prize) →</Text>
          </TouchableOpacity>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  scroll: {
    padding: THEME.spacing.lg,
    paddingBottom: 40,
  },
  hubBanner: {
    padding: THEME.spacing.md,
    marginBottom: 20,
  },
  hubBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hubBannerEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  hubBannerCol: {
    flex: 1,
  },
  hubBannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.goldLight,
  },
  hubBannerDesc: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  streamCard: {
    marginBottom: 14,
    padding: THEME.spacing.lg,
  },
  streamRow: {
    flexDirection: 'row',
  },
  streamIconBox: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  streamEmoji: {
    fontSize: 22,
  },
  streamInfo: {
    flex: 1,
  },
  streamTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  streamTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  streamDesc: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    lineHeight: 16,
  },
  payoutText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.emerald,
    marginTop: 6,
  },
  actionBtn: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.borderSubtle,
    alignItems: 'flex-end',
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.emerald,
  },
});
