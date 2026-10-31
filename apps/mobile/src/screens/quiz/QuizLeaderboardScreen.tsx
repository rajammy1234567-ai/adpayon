import React, { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,

  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { formatPaiseToRupees, QuizLeaderboardEntry } from '@adpayon/shared';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Header } from '../../components/ui/Header';
import { THEME } from '../../constants/theme';
import { MOCK_QUIZ_LEADERBOARD, MOCK_QUIZ_QUESTIONS } from '../../services/mockData';
import { useWalletStore } from '../../store/walletStore';

export const QuizLeaderboardScreen: React.FC = () => {
  const { t } = useTranslation();
  const { claimReward } = useWalletStore();
  const [activeTab, setActiveTab] = useState<'QUIZ' | 'LEADERBOARD'>('QUIZ');

  // Quiz state
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [timer, setTimer] = useState(20);
  const [quizFinished, setQuizFinished] = useState(false);

  const currentQ = MOCK_QUIZ_QUESTIONS[currentQIndex];

  useEffect(() => {
    if (activeTab !== 'QUIZ' || quizFinished || isAnswered) return;
    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          setIsAnswered(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTab, quizFinished, isAnswered, currentQIndex]);

  const handleSelectOption = (index: number) => {
    if (isAnswered) return;
    setSelectedOption(index);
    setIsAnswered(true);

    if (index === currentQ.correctIndex) {
      setScore((prev) => prev + 100);
    }
  };

  const handleNextQuestion = () => {
    if (currentQIndex < MOCK_QUIZ_QUESTIONS.length - 1) {
      setCurrentQIndex(currentQIndex + 1);
      setSelectedOption(null);
      setIsAnswered(false);
      setTimer(20);
    } else {
      setQuizFinished(true);
      // Credit quiz reward
      const finalScore = score + (selectedOption === currentQ.correctIndex ? 100 : 0);
      claimReward(1000, 'ENGAGEMENT', `Daily Quiz Participation: Score ${finalScore} pts`);
      Alert.alert(
        'Quiz Completed! 🎓',
        `Final Score: ${finalScore} / 300 pts! ₹10.00 (1,000 paise) prize credited to wallet.`
      );
    }
  };

  const handleRestartQuiz = () => {
    setCurrentQIndex(0);
    setSelectedOption(null);
    setIsAnswered(false);
    setScore(0);
    setTimer(20);
    setQuizFinished(false);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <Header
        title={t('gamification.quizTitle')}
        subtitle="Win daily pool prizes up to ₹250.00 every 24 hours"
      />

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setActiveTab('QUIZ')}
          style={[styles.tabBtn, activeTab === 'QUIZ' ? styles.tabBtnActive : undefined]}
        >
          <Text
            style={[styles.tabText, activeTab === 'QUIZ' ? styles.tabTextActive : undefined]}
          >
            🧠 Daily Quiz ({currentQIndex + 1}/{MOCK_QUIZ_QUESTIONS.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setActiveTab('LEADERBOARD')}
          style={[styles.tabBtn, activeTab === 'LEADERBOARD' ? styles.tabBtnActive : undefined]}
        >
          <Text
            style={[styles.tabText, activeTab === 'LEADERBOARD' ? styles.tabTextActive : undefined]}
          >
            🏆 Top Leaderboard
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'QUIZ' ? (
        <View style={styles.quizContent}>
          {!quizFinished ? (
            <>
              {/* Question Card */}
              <Card variant="elevated" style={styles.qCard}>
                <View style={styles.qHeader}>
                  <Badge label={currentQ.category} variant="cyan" />
                  <View style={styles.timerPill}>
                    <Text style={styles.timerEmoji}>⏱️</Text>
                    <Text style={[styles.timerText, timer < 6 ? styles.timerRed : undefined]}>
                      {timer}s
                    </Text>
                  </View>
                </View>

                <Text style={styles.questionText}>{currentQ.question}</Text>

                <View style={styles.optionsList}>
                  {currentQ.options.map((opt, i) => {
                    let optionStyle: any = styles.optionItem;
                    let textStyle: any = styles.optionText;

                    if (isAnswered) {
                      if (i === currentQ.correctIndex) {
                        optionStyle = [styles.optionItem, styles.optionCorrect];
                        textStyle = [styles.optionText, styles.optionTextCorrect];
                      } else if (selectedOption === i) {
                        optionStyle = [styles.optionItem, styles.optionWrong];
                        textStyle = [styles.optionText, styles.optionTextWrong];
                      }
                    } else if (selectedOption === i) {
                      optionStyle = [styles.optionItem, styles.optionSelected];
                    }

                    return (
                      <TouchableOpacity
                        key={i}
                        activeOpacity={0.8}
                        disabled={isAnswered}
                        onPress={() => handleSelectOption(i)}
                        style={optionStyle}
                      >
                        <Text style={styles.optionLetter}>
                          {String.fromCharCode(65 + i)}
                        </Text>
                        <Text style={textStyle}>{opt}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {isAnswered ? (
                  <Button
                    title={
                      currentQIndex < MOCK_QUIZ_QUESTIONS.length - 1
                        ? 'Next Question →'
                        : 'Finish Quiz & Claim Reward 🎯'
                    }
                    onPress={handleNextQuestion}
                    variant="primary"
                    size="md"
                    style={styles.nextBtn}
                  />
                ) : null}
              </Card>

              {/* Score card */}
              <Card variant="default" style={styles.scoreRow}>
                <Text style={styles.scoreLabel}>Current Session Score:</Text>
                <Text style={styles.scoreNumber}>{score} pts</Text>
              </Card>
            </>
          ) : (
            <Card variant="gold" style={styles.finishedCard}>
              <Text style={styles.finishedEmoji}>🎉</Text>
              <Text style={styles.finishedTitle}>Quiz Complete!</Text>
              <Text style={styles.finishedScore}>Final Score: {score} pts</Text>
              <Text style={styles.finishedSub}>
                Reward of ₹10.00 credited to your wallet ledger. You are ranked #3 on today's leaderboard!
              </Text>
              <Button
                title="View Leaderboard"
                onPress={() => setActiveTab('LEADERBOARD')}
                variant="primary"
                size="md"
                style={styles.actionFinishedBtn}
              />
              <Button
                title="Play Again"
                onPress={handleRestartQuiz}
                variant="secondary"
                size="sm"
              />
            </Card>
          )}
        </View>
      ) : (
        /* Leaderboard View */
        <View style={styles.leaderboardContent}>
          <Card variant="gold" style={styles.prizePoolCard}>
            <Text style={styles.prizePoolTitle}>Daily Quiz Prize Pool: ₹1,000.00</Text>
            <Text style={styles.prizePoolSub}>
              Top 10 participants split daily pool rewards automatically every midnight!
            </Text>
          </Card>

          <FlatList
            data={MOCK_QUIZ_LEADERBOARD}
            keyExtractor={(item) => item.userId}
            renderItem={({ item }) => (
              <Card
                variant={item.userId === 'usr_503' ? 'emerald' : 'default'}
                style={styles.leaderboardRow}
              >
                <View style={styles.rankCol}>
                  <Text
                    style={[
                      styles.rankNumber,
                      item.rank === 1
                        ? styles.rankGold
                        : item.rank === 2
                        ? styles.rankSilver
                        : item.rank === 3
                        ? styles.rankBronze
                        : undefined,
                    ]}
                  >
                    #{item.rank}
                  </Text>
                </View>

                <View style={styles.leaderboardInfo}>
                  <Text style={styles.leaderboardName}>{item.name}</Text>
                  <Text style={styles.leaderboardMeta}>
                    {item.score} pts • {item.timeTakenSec}s
                  </Text>
                </View>

                <View style={styles.leaderboardReward}>
                  <Text style={styles.rewardPaise}>
                    +{formatPaiseToRupees(item.rewardPaise)}
                  </Text>
                  <Text style={styles.rewardTag}>Prize</Text>
                </View>
              </Card>
            )}
          />
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: THEME.spacing.lg,
    paddingVertical: THEME.spacing.sm,
    gap: 10,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: THEME.colors.surfaceSubtle,
    borderRadius: THEME.borderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  tabBtnActive: {
    borderColor: THEME.colors.emerald,
    backgroundColor: THEME.colors.emeraldGlow,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  tabTextActive: {
    color: THEME.colors.emerald,
    fontWeight: '800',
  },
  quizContent: {
    flex: 1,
    padding: THEME.spacing.lg,
  },
  qCard: {
    padding: THEME.spacing.xl,
    marginBottom: 16,
  },
  qHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surfaceElevated,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: THEME.borderRadius.full,
  },
  timerEmoji: {
    fontSize: 12,
    marginRight: 4,
  },
  timerText: {
    fontSize: 13,
    fontWeight: '800',
    color: THEME.colors.cyan,
  },
  timerRed: {
    color: THEME.colors.danger,
  },
  questionText: {
    fontSize: 17,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    lineHeight: 24,
    marginBottom: 20,
  },
  optionsList: {
    gap: 10,
    marginBottom: 16,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surfaceSubtle,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    padding: 12,
    borderRadius: THEME.borderRadius.md,
  },
  optionSelected: {
    borderColor: THEME.colors.cyan,
    backgroundColor: THEME.colors.cyanGlow,
  },
  optionCorrect: {
    borderColor: THEME.colors.emerald,
    backgroundColor: THEME.colors.emeraldGlow,
  },
  optionWrong: {
    borderColor: THEME.colors.danger,
    backgroundColor: THEME.colors.dangerGlow,
  },
  optionLetter: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: THEME.colors.surfaceElevated,
    textAlign: 'center',
    lineHeight: 26,
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginRight: 10,
  },
  optionText: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
    flex: 1,
  },
  optionTextCorrect: {
    color: THEME.colors.emerald,
    fontWeight: '800',
  },
  optionTextWrong: {
    color: THEME.colors.danger,
    fontWeight: '800',
  },
  nextBtn: {
    marginTop: 8,
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  scoreLabel: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    fontWeight: '600',
  },
  scoreNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.goldLight,
  },
  finishedCard: {
    padding: THEME.spacing.xxl,
    alignItems: 'center',
  },
  finishedEmoji: {
    fontSize: 48,
    marginBottom: 10,
  },
  finishedTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  finishedScore: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.colors.goldLight,
    marginTop: 6,
  },
  finishedSub: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginVertical: 14,
    lineHeight: 18,
  },
  actionFinishedBtn: {
    width: '100%',
    marginBottom: 10,
  },
  leaderboardContent: {
    flex: 1,
    padding: THEME.spacing.lg,
  },
  prizePoolCard: {
    padding: 12,
    marginBottom: 16,
  },
  prizePoolTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.goldLight,
  },
  prizePoolSub: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 10,
  },
  rankCol: {
    width: 36,
  },
  rankNumber: {
    fontSize: 16,
    fontWeight: '900',
    color: THEME.colors.textMuted,
  },
  rankGold: {
    color: '#F59E0B',
  },
  rankSilver: {
    color: '#E2E8F0',
  },
  rankBronze: {
    color: '#B45309',
  },
  leaderboardInfo: {
    flex: 1,
    marginLeft: 6,
  },
  leaderboardName: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  leaderboardMeta: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    marginTop: 2,
  },
  leaderboardReward: {
    alignItems: 'flex-end',
  },
  rewardPaise: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.emerald,
  },
  rewardTag: {
    fontSize: 10,
    color: THEME.colors.textMuted,
    textTransform: 'uppercase',
  },
});
