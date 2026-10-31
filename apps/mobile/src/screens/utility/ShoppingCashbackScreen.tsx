import React from 'react';
import {
  Alert,
  FlatList,

  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ShoppingStoreItem } from '@adpayon/shared';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Header } from '../../components/ui/Header';
import { THEME } from '../../constants/theme';
import { MOCK_SHOPPING_STORES } from '../../services/mockData';
import { useWalletStore } from '../../store/walletStore';

export const ShoppingCashbackScreen: React.FC = () => {
  const { t } = useTranslation();
  const { claimReward } = useWalletStore();

  const handleShopNow = (store: ShoppingStoreItem) => {
    Alert.alert(
      `Redirecting to ${store.name}`,
      `Affiliate tracking session activated with AdPayOn tag. Any purchase made will be credited back to your wallet ledger at ${store.cashbackRate}.`,
      [
        {
          text: 'Simulate Mock Purchase Cashback (+₹45.00)',
          onPress: () => {
            claimReward(4500, 'CHALLENGES', `Affiliate Cashback: ${store.name} Order #49281`);
            Alert.alert(
              'Cashback Tracked! 🛍️',
              '₹45.00 (4,500 paise) cashback credited directly to your spendable ledger!'
            );
          },
        },
        { text: 'Close', style: 'cancel' },
      ]
    );
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <Header
        title={t('utility.shoppingTitle')}
        subtitle="Earn guaranteed cashback on top Indian e-commerce brands"
      />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Banner */}
        <Card variant="gold" style={styles.bannerCard}>
          <View style={styles.bannerRow}>
            <Text style={styles.bannerEmoji}>🛍️</Text>
            <View style={styles.bannerCol}>
              <Text style={styles.bannerTitle}>Earn Extra on Every Purchase</Text>
              <Text style={styles.bannerDesc}>
                Shop through AdPayOn partner links to get real cash directly into your wallet.
              </Text>
            </View>
          </View>
        </Card>

        {/* How It Works Strip */}
        <Card variant="default" style={styles.howCard}>
          <Text style={styles.howTitle}>How Cashback Works</Text>
          <View style={styles.stepsRow}>
            <View style={styles.stepItem}>
              <Text style={styles.stepNum}>1</Text>
              <Text style={styles.stepText}>Click Store</Text>
            </View>
            <Text style={styles.stepArrow}>→</Text>
            <View style={styles.stepItem}>
              <Text style={styles.stepNum}>2</Text>
              <Text style={styles.stepText}>Shop Normally</Text>
            </View>
            <Text style={styles.stepArrow}>→</Text>
            <View style={styles.stepItem}>
              <Text style={styles.stepNum}>3</Text>
              <Text style={styles.stepText}>Get Cash</Text>
            </View>
          </View>
        </Card>

        {/* Partner Stores */}
        <Text style={styles.storesHeader}>Popular Retail Partners</Text>

        <View style={styles.storesGrid}>
          {MOCK_SHOPPING_STORES.map((store) => (
            <Card key={store.id} variant="default" style={styles.storeCard}>
              <View style={styles.storeHeader}>
                <View style={styles.storeIconBox}>
                  <Text style={styles.storeIconText}>🏬</Text>
                </View>
                {store.badge ? (
                  <Badge label={store.badge} variant="gold" />
                ) : null}
              </View>

              <Text style={styles.storeName}>{store.name}</Text>
              <Text style={styles.storeCategory}>{store.category}</Text>

              <View style={styles.ratePill}>
                <Text style={styles.rateText}>{store.cashbackRate}</Text>
              </View>

              <Button
                title={t('utility.shopNow')}
                onPress={() => handleShopNow(store)}
                variant="outline"
                size="sm"
                style={styles.shopBtn}
              />
            </Card>
          ))}
        </View>
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
  bannerCard: {
    padding: 14,
    marginBottom: 16,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bannerEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  bannerCol: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.goldLight,
  },
  bannerDesc: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  howCard: {
    padding: 14,
    marginBottom: 20,
  },
  howTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 10,
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepItem: {
    alignItems: 'center',
    flex: 1,
  },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: THEME.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: THEME.colors.emerald,
    color: THEME.colors.emerald,
    textAlign: 'center',
    lineHeight: 22,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 4,
  },
  stepText: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    fontWeight: '600',
  },
  stepArrow: {
    color: THEME.colors.textMuted,
    fontSize: 16,
    marginBottom: 16,
  },
  storesHeader: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 14,
  },
  storesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  storeCard: {
    width: '48%',
    padding: 12,
    justifyContent: 'space-between',
  },
  storeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  storeIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: THEME.colors.surfaceSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  storeIconText: {
    fontSize: 18,
  },
  storeName: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  storeCategory: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    marginTop: 2,
  },
  ratePill: {
    backgroundColor: THEME.colors.emeraldGlow,
    borderWidth: 1,
    borderColor: THEME.colors.emerald,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: THEME.borderRadius.sm,
    marginVertical: 10,
  },
  rateText: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.emerald,
    textAlign: 'center',
  },
  shopBtn: {
    width: '100%',
  },
});
