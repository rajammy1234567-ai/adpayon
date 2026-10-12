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
import { useTranslation } from 'react-i18next';
import { formatPaiseToRupees, ScratchCardItem } from '@adpayon/shared';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Header } from '../../components/ui/Header';
import { Modal } from '../../components/ui/Modal';
import { THEME } from '../../constants/theme';
import { MOCK_SCRATCH_CARDS } from '../../services/mockData';
import { useWalletStore } from '../../store/walletStore';

export const ScratchEarnScreen: React.FC = () => {
  const { t } = useTranslation();
  const { claimReward } = useWalletStore();
  const [cards, setCards] = useState<ScratchCardItem[]>(MOCK_SCRATCH_CARDS);
  const [activeCard, setActiveCard] = useState<ScratchCardItem | null>(null);
  const [isScratchingModalVisible, setIsScratchingModalVisible] = useState(false);
  const [scratchProgress, setScratchProgress] = useState(0);

  const handleOpenCard = (item: ScratchCardItem) => {
    setActiveCard(item);
    setScratchProgress(item.isScratched ? 100 : 0);
    setIsScratchingModalVisible(true);
  };

  const handleRubCard = () => {
    if (!activeCard || activeCard.isScratched) return;
    const next = Math.min(100, scratchProgress + 25);
    setScratchProgress(next);

    if (next === 100) {
      // Mark as scratched
      setCards((prev) =>
        prev.map((c) =>
          c.id === activeCard.id ? { ...c, isScratched: true, revealedAt: new Date().toISOString() } : c
        )
      );
      claimReward(
        activeCard.rewardAmountPaise,
        'ENGAGEMENT',
        `Scratch Card Win: ${activeCard.title}`
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title={t('gamification.scratchTitle')}
        subtitle="Unveil surprise cash gifts up to ₹500.00 instantly"
      />

      <View style={styles.body}>
        {/* Banner */}
        <Card variant="gold" style={styles.bannerCard}>
          <Text style={styles.bannerTitle}>Lucky Golden Cards</Text>
          <Text style={styles.bannerSub}>
            Earn scratch cards daily via login streaks, binary milestone pairs, and challenge completions.
          </Text>
        </Card>

        {/* Scratch Cards Grid */}
        <FlatList
          data={cards}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => handleOpenCard(item)}
              style={styles.cardItemWrapper}
            >
              <Card
                variant={item.isScratched ? 'default' : 'gold'}
                style={styles.cardBox}
              >
                <View style={styles.badgeRow}>
                  <Badge
                    label={item.isScratched ? 'Claimed' : 'Unopened'}
                    variant={item.isScratched ? 'neutral' : 'gold'}
                  />
                </View>

                <View style={styles.cardIconBox}>
                  <Text style={styles.cardEmoji}>
                    {item.isScratched ? '💰' : '🎁'}
                  </Text>
                </View>

                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.cardSource} numberOfLines={1}>
                  {item.source}
                </Text>

                <View style={styles.cardFooter}>
                  {item.isScratched ? (
                    <Text style={styles.claimedAmount}>
                      Won {formatPaiseToRupees(item.rewardAmountPaise)}
                    </Text>
                  ) : (
                    <Text style={styles.scratchPrompt}>Tap to Scratch ✨</Text>
                  )}
                </View>
              </Card>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Scratch Modal */}
      <Modal
        visible={isScratchingModalVisible}
        onClose={() => setIsScratchingModalVisible(false)}
        title="Scratch & Reveal"
      >
        {activeCard ? (
          <View style={styles.scratchModalContent}>
            <Text style={styles.modalCardTitle}>{activeCard.title}</Text>
            <Text style={styles.modalCardSub}>
              {scratchProgress < 100
                ? 'Tap / Rub repeatedly to peel off the foil cover!'
                : '🎉 Congratulations! Prize verified!'}
            </Text>

            {/* Interactive Scratch Surface */}
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={handleRubCard}
              style={[
                styles.scratchSurface,
                scratchProgress === 100 ? styles.scratchSurfaceRevealed : undefined,
              ]}
            >
              {scratchProgress < 100 ? (
                <View style={styles.foilOverlay}>
                  <Text style={styles.foilPattern}>✨ 🪙 💎 🪙 ✨</Text>
                  <Text style={styles.foilPrompt}>
                    {scratchProgress > 0 ? `Peeling... ${scratchProgress}%` : 'TAP TO PEEL FOIL'}
                  </Text>
                  <View style={styles.foilBar}>
                    <View style={[styles.foilBarFill, { width: `${scratchProgress}%` }]} />
                  </View>
                </View>
              ) : (
                <View style={styles.revealedBox}>
                  <Text style={styles.revealedEmoji}>🎉 💰 🎉</Text>
                  <Text style={styles.revealedAmount}>
                    {formatPaiseToRupees(activeCard.rewardAmountPaise)}
                  </Text>
                  <Text style={styles.revealedSub}>
                    Directly Credited into Ledger!
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {scratchProgress === 100 ? (
              <Button
                title="Claim & Close"
                onPress={() => setIsScratchingModalVisible(false)}
                variant="primary"
                size="md"
                style={styles.closeModalBtn}
              />
            ) : null}
          </View>
        ) : null}
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
  bannerCard: {
    padding: 14,
    marginBottom: 16,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.goldLight,
  },
  bannerSub: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
    lineHeight: 16,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  listContainer: {
    paddingBottom: 30,
  },
  cardItemWrapper: {
    width: '48%',
    marginBottom: 14,
  },
  cardBox: {
    padding: 12,
    alignItems: 'center',
    height: 190,
    justifyContent: 'space-between',
  },
  badgeRow: {
    width: '100%',
    alignItems: 'flex-start',
  },
  cardIconBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: THEME.colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 6,
  },
  cardEmoji: {
    fontSize: 28,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    textAlign: 'center',
  },
  cardSource: {
    fontSize: 10,
    color: THEME.colors.textMuted,
    textAlign: 'center',
  },
  cardFooter: {
    marginTop: 6,
  },
  claimedAmount: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.emerald,
  },
  scratchPrompt: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.goldLight,
  },
  scratchModalContent: {
    alignItems: 'center',
  },
  modalCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  modalCardSub: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 4,
    marginBottom: 18,
    textAlign: 'center',
  },
  scratchSurface: {
    width: 240,
    height: 240,
    borderRadius: THEME.borderRadius.xl,
    backgroundColor: THEME.colors.surfaceElevated,
    borderWidth: 2,
    borderColor: THEME.colors.gold,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scratchSurfaceRevealed: {
    borderColor: THEME.colors.emerald,
    backgroundColor: THEME.colors.emeraldGlow,
  },
  foilOverlay: {
    width: '100%',
    height: '100%',
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  foilPattern: {
    fontSize: 20,
    marginBottom: 14,
  },
  foilPrompt: {
    fontSize: 13,
    fontWeight: '900',
    color: '#F9FAFB',
    letterSpacing: 1,
  },
  foilBar: {
    width: '80%',
    height: 6,
    backgroundColor: '#1F2937',
    borderRadius: 3,
    marginTop: 12,
    overflow: 'hidden',
  },
  foilBarFill: {
    height: '100%',
    backgroundColor: THEME.colors.gold,
  },
  revealedBox: {
    alignItems: 'center',
  },
  revealedEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  revealedAmount: {
    fontSize: 32,
    fontWeight: '900',
    color: THEME.colors.emerald,
  },
  revealedSub: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 6,
    fontWeight: '600',
  },
  closeModalBtn: {
    width: '100%',
    marginTop: 20,
  },
});
