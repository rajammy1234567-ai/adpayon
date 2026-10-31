import React, { useState } from 'react';
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
import { formatPaiseToRupees, RechargePlan } from '@adpayon/shared';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Header } from '../../components/ui/Header';
import { Input } from '../../components/ui/Input';
import { THEME } from '../../constants/theme';
import { MOCK_RECHARGE_PLANS } from '../../services/mockData';
import { useWalletStore } from '../../store/walletStore';

const OPERATORS = ['Jio', 'Airtel', 'Vi', 'BSNL'];

export const MobileRechargeScreen: React.FC = () => {
  const { t } = useTranslation();
  const { summary, recordWithdrawal } = useWalletStore();
  const [mobileNumber, setMobileNumber] = useState('9876543210');
  const [selectedOperator, setSelectedOperator] = useState('Jio');
  const [selectedPlan, setSelectedPlan] = useState<RechargePlan | null>(MOCK_RECHARGE_PLANS[0]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleRecharge = () => {
    if (!selectedPlan) {
      Alert.alert('Error', 'Please select a recharge plan');
      return;
    }
    if (!/^[6-9]\d{9}$/.test(mobileNumber)) {
      Alert.alert('Error', 'Please enter a valid 10-digit mobile number');
      return;
    }
    if (selectedPlan.amountPaise > summary.mainBalancePaise) {
      Alert.alert(
        'Insufficient Balance',
        `Recharge requires ${formatPaiseToRupees(selectedPlan.amountPaise)}, but your spendable wallet has ${formatPaiseToRupees(summary.mainBalancePaise)}.`
      );
      return;
    }

    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      // Deduct from wallet
      recordWithdrawal(selectedPlan.amountPaise, `Mobile Recharge: ${selectedOperator} ${mobileNumber}`);
      Alert.alert(
        'Recharge Successful! ⚡',
        `${selectedPlan.operator} recharge of ${formatPaiseToRupees(selectedPlan.amountPaise)} processed for +91 ${mobileNumber}. Operator ref: MOCK-RC-${Date.now()}`
      );
    }, 1000);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <Header
        title={t('utility.rechargeTitle')}
        subtitle="Direct wallet payment with instant recharge operator routing"
      />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Wallet Balance Strip */}
        <Card variant="glass" style={styles.balanceStrip}>
          <Text style={styles.balanceStripLabel}>Available Spendable Balance:</Text>
          <Text style={styles.balanceStripVal}>
            {formatPaiseToRupees(summary.mainBalancePaise)}
          </Text>
        </Card>

        {/* Input Details */}
        <Card variant="elevated" style={styles.formCard}>
          <Input
            label="Mobile Number"
            placeholder="Enter 10-digit mobile number"
            keyboardType="phone-pad"
            maxLength={10}
            value={mobileNumber}
            onChangeText={setMobileNumber}
            leftIcon={<Text style={styles.prefix}>+91</Text>}
          />

          <Text style={styles.operatorLabel}>{t('utility.selectOperator')}</Text>
          <View style={styles.operatorRow}>
            {OPERATORS.map((op) => (
              <TouchableOpacity
                key={op}
                activeOpacity={0.8}
                onPress={() => setSelectedOperator(op)}
                style={[
                  styles.operatorBtn,
                  selectedOperator === op ? styles.operatorBtnActive : undefined,
                ]}
              >
                <Text
                  style={[
                    styles.operatorText,
                    selectedOperator === op ? styles.operatorTextActive : undefined,
                  ]}
                >
                  {op}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Plans Section */}
        <Text style={styles.plansHeader}>{t('utility.rechargePlans')}</Text>

        {MOCK_RECHARGE_PLANS.map((plan) => {
          const isSelected = selectedPlan?.id === plan.id;
          return (
            <TouchableOpacity
              key={plan.id}
              activeOpacity={0.8}
              onPress={() => setSelectedPlan(plan)}
            >
              <Card
                variant={isSelected ? 'emerald' : 'default'}
                style={styles.planCard}
              >
                <View style={styles.planHeader}>
                  <View>
                    <Text style={styles.planPrice}>
                      {formatPaiseToRupees(plan.amountPaise)}
                    </Text>
                    <Text style={styles.planValidity}>
                      Validity: {plan.validity} {plan.data ? `• ${plan.data}` : ''}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.radioCircle,
                      isSelected ? styles.radioSelected : undefined,
                    ]}
                  >
                    {isSelected ? <View style={styles.radioDot} /> : null}
                  </View>
                </View>

                <Text style={styles.planDesc}>{plan.description}</Text>
              </Card>
            </TouchableOpacity>
          );
        })}

        {/* Submit */}
        {selectedPlan ? (
          <Button
            title={`Pay ${formatPaiseToRupees(selectedPlan.amountPaise)} via Wallet`}
            onPress={handleRecharge}
            variant="primary"
            size="lg"
            isLoading={isProcessing}
            style={styles.rechargeBtn}
          />
        ) : null}
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
  balanceStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    marginBottom: 16,
  },
  balanceStripLabel: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    fontWeight: '600',
  },
  balanceStripVal: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.emerald,
  },
  formCard: {
    padding: THEME.spacing.lg,
    marginBottom: 20,
  },
  prefix: {
    color: THEME.colors.emerald,
    fontWeight: '800',
    fontSize: 15,
    marginRight: 6,
  },
  operatorLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  operatorRow: {
    flexDirection: 'row',
    gap: 8,
  },
  operatorBtn: {
    flex: 1,
    backgroundColor: THEME.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    paddingVertical: 10,
    borderRadius: THEME.borderRadius.md,
    alignItems: 'center',
  },
  operatorBtnActive: {
    borderColor: THEME.colors.emerald,
    backgroundColor: THEME.colors.emeraldGlow,
  },
  operatorText: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  operatorTextActive: {
    color: THEME.colors.emerald,
    fontWeight: '800',
  },
  plansHeader: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 12,
  },
  planCard: {
    marginBottom: 12,
    padding: THEME.spacing.md,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  planPrice: {
    fontSize: 18,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  planValidity: {
    fontSize: 12,
    color: THEME.colors.emerald,
    fontWeight: '700',
    marginTop: 2,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: THEME.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioSelected: {
    borderColor: THEME.colors.emerald,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: THEME.colors.emerald,
  },
  planDesc: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    lineHeight: 16,
  },
  rechargeBtn: {
    marginTop: 10,
  },
});
