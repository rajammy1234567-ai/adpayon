import React, { useState } from 'react';
import {
  Alert,
  Animated,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { ChallengeItem, formatPaiseToRupees } from '@adpayon/shared';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { THEME } from '../../constants/theme';
import { RootStackParamList } from '../../navigation/types';
import { MOCK_CHALLENGES } from '../../services/mockData';
import { useAuthStore } from '../../store/authStore';
import { useWalletStore } from '../../store/walletStore';

type Props = NativeStackScreenProps<RootStackParamList, 'OnboardingChallenges'>;

export const ChallengeListScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const { unlockDashboard } = useAuthStore();
  const { claimReward } = useWalletStore();

  const [challenges, setChallenges] = useState<ChallengeItem[]>(MOCK_CHALLENGES);
  const [selectedChallenge, setSelectedChallenge] = useState<ChallengeItem | null>(null);
  const [isRedirectModalVisible, setIsRedirectModalVisible] = useState(false);
  const [isConfirmModalVisible, setIsConfirmModalVisible] = useState(false);
  const [isUnlockModalVisible, setIsUnlockModalVisible] = useState(false);
  const [confirmTimer, setConfirmTimer] = useState(30);

  const mandatoryChallenges = challenges.filter((c) => c.isRequiredForDashboard);
  const completedCount = mandatoryChallenges.filter((c) => c.userStatus === 'VERIFIED').length;
  const totalMandatory = mandatoryChallenges.length;
  const isAllMandatoryDone = completedCount >= totalMandatory;

  const handleStartChallenge = (item: ChallengeItem) => {
    setSelectedChallenge(item);
    setIsRedirectModalVisible(true);
  };

  const handleProceedToPartner = () => {
    setIsRedirectModalVisible(false);
    // Open Confirmation modal
    setIsConfirmModalVisible(true);
    setConfirmTimer(selectedChallenge?.timerSeconds || 30);
  };

  const handleConfirmTask = () => {
    if (!selectedChallenge) return;

    // Mark as verified in state
    const updated = challenges.map((c) =>
      c.id === selectedChallenge.id ? { ...c, userStatus: 'VERIFIED' as const } : c
    );
    setChallenges(updated);
    claimReward(
      selectedChallenge.rewardAmountPaise,
      'CHALLENGES',
      `Challenge Reward: ${selectedChallenge.title}`
    );

    setIsConfirmModalVisible(false);

    // Check if that was the last mandatory task
    const mandatoryLeft = updated.filter(
      (c) => c.isRequiredForDashboard && c.userStatus !== 'VERIFIED'
    ).length;

    if (mandatoryLeft === 0) {
      setTimeout(() => {
        setIsUnlockModalVisible(true);
      }, 500);
    }
  };

  const handleDashboardUnlock = () => {
    unlockDashboard();
    claimReward(5000, 'CHALLENGES', '₹50.00 Signup Bonus Unlocked');
    setIsUnlockModalVisible(false);
    navigation.replace('MainTabs', { screen: 'Dashboard' });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Top Header */}
        <View style={styles.header}>
          <View style={styles.bonusChip}>
            <Text style={styles.bonusChipText}>🔒 DASHBOARD LOCKED</Text>
          </View>
          <Text style={styles.title}>{t('challenges.onboardingTitle')}</Text>
          <Text style={styles.subtitle}>{t('challenges.onboardingSubtitle')}</Text>
        </View>

        {/* Progress Tracker Card */}
        <Card variant="gold" style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <View>
              <Text style={styles.progressLabel}>Mandatory Account Activation</Text>
              <Text style={styles.progressSub}>
                {completedCount} of {totalMandatory} Onboarding Tasks Completed
              </Text>
            </View>
            <View style={styles.progressBadge}>
              <Text style={styles.progressBadgeText}>
                {Math.round((completedCount / totalMandatory) * 100)}%
              </Text>
            </View>
          </View>

          {/* Progress Bar */}
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                { width: `${(completedCount / totalMandatory) * 100}%` },
              ]}
            />
          </View>

          {isAllMandatoryDone ? (
            <Button
              title="✨ Claim ₹50 Bonus & Unlock Dashboard"
              onPress={() => setIsUnlockModalVisible(true)}
              variant="primary"
              size="md"
              style={styles.unlockBtn}
            />
          ) : (
            <Text style={styles.progressNote}>
              Complete remaining tasks below to activate binary matching and wallet access.
            </Text>
          )}
        </Card>

        {/* Task List */}
        <Text style={styles.sectionTitle}>Mandatory Onboarding Tasks</Text>

        {challenges.map((item) => {
          const isDone = item.userStatus === 'VERIFIED';
          return (
            <Card
              key={item.id}
              variant={isDone ? 'emerald' : 'default'}
              style={styles.challengeCard}
            >
              <View style={styles.challengeRow}>
                <View style={styles.challengeIcon}>
                  <Text style={styles.iconSymbol}>
                    {item.taskType === 'APP_INSTALL'
                      ? '📲'
                      : item.taskType === 'VIDEO_WATCH'
                      ? '▶️'
                      : item.taskType === 'SURVEY'
                      ? '📝'
                      : '🛒'}
                  </Text>
                </View>

                <View style={styles.challengeInfo}>
                  <View style={styles.titleRow}>
                    <Text style={styles.challengeTitle}>{item.title}</Text>
                  </View>
                  <Text style={styles.challengeDesc}>{item.description}</Text>

                  <View style={styles.metaRow}>
                    <Text style={styles.rewardText}>
                      +{formatPaiseToRupees(item.rewardAmountPaise)}
                    </Text>
                    {item.isRequiredForDashboard ? (
                      <Badge label="Required" variant="gold" style={styles.metaBadge} />
                    ) : null}
                    {isDone ? (
                      <Badge label="Completed" variant="active" style={styles.metaBadge} />
                    ) : (
                      <Badge label="Pending" variant="neutral" style={styles.metaBadge} />
                    )}
                  </View>
                </View>
              </View>

              {!isDone ? (
                <Button
                  title={t('challenges.startTask')}
                  onPress={() => handleStartChallenge(item)}
                  variant="outline"
                  size="sm"
                  style={styles.taskActionBtn}
                />
              ) : null}
            </Card>
          );
        })}
      </ScrollView>

      {/* Partner Redirect Modal */}
      <Modal
        visible={isRedirectModalVisible}
        onClose={() => setIsRedirectModalVisible(false)}
        title="Partner Task Redirect"
      >
        {selectedChallenge ? (
          <View style={styles.modalContent}>
            <Text style={styles.modalSub}>
              You are being redirected to our verified partner{' '}
              <Text style={styles.bold}>{selectedChallenge.partnerName}</Text>.
            </Text>

            <Card variant="glass" style={styles.tokenCard}>
              <Text style={styles.tokenLabel}>Secure Postback Token</Text>
              <Text style={styles.tokenCode}>HMAC-SHA256: 9f83a...e41d</Text>
              <Text style={styles.tokenDesc}>
                Our server automatically tracks your completion and credits{' '}
                {formatPaiseToRupees(selectedChallenge.rewardAmountPaise)} into your ledger.
              </Text>
            </Card>

            <Button
              title="Proceed to Partner App"
              onPress={handleProceedToPartner}
              variant="primary"
              size="lg"
              style={styles.modalBtn}
            />
          </View>
        ) : null}
      </Modal>

      {/* Task Confirmation Modal */}
      <Modal
        visible={isConfirmModalVisible}
        onClose={() => setIsConfirmModalVisible(false)}
        title="Confirm Task Completion"
      >
        <View style={styles.modalContent}>
          <Text style={styles.modalSub}>
            Have you completed the requirements for{' '}
            <Text style={styles.bold}>{selectedChallenge?.title}</Text>?
          </Text>

          <Card variant="default" style={styles.ruleCard}>
            <Text style={styles.ruleItem}>• Kept partner app open for required time</Text>
            <Text style={styles.ruleItem}>• Completed mobile registration or video</Text>
            <Text style={styles.ruleItem}>• Zero emulator / duplicate device fraud</Text>
          </Card>

          <Button
            title="Yes, Task Completed"
            onPress={handleConfirmTask}
            variant="primary"
            size="lg"
            style={styles.modalBtn}
          />
        </View>
      </Modal>

      {/* Full Dashboard Unlock Celebration Modal */}
      <Modal
        visible={isUnlockModalVisible}
        onClose={() => {}}
        title="🎉 Congratulations!"
      >
        <View style={styles.modalContent}>
          <View style={styles.unlockIconBadge}>
            <Text style={styles.unlockEmoji}>💎</Text>
          </View>
          <Text style={styles.unlockTitle}>Account Activated!</Text>
          <Text style={styles.unlockSub}>
            You have successfully completed all onboarding challenges. Your ₹50.00
            signup bonus has moved to your verified ledger balance, and your 8-level
            network and binary matching engines are now active.
          </Text>

          <Button
            title="Enter Full Dashboard 🚀"
            onPress={handleDashboardUnlock}
            variant="primary"
            size="lg"
            style={styles.modalBtn}
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
  scroll: {
    padding: THEME.spacing.lg,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
  },
  bonusChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: THEME.colors.danger,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: THEME.borderRadius.full,
    marginBottom: 10,
  },
  bonusChipText: {
    color: THEME.colors.danger,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  progressCard: {
    marginBottom: 24,
    padding: THEME.spacing.lg,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.goldLight,
  },
  progressSub: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  progressBadge: {
    backgroundColor: THEME.colors.surfaceSubtle,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.gold,
  },
  progressBadgeText: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.goldLight,
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: THEME.colors.surfaceElevated,
    overflow: 'hidden',
    marginBottom: 12,
  },
  barFill: {
    height: '100%',
    backgroundColor: THEME.colors.gold,
  },
  unlockBtn: {
    marginTop: 8,
  },
  progressNote: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    fontStyle: 'italic',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  challengeCard: {
    marginBottom: 12,
    padding: THEME.spacing.md,
  },
  challengeRow: {
    flexDirection: 'row',
  },
  challengeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: THEME.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconSymbol: {
    fontSize: 20,
  },
  challengeInfo: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  challengeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  challengeDesc: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  rewardText: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.emerald,
  },
  metaBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  taskActionBtn: {
    marginTop: 12,
  },
  modalContent: {
    alignItems: 'center',
  },
  modalSub: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  bold: {
    color: THEME.colors.textPrimary,
    fontWeight: '700',
  },
  tokenCard: {
    width: '100%',
    padding: THEME.spacing.md,
    marginBottom: 16,
  },
  tokenLabel: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  tokenCode: {
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: THEME.colors.cyan,
    marginTop: 4,
    marginBottom: 6,
  },
  tokenDesc: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    lineHeight: 15,
  },
  ruleCard: {
    width: '100%',
    padding: THEME.spacing.md,
    marginBottom: 16,
  },
  ruleItem: {
    color: THEME.colors.textSecondary,
    fontSize: 12,
    marginVertical: 2,
  },
  modalBtn: {
    width: '100%',
  },
  unlockIconBadge: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: THEME.colors.emeraldGlow,
    borderWidth: 2,
    borderColor: THEME.colors.emerald,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  unlockEmoji: {
    fontSize: 40,
  },
  unlockTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
    marginBottom: 8,
  },
  unlockSub: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
});
