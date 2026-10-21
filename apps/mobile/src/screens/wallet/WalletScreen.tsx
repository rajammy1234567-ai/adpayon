import React, { useState } from 'react';
import {
  Alert,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import {
  formatPaiseToRupees,
  inrToPaise,
  LedgerTransactionItem,
  SourceCategory,
} from '@adpayon/shared';
import { EmptyState } from '../../components/feedback/EmptyState';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Header } from '../../components/ui/Header';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { THEME } from '../../constants/theme';
import { RootStackParamList } from '../../navigation/types';
import { useAuthStore } from '../../store/authStore';
import { useWalletStore } from '../../store/walletStore';
import { useDemoStore } from '../../store/demoStore';

const FILTERS: { key: SourceCategory; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'ADS', label: 'Ads' },
  { key: 'REFERRALS', label: 'Referrals' },
  { key: 'CHALLENGES', label: 'Challenges' },
  { key: 'WITHDRAWAL', label: 'Withdrawals' },
];

export const WalletScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuthStore();
  const { summary, transactions, filter, setFilter, recordWithdrawal } = useWalletStore();

  const [isWithdrawModalVisible, setIsWithdrawModalVisible] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [payoutMethod, setPayoutMethod] = useState<'UPI' | 'BANK_TRANSFER'>('UPI');
  const [upiId, setUpiId] = useState(user?.kycDetails?.upiIdMasked || 'vikram@okhdfcbank');
  const [withdrawError, setWithdrawError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredTransactions = transactions.filter((tx) => {
    if (filter === 'ALL') return true;
    return tx.sourceCategory === filter;
  });

  const isDemoMode = useDemoStore((s) => s.isDemoMode);

  const handleOpenWithdraw = () => {
    if (isDemoMode) {
      Alert.alert(
        'Demo Mode (Sample Data)',
        'Real withdrawals, payments, and financial write actions are disabled in client demo mode. Balance figures are mock values for demonstration purposes only.'
      );
      return;
    }
    if (!user?.isKycVerified) {
      Alert.alert(
        'KYC Required',
        'You must complete KYC verification before requesting withdrawals.',
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Verify KYC Now', onPress: () => navigation.navigate('KycUpload') },
        ]
      );
      return;
    }
    setWithdrawError('');
    setIsWithdrawModalVisible(true);
  };


  const handleConfirmWithdrawal = () => {
    const inr = parseFloat(withdrawAmount);
    if (isNaN(inr) || inr < 100) {
      setWithdrawError('Minimum withdrawal amount is ₹100.00 (10,000 paise)');
      return;
    }
    const paise = inrToPaise(inr);
    if (paise > summary.mainBalancePaise) {
      setWithdrawError('Insufficient main wallet balance');
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      recordWithdrawal(paise, payoutMethod);
      setIsSubmitting(false);
      setIsWithdrawModalVisible(false);
      setWithdrawAmount('');
      Alert.alert(
        'Withdrawal Submitted',
        `₹${inr.toFixed(2)} payout requested via ${payoutMethod}. Held in escrow until admin approval.`
      );
    }, 700);
  };

  const renderTransactionItem = ({ item }: { item: LedgerTransactionItem }) => {
    const isCredit = item.type !== 'WITHDRAWAL_REQUEST' && item.type !== 'WITHDRAWAL_PAYOUT';
    return (
      <Card variant="default" style={styles.txCard}>
        <View style={styles.txRow}>
          <View
            style={[
              styles.txIconBox,
              isCredit ? styles.txCreditIcon : styles.txDebitIcon,
            ]}
          >
            <Text style={styles.txIconText}>{isCredit ? '↙️' : '↗️'}</Text>
          </View>

          <View style={styles.txInfo}>
            <Text style={styles.txDesc} numberOfLines={1}>
              {item.description}
            </Text>
            <View style={styles.txMetaRow}>
              <Text style={styles.txDate}>
                {new Date(item.createdAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
              <Badge
                label={item.status}
                variant={
                  item.status === 'CREDITED'
                    ? 'active'
                    : item.status === 'PENDING'
                    ? 'pending'
                    : 'rejected'
                }
                style={styles.txBadge}
              />
            </View>
          </View>

          <View style={styles.txAmountCol}>
            <Text
              style={[
                styles.txAmount,
                isCredit ? styles.txAmountCredit : styles.txAmountDebit,
              ]}
            >
              {isCredit ? '+' : '-'}
              {formatPaiseToRupees(item.amountPaise)}
            </Text>
          </View>
        </View>
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title={t('wallet.walletBalance')}
        subtitle={t('wallet.derivedNotice')}
      />

      <View style={styles.body}>
        {isDemoMode && (
          <View style={styles.demoWarningBox}>
            <Text style={styles.demoWarningTitle}>⚠️ DEMO MODE: SAMPLE LEDGER DATA</Text>
            <Text style={styles.demoWarningText}>
              Mock INR balances are not real funds. Real payment requests, claims, and bank transfers are disabled.
            </Text>
          </View>
        )}

        {/* Wallet Balance Card */}
        <Card variant="elevated" style={styles.balanceCard}>
          <View style={styles.balanceHeader}>
            <Text style={styles.balanceTitle}>Available Spendable Balance</Text>
            <Badge label="Append-Only Ledger" variant="cyan" />
          </View>

          <Text style={styles.balanceNumber}>
            {formatPaiseToRupees(summary.mainBalancePaise)}
          </Text>

          <View style={styles.escrowRow}>
            <Text style={styles.escrowText}>
              Held in Escrow: {formatPaiseToRupees(summary.escrowBalancePaise)}
            </Text>
            <Text style={styles.bonusText}>
              Bonus Pool: {formatPaiseToRupees(summary.bonusBalancePaise)}
            </Text>
          </View>

          <Button
            title="Request Instant Payout (₹)"
            onPress={handleOpenWithdraw}
            variant="primary"
            size="md"
            style={styles.withdrawBtn}
          />
        </Card>

        {/* Filter Tabs */}
        <View style={styles.filterContainer}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={FILTERS}
            keyExtractor={(item) => item.key}
            renderItem={({ item }) => {
              const active = filter === item.key;
              return (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setFilter(item.key)}
                  style={[
                    styles.filterPill,
                    active ? styles.filterPillActive : undefined,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterText,
                      active ? styles.filterTextActive : undefined,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>

        {/* Transaction History List */}
        <FlatList
          data={filteredTransactions}
          keyExtractor={(item) => item.id}
          renderItem={renderTransactionItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <EmptyState
              icon="💳"
              title="No Ledger Transactions"
              description="No ledger movements recorded under this category yet."
            />
          }
        />
      </View>

      {/* Withdrawal Request Modal */}
      <Modal
        visible={isWithdrawModalVisible}
        onClose={() => setIsWithdrawModalVisible(false)}
        title="Request Withdrawal"
      >
        <View style={styles.modalContent}>
          <Text style={styles.modalSub}>
            Funds will be transferred to your verified payment account.
          </Text>

          {/* Limits notice */}
          <Card variant="glass" style={styles.limitsCard}>
            <Text style={styles.limitsText}>
              • Min: ₹100.00 (10,000 paise) • Max daily: ₹10,000.00
            </Text>
            <Text style={styles.limitsText}>
              • Escrow held until processed by payment gateway
            </Text>
          </Card>

          {/* Method selector */}
          <View style={styles.methodRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setPayoutMethod('UPI')}
              style={[
                styles.methodBtn,
                payoutMethod === 'UPI' ? styles.methodBtnActive : undefined,
              ]}
            >
              <Text style={styles.methodText}>📱 UPI Transfer</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setPayoutMethod('BANK_TRANSFER')}
              style={[
                styles.methodBtn,
                payoutMethod === 'BANK_TRANSFER' ? styles.methodBtnActive : undefined,
              ]}
            >
              <Text style={styles.methodText}>🏦 Bank IMPS/NEFT</Text>
            </TouchableOpacity>
          </View>

          <Input
            label="Withdrawal Amount (₹)"
            placeholder="Min 100"
            keyboardType="numeric"
            value={withdrawAmount}
            onChangeText={(text) => {
              setWithdrawAmount(text);
              setWithdrawError('');
            }}
            error={withdrawError}
            leftIcon={<Text style={styles.inrPrefix}>₹</Text>}
          />

          {payoutMethod === 'UPI' ? (
            <Input
              label="UPI ID (VPA)"
              placeholder="e.g. yourname@okhdfcbank"
              value={upiId}
              onChangeText={setUpiId}
              editable={false}
              helperText="Verified KYC UPI VPA"
            />
          ) : (
            <Input
              label="Bank Account"
              placeholder="Account Number"
              value={user?.kycDetails?.bankAccountMasked || 'XXXXXXXX4521'}
              editable={false}
              helperText="Verified KYC Bank Account"
            />
          )}

          <Button
            title="Confirm & Deduct to Escrow"
            onPress={handleConfirmWithdrawal}
            variant="primary"
            size="lg"
            isLoading={isSubmitting}
            style={styles.confirmBtn}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  body: {
    flex: 1,
    padding: THEME.spacing.lg,
  },
  balanceCard: {
    padding: THEME.spacing.lg,
    marginBottom: 16,
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  balanceTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
    textTransform: 'uppercase',
  },
  balanceNumber: {
    fontSize: 34,
    fontWeight: '900',
    color: THEME.colors.emerald,
    letterSpacing: 0.5,
  },
  escrowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 14,
  },
  escrowText: {
    fontSize: 11,
    color: THEME.colors.textMuted,
  },
  bonusText: {
    fontSize: 11,
    color: THEME.colors.goldLight,
    fontWeight: '600',
  },
  withdrawBtn: {
    width: '100%',
  },
  filterContainer: {
    marginBottom: 12,
  },
  filterPill: {
    backgroundColor: THEME.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: THEME.borderRadius.full,
    marginRight: 8,
  },
  filterPillActive: {
    borderColor: THEME.colors.emerald,
    backgroundColor: THEME.colors.emeraldGlow,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  filterTextActive: {
    color: THEME.colors.emerald,
  },
  listContent: {
    paddingBottom: 24,
  },
  txCard: {
    marginBottom: 10,
    padding: THEME.spacing.md,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  txIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  txCreditIcon: {
    backgroundColor: THEME.colors.emeraldGlow,
    borderWidth: 1,
    borderColor: THEME.colors.emerald,
  },
  txDebitIcon: {
    backgroundColor: THEME.colors.dangerGlow,
    borderWidth: 1,
    borderColor: THEME.colors.danger,
  },
  txIconText: {
    fontSize: 18,
  },
  txInfo: {
    flex: 1,
  },
  txDesc: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  txMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  txDate: {
    fontSize: 11,
    color: THEME.colors.textMuted,
  },
  txBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  txAmountCol: {
    alignItems: 'flex-end',
    marginLeft: 10,
  },
  txAmount: {
    fontSize: 14,
    fontWeight: '800',
  },
  txAmountCredit: {
    color: THEME.colors.emerald,
  },
  txAmountDebit: {
    color: THEME.colors.danger,
  },
  modalContent: {
    width: '100%',
  },
  modalSub: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    marginBottom: 14,
  },
  limitsCard: {
    padding: 10,
    marginBottom: 16,
  },
  limitsText: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    marginVertical: 1,
  },
  methodRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  methodBtn: {
    flex: 1,
    backgroundColor: THEME.colors.surfaceSubtle,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    paddingVertical: 10,
    borderRadius: THEME.borderRadius.md,
    alignItems: 'center',
  },
  methodBtnActive: {
    borderColor: THEME.colors.emerald,
    backgroundColor: THEME.colors.emeraldGlow,
  },
  methodText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  inrPrefix: {
    color: THEME.colors.emerald,
    fontWeight: '800',
    fontSize: 16,
    marginRight: 4,
  },
  confirmBtn: {
    marginTop: 8,
  },
  demoWarningBox: {
    padding: 12,
    borderRadius: THEME.borderRadius.md,
    backgroundColor: 'rgba(234, 179, 8, 0.12)',
    borderWidth: 1,
    borderColor: THEME.colors.gold,
    marginBottom: 16,
  },
  demoWarningTitle: {
    color: THEME.colors.goldLight,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  demoWarningText: {
    color: THEME.colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
});

