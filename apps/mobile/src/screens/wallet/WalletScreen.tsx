import React, { useState, useEffect } from 'react';
import {
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Building,
  Coins,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Clock,
  CheckCircle2,
  XCircle,
  Sparkles,
  Info,
} from 'lucide-react-native';
import { LedgerTransactionItem, SourceCategory } from '@adpayon/shared';
import { EmptyState } from '../../components/feedback/EmptyState';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Header } from '../../components/ui/Header';
import { Modal } from '../../components/ui/Modal';
import { THEME } from '../../constants/theme';
import { useBottomTabSpacing } from '../../hooks/useBottomTabSpacing';
import { RootStackParamList } from '../../navigation/types';
import { useAuthStore } from '../../store/authStore';
import { useWalletStore } from '../../store/walletStore';
import { useDemoStore } from '../../store/demoStore';
import { submitWithdrawalApi } from '../../services/api/wallet.api';

const FILTERS: { key: SourceCategory; label: string }[] = [
  { key: 'ALL', label: 'All Activity' },
  { key: 'WITHDRAWAL', label: 'Payouts' },
  { key: 'CHALLENGES', label: 'Tasks & Offers' },
  { key: 'REFERRALS', label: 'Commissions' },
];

export const WalletScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuthStore();
  const {
    availablePoints,
    availableUsd,
    reservedPoints,
    reservedUsd,
    totalEarnedPoints,
    totalEarnedUsd,
    totalWithdrawnPoints,
    totalWithdrawnUsd,
    transactions,
    filter,
    setFilter,
    fetchSummary,
    fetchTransactions,
    error: walletError,
    isLoading: isWalletLoading,
  } = useWalletStore();

  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  const bottomSpacing = useBottomTabSpacing();

  // Payout Modal State
  const [isWithdrawModalVisible, setIsWithdrawModalVisible] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState<'BANK_ACCOUNT' | 'USDT_WALLET'>('BANK_ACCOUNT');
  const [pointsInput, setPointsInput] = useState('5000');
  const [accountPassword, setAccountPassword] = useState('');

  // Bank Form State
  const [accountHolderName, setAccountHolderName] = useState(user?.name || '');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [bankName, setBankName] = useState('');

  // USDT Form State
  const [usdtAddress, setUsdtAddress] = useState('');

  const [withdrawError, setWithdrawError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchSummary();
    fetchTransactions();
  }, [fetchSummary, fetchTransactions]);

  const parsedPoints = parseInt(pointsInput, 10) || 0;
  const isCentOnly = payoutMethod === 'BANK_ACCOUNT';
  const effectivePoints = isCentOnly ? Math.floor(parsedPoints / 10) * 10 : parsedPoints;
  const remainderPoints = isCentOnly ? parsedPoints % 10 : 0;
  const estimatedUsd = isCentOnly
    ? (effectivePoints * 0.001).toFixed(2)
    : (parsedPoints * 0.001).toFixed(3);
  const remainderUsd = (remainderPoints * 0.001).toFixed(3);

  const isKycVerified = Boolean(
    user?.isKycVerified || (user as any)?.metadata?.kycStatus === 'VERIFIED'
  );

  const handleOpenWithdraw = () => {
    if (isDemoMode) {
      Alert.alert(
        'Demo Mode (Sample Data)',
        'Payouts and real balance mutations are disabled in demonstration mode.'
      );
      return;
    }
    if (!isKycVerified) {
      Alert.alert(
        'KYC Verification Required',
        'Compliance regulations require verified KYC before submitting a payout request.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Verify KYC Now', onPress: () => navigation.navigate('KycUpload') },
        ]
      );
      return;
    }
    setWithdrawError('');
    setPointsInput('5000');
    setAccountPassword('');
    setIsWithdrawModalVisible(true);
  };

  const handleConfirmWithdrawal = async () => {
    const pointsToRedeem = effectivePoints;
    if (pointsToRedeem < 1000) {
      setWithdrawError('Minimum withdrawal is 1,000 points ($1.00 USD).');
      return;
    }
    if (pointsToRedeem > availablePoints) {
      setWithdrawError(
        `Insufficient balance. You have ${availablePoints.toLocaleString()} points available.`
      );
      return;
    }
    if (!accountPassword.trim()) {
      setWithdrawError('Enter your ADPAYON account password to authorize payout.');
      return;
    }

    if (payoutMethod === 'BANK_ACCOUNT') {
      if (!accountHolderName.trim() || accountHolderName.trim().length < 2) {
        setWithdrawError('Enter the valid beneficiary account holder name.');
        return;
      }
      if (!accountNumber.trim() || accountNumber.trim().length < 6) {
        setWithdrawError('Enter a valid bank account number (min 6 digits).');
        return;
      }
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode.trim().toUpperCase())) {
        setWithdrawError('Enter a valid 11-character IFSC code (e.g. SBIN0001234).');
        return;
      }
    } else {
      if (!/^0x[a-fA-F0-9]{40}$/.test(usdtAddress.trim())) {
        setWithdrawError('Enter a valid BEP20 USDT wallet address starting with 0x (40 hex chars).');
        return;
      }
    }

    setIsSubmitting(true);
    setWithdrawError('');

    try {
      await submitWithdrawalApi({
        pointsAmount: pointsToRedeem,
        payoutMode: payoutMethod,
        accountPassword: accountPassword.trim(),
        currency: 'USD',
        beneficiaryDetails:
          payoutMethod === 'BANK_ACCOUNT'
            ? {
                accountHolderName: accountHolderName.trim(),
                accountNumber: accountNumber.trim(),
                ifscCode: ifscCode.trim().toUpperCase(),
                bankName: bankName.trim() || undefined,
              }
            : {
                network: 'BEP20',
                usdtAddress: usdtAddress.trim(),
              },
      });

      await Promise.all([fetchSummary(), fetchTransactions()]);
      setIsWithdrawModalVisible(false);
      setAccountPassword('');
      Alert.alert(
        'Payout Requested Successfully',
        `Your request for ${pointsToRedeem.toLocaleString()} PTS ($${estimatedUsd} USD) via ${
          payoutMethod === 'BANK_ACCOUNT' ? 'Bank Transfer' : 'USDT (BEP20)'
        } is under review. The funds are held safely in reservation.${
          remainderPoints > 0
            ? `\n\nNotice: ${remainderPoints} points ($${remainderUsd} USD) remain available in your wallet balance.`
            : ''
        }`
      );
    } catch (err: any) {
      setWithdrawError(err.message || 'Payout request failed. Please check your password and retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredTransactions = transactions.filter((tx) => {
    if (filter === 'ALL') return true;
    return tx.sourceCategory === filter;
  });

  const renderTransactionItem = ({ item }: { item: LedgerTransactionItem }) => {
    const isCredit = item.type !== 'WITHDRAWAL_REQUEST' && item.type !== 'WITHDRAWAL_PAYOUT';
    const isRejected = item.status === 'REJECTED';
    const isPending = item.status === 'PENDING';
    const pts = item.displayPoints || Math.floor(item.amountPaise / 10);
    const usd = (pts * 0.001).toFixed(2);

    return (
      <Card variant="default" style={styles.txCard}>
        <View style={styles.txRow}>
          <View
            style={[
              styles.txIconBox,
              isRejected
                ? styles.txRejectedIcon
                : isCredit
                ? styles.txCreditIcon
                : styles.txDebitIcon,
            ]}
          >
            {isRejected ? (
              <XCircle size={18} color="#EF4444" />
            ) : isPending ? (
              <Clock size={18} color="#D97706" />
            ) : isCredit ? (
              <ArrowDownLeft size={18} color={THEME.colors.emerald} />
            ) : (
              <ArrowUpRight size={18} color={THEME.colors.primary} />
            )}
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
                label={
                  item.status === 'CREDITED'
                    ? 'PAID / CONFIRMED'
                    : item.status === 'PENDING'
                    ? 'UNDER REVIEW'
                    : 'REJECTED'
                }
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
                isRejected
                  ? styles.txAmountRejected
                  : isCredit
                  ? styles.txAmountCredit
                  : styles.txAmountDebit,
              ]}
            >
              {isCredit ? '+' : '-'}{pts.toLocaleString()} pts
            </Text>
            <Text style={styles.txAmountUsd}>
              {isCredit ? '+' : '-'}${usd} USD
            </Text>
          </View>
        </View>
      </Card>
    );
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <Header
        title="Wallet & Payouts"
        subtitle="Authoritative balance • 1,000 pts = $1.00 USD"
      />

      <View style={styles.body}>
        {!!walletError && (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => {
              fetchSummary();
              fetchTransactions();
            }}
          >
            <Text style={styles.errorBanner}>{walletError} · Tap to retry</Text>
          </TouchableOpacity>
        )}

        {/* Master Balance Card */}
        <Card variant="elevated" style={styles.masterCard}>
          <View style={styles.masterHeader}>
            <View>
              <Text style={styles.balanceLabel}>Available Balance</Text>
              <View style={styles.ptsRow}>
                <Text style={styles.ptsMain}>{availablePoints.toLocaleString()}</Text>
                <Text style={styles.ptsUnit}>PTS</Text>
              </View>
              <Text style={styles.usdEquivalent}>≈ ${availableUsd.toFixed(2)} USD</Text>
            </View>
            <View style={styles.conversionBadge}>
              <Sparkles size={14} color="#FBBF24" />
              <Text style={styles.conversionText}>1,000 pts = $1.00</Text>
            </View>
          </View>

          {/* Breakdown Grid */}
          <View style={styles.breakdownGrid}>
            <View style={styles.breakdownCol}>
              <Text style={styles.breakdownLabel}>On Hold / Reserved</Text>
              <Text style={styles.breakdownValue}>{reservedPoints.toLocaleString()} pts</Text>
              <Text style={styles.breakdownSub}>${reservedUsd.toFixed(2)} USD</Text>
            </View>
            <View style={styles.breakdownCol}>
              <Text style={styles.breakdownLabel}>Lifetime Earned</Text>
              <Text style={styles.breakdownValue}>{totalEarnedPoints.toLocaleString()} pts</Text>
              <Text style={styles.breakdownSub}>${totalEarnedUsd.toFixed(2)} USD</Text>
            </View>
            <View style={styles.breakdownCol}>
              <Text style={styles.breakdownLabel}>Total Withdrawn</Text>
              <Text style={styles.breakdownValue}>{totalWithdrawnPoints.toLocaleString()} pts</Text>
              <Text style={styles.breakdownSub}>${totalWithdrawnUsd.toFixed(2)} USD</Text>
            </View>
          </View>

          {/* Action Row */}
          <View style={styles.actionRow}>
            <Button
              title="Request Payout / Withdraw"
              onPress={handleOpenWithdraw}
              variant="primary"
              size="md"
              style={styles.withdrawBtn}
              textStyle={{ color: THEME.colors.primary, fontWeight: '800' }}
            />
          </View>
        </Card>

        {/* KYC Compliance Status Card */}
        <View style={[styles.kycBanner, isKycVerified ? styles.kycVerified : styles.kycPending]}>
          {isKycVerified ? (
            <>
              <ShieldCheck size={20} color={THEME.colors.emerald} />
              <View style={{ flex: 1 }}>
                <Text style={styles.kycTitle}>KYC Verified</Text>
                <Text style={styles.kycSub}>Your account is compliant for Bank & USDT payouts.</Text>
              </View>
            </>
          ) : (
            <>
              <ShieldAlert size={20} color="#D97706" />
              <View style={{ flex: 1 }}>
                <Text style={styles.kycTitle}>KYC Verification Required</Text>
                <Text style={styles.kycSub}>Complete compliance verification to unlock withdrawals.</Text>
              </View>
              <TouchableOpacity
                onPress={() => navigation.navigate('KycUpload')}
                style={styles.kycActionBtn}
              >
                <Text style={styles.kycActionText}>Verify</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Filter Navigation */}
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
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  onPress={() => setFilter(item.key)}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            }}
            contentContainerStyle={styles.filterList}
          />
        </View>

        {/* Transaction Stream */}
        <FlatList
          data={filteredTransactions}
          keyExtractor={(item) => item.id}
          renderItem={renderTransactionItem}
          contentContainerStyle={[styles.txList, { paddingBottom: bottomSpacing }]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="👛"
              title="No Wallet Transactions"
              description="Complete Task Hub offers and Earn Hub tasks to accumulate verified reward points."
            />
          }
        />
      </View>

      {/* Payout Withdrawal Modal */}
      <Modal
        visible={isWithdrawModalVisible}
        onClose={() => {
          if (!isSubmitting) setIsWithdrawModalVisible(false);
        }}
        title="Request Payout"
      >
        <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.modalHeaderInfo}>
            <Text style={styles.modalBalanceLabel}>Available for Payout</Text>
            <Text style={styles.modalBalancePts}>
              {availablePoints.toLocaleString()} PTS (${availableUsd.toFixed(2)} USD)
            </Text>
          </View>

          {/* Payout Method Selector */}
          <Text style={styles.inputSectionTitle}>Choose Payout Method</Text>
          <View style={styles.methodSelectorRow}>
            <TouchableOpacity
              onPress={() => setPayoutMethod('BANK_ACCOUNT')}
              style={[
                styles.methodOption,
                payoutMethod === 'BANK_ACCOUNT' && styles.methodOptionActive,
              ]}
            >
              <Building
                size={20}
                color={payoutMethod === 'BANK_ACCOUNT' ? THEME.colors.primary : THEME.colors.textSecondary}
              />
              <Text
                style={[
                  styles.methodOptionText,
                  payoutMethod === 'BANK_ACCOUNT' && styles.methodOptionTextActive,
                ]}
              >
                Bank Account
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setPayoutMethod('USDT_WALLET')}
              style={[
                styles.methodOption,
                payoutMethod === 'USDT_WALLET' && styles.methodOptionActive,
              ]}
            >
              <Coins
                size={20}
                color={payoutMethod === 'USDT_WALLET' ? THEME.colors.primary : THEME.colors.textSecondary}
              />
              <Text
                style={[
                  styles.methodOptionText,
                  payoutMethod === 'USDT_WALLET' && styles.methodOptionTextActive,
                ]}
              >
                USDT Wallet (BEP20)
              </Text>
            </TouchableOpacity>
          </View>

          {/* Form Fields by Method */}
          {payoutMethod === 'BANK_ACCOUNT' ? (
            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Account Holder Name</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Full name as registered with bank"
                value={accountHolderName}
                onChangeText={setAccountHolderName}
              />

              <Text style={styles.fieldLabel}>Bank Account Number</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. 0123456789"
                keyboardType="numeric"
                value={accountNumber}
                onChangeText={setAccountNumber}
              />

              <Text style={styles.fieldLabel}>IFSC Code</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. SBIN0001234"
                autoCapitalize="characters"
                value={ifscCode}
                onChangeText={(t) => setIfscCode(t.toUpperCase())}
              />

              <Text style={styles.fieldLabel}>Bank Name (Optional)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. State Bank of India"
                value={bankName}
                onChangeText={setBankName}
              />
            </View>
          ) : (
            <View style={styles.formGroup}>
              <View style={styles.networkBadgeRow}>
                <Text style={styles.fieldLabel}>Supported Network</Text>
                <Badge label="BEP20 (BNB Chain)" variant="active" />
              </View>

              <Text style={styles.fieldLabel}>USDT Wallet Address (BEP20)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="0x..."
                autoCapitalize="none"
                autoCorrect={false}
                value={usdtAddress}
                onChangeText={setUsdtAddress}
              />
              <Text style={styles.fieldHelper}>
                Ensure the address is on BEP20 (BNB Smart Chain). Payouts sent to wrong networks cannot be recovered.
              </Text>
            </View>
          )}

          {/* Points Amount & Quick Select */}
          <Text style={styles.inputSectionTitle}>Withdrawal Amount</Text>
          <TextInput
            style={[styles.textInput, styles.amountInput]}
            placeholder="1000"
            keyboardType="number-pad"
            value={pointsInput}
            onChangeText={setPointsInput}
          />

          <View style={styles.quickChipsRow}>
            {[
              { pts: 1000, label: '1,000 pts ($1)' },
              { pts: 5000, label: '5,000 pts ($5)' },
              { pts: 10000, label: '10,000 pts ($10)' },
              { pts: availablePoints, label: 'Max All' },
            ].map((chip) => (
              <TouchableOpacity
                key={chip.label}
                onPress={() => setPointsInput(String(chip.pts))}
                style={styles.chipBtn}
              >
                <Text style={styles.chipText}>{chip.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Real-time Payout Breakdown Preview */}
          <View style={styles.previewBox}>
            <View style={styles.previewRow}>
              <Text style={styles.previewKey}>Conversion Rate</Text>
              <Text style={styles.previewVal}>1,000 pts = $1.00 USD (1 pt = $0.001)</Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewKey}>Payout Amount</Text>
              <Text style={styles.previewVal}>
                {effectivePoints.toLocaleString()} PTS (${estimatedUsd} USD)
              </Text>
            </View>
            {isCentOnly && remainderPoints > 0 && (
              <View style={[styles.previewRow, { backgroundColor: '#FEF3C7', padding: 8, borderRadius: 6, marginVertical: 4 }]}>
                <Text style={[styles.previewKey, { color: '#92400E', fontWeight: '600' }]}>
                  Cent-Only Remainder:
                </Text>
                <Text style={[styles.previewVal, { color: '#92400E', fontWeight: 'bold' }]}>
                  {remainderPoints} pts (${remainderUsd}) stays in wallet
                </Text>
              </View>
            )}
            <View style={styles.previewRow}>
              <Text style={styles.previewKey}>Platform Fee</Text>
              <Text style={[styles.previewVal, { color: THEME.colors.emerald }]}>$0.00 (Zero Fee)</Text>
            </View>
            <View style={[styles.previewRow, styles.previewTotalRow]}>
              <Text style={styles.previewTotalKey}>Net Payout Delivery</Text>
              <Text style={styles.previewTotalVal}>${estimatedUsd} {payoutMethod === 'USDT_WALLET' ? 'USDT' : 'USD'}</Text>
            </View>
          </View>

          {/* ADPAYON Account Password Confirmation */}
          <View style={styles.securityBox}>
            <View style={styles.securityTitleRow}>
              <Lock size={16} color={THEME.colors.primary} />
              <Text style={styles.securityTitle}>Confirm ADPAYON Account Password</Text>
            </View>
            <Text style={styles.securityDisclaimer}>
              Enter your ADPAYON login password to authorize this withdrawal. We will never ask for your bank PIN, seed phrase, or wallet private keys.
            </Text>
            <TextInput
              style={styles.passwordInput}
              placeholder="ADPAYON Login Password"
              secureTextEntry
              value={accountPassword}
              onChangeText={setAccountPassword}
            />
          </View>

          {withdrawError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{withdrawError}</Text>
            </View>
          ) : null}

          <View style={styles.modalActions}>
            <Button
              title="Cancel"
              variant="secondary"
              onPress={() => setIsWithdrawModalVisible(false)}
              disabled={isSubmitting}
              style={{ flex: 1 }}
            />
            <Button
              title={isSubmitting ? 'Verifying...' : 'Authorize Payout'}
              variant="primary"
              onPress={handleConfirmWithdrawal}
              isLoading={isSubmitting}
              disabled={isSubmitting || effectivePoints < 1000 || !accountPassword.trim()}
              style={{ flex: 1.5 }}
            />
          </View>
        </ScrollView>
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
    paddingHorizontal: 16,
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    color: THEME.colors.danger,
    padding: 10,
    borderRadius: 8,
    fontSize: 12,
    marginBottom: 8,
  },
  masterCard: {
    padding: 20,
    borderRadius: 20,
    backgroundColor: THEME.colors.primary,
    marginBottom: 12,
  },
  masterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  balanceLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FEE2E2',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  ptsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 4,
  },
  ptsMain: {
    fontSize: 32,
    fontWeight: '900',
    color: 'white',
  },
  ptsUnit: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FCA5A5',
  },
  usdEquivalent: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FEF08A',
    marginTop: 2,
  },
  conversionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  conversionText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'white',
  },
  breakdownGrid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
    paddingTop: 14,
    marginTop: 16,
    gap: 10,
  },
  breakdownCol: {
    flex: 1,
  },
  breakdownLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FEE2E2',
  },
  breakdownValue: {
    fontSize: 13,
    fontWeight: '700',
    color: 'white',
    marginTop: 3,
  },
  breakdownSub: {
    fontSize: 10,
    color: '#FEF08A',
    marginTop: 1,
  },
  actionRow: {
    marginTop: 16,
  },
  withdrawBtn: {
    backgroundColor: 'white',
  },
  kycBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
  },
  kycVerified: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  kycPending: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  kycTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  kycSub: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 1,
  },
  kycActionBtn: {
    backgroundColor: THEME.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  kycActionText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 11,
  },
  filterContainer: {
    marginBottom: 8,
  },
  filterList: {
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: THEME.colors.surface,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  filterChipActive: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
  },
  filterChipTextActive: {
    color: 'white',
  },
  txList: {
    gap: 10,
  },
  txCard: {
    padding: 14,
    borderRadius: 14,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  txIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  txCreditIcon: {
    backgroundColor: '#ECFDF5',
  },
  txDebitIcon: {
    backgroundColor: '#FEF2F2',
  },
  txRejectedIcon: {
    backgroundColor: '#FEE2E2',
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
    gap: 8,
    marginTop: 4,
  },
  txDate: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
  },
  txBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  txAmountCol: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 14,
    fontWeight: '800',
  },
  txAmountCredit: {
    color: THEME.colors.emerald,
  },
  txAmountDebit: {
    color: THEME.colors.primary,
  },
  txAmountRejected: {
    color: '#EF4444',
    textDecorationLine: 'line-through',
  },
  txAmountUsd: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  modalScroll: {
    maxHeight: 520,
  },
  modalHeaderInfo: {
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 14,
  },
  modalBalanceLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: THEME.colors.primary,
    textTransform: 'uppercase',
  },
  modalBalancePts: {
    fontSize: 17,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginTop: 2,
  },
  inputSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginBottom: 8,
    marginTop: 6,
  },
  methodSelectorRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  methodOption: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    gap: 6,
  },
  methodOptionActive: {
    borderColor: THEME.colors.primary,
    backgroundColor: '#FEF2F2',
  },
  methodOptionText: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
  },
  methodOptionTextActive: {
    color: THEME.colors.primary,
    fontWeight: '700',
  },
  formGroup: {
    gap: 6,
    marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
    marginTop: 4,
  },
  fieldHelper: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    lineHeight: 16,
  },
  networkBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  textInput: {
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    color: THEME.colors.textPrimary,
    backgroundColor: 'white',
  },
  amountInput: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.colors.primary,
  },
  quickChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    marginBottom: 12,
  },
  chipBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
  },
  previewBox: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    gap: 6,
    marginBottom: 12,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  previewKey: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
  },
  previewVal: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
  },
  previewTotalRow: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 6,
    marginTop: 2,
  },
  previewTotalKey: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  previewTotalVal: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.primary,
  },
  securityBox: {
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 6,
    marginBottom: 12,
  },
  securityTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  securityTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  securityDisclaimer: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    lineHeight: 16,
  },
  passwordInput: {
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    backgroundColor: 'white',
    color: THEME.colors.textPrimary,
    marginTop: 4,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  errorText: {
    color: THEME.colors.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 8,
  },
});

export default WalletScreen;
