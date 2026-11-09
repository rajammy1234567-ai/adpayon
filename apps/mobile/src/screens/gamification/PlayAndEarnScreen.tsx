import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';
import { PlayEarnActivityInfo, PlayEarnQuizQuestion, formatUsd } from '@adpayon/shared';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Header } from '../../components/ui/Header';
import { THEME } from '../../constants/theme';
import {
  getPlayEarnActivitiesApi,
  spinWheelApi,
  scratchCardApi,
  validatePuzzleApi,
  getQuizQuestionsApi,
  submitQuizAnswersApi,
} from '../../services/api/features.api';
import { useWalletStore } from '../../store/walletStore';

type ActiveGame = 'NONE' | 'SPIN' | 'SCRATCH' | 'PUZZLE' | 'QUIZ';

const SEGMENT_COLORS = [
  '#DC2626', // Red
  '#1E293B', // Dark Slate
  '#D97706', // Gold Amber
  '#059669', // Emerald
  '#B91C1C', // Deep Red
  '#2563EB', // Blue
  '#F59E0B', // Bright Gold
  '#7C3AED', // Purple
];

const DEFAULT_SEGMENTS = [5, 10, 15, 20, 25, 50, 75, 100];

export const PlayAndEarnScreen: React.FC = () => {
  const { fetchSummary } = useWalletStore();
  const [activities, setActivities] = useState<PlayEarnActivityInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeGame, setActiveGame] = useState<ActiveGame>('NONE');

  // Helper to switch game and blur any web active element to avoid aria-hidden warnings
  const navigateToGame = (game: ActiveGame) => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      (document.activeElement as HTMLElement)?.blur();
    }
    setActiveGame(game);
  };

  // --- Spin Wheel State ---
  const spinAngleAnim = useRef(new Animated.Value(0)).current;
  const currentAngleRef = useRef(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinResult, setSpinResult] = useState<string | null>(null);

  // --- Scratch Card State ---
  const [isScratching, setIsScratching] = useState(false);
  const [scratchedCard, setScratchedCard] = useState<any>(null);
  const [scratchedPatches, setScratchedPatches] = useState<boolean[]>([
    false, false, false,
    false, false, false,
    false, false, false,
  ]);

  // --- Puzzle State ---
  const [board, setBoard] = useState<number[]>([1, 2, 3, 4, 5, 6, 7, 0, 8]);
  const [puzzleMoves, setPuzzleMoves] = useState(0);
  const [puzzleStartTime, setPuzzleStartTime] = useState<number | null>(null);
  const [puzzleValidating, setPuzzleValidating] = useState(false);
  const [puzzleSolved, setPuzzleSolved] = useState(false);

  // --- Quiz State ---
  const [quizQuestions, setQuizQuestions] = useState<PlayEarnQuizQuestion[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [quizResult, setQuizResult] = useState<any>(null);

  const loadActivities = async () => {
    try {
      const data = await getPlayEarnActivitiesApi();
      setActivities(data);
    } catch (err: any) {
      console.error('Failed to load activities', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadActivities();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadActivities();
  };

  // Activity lookups
  const spinActivity = activities.find((a) => a.activityType === 'SPIN_WHEEL');
  const scratchActivity = activities.find((a) => a.activityType === 'SCRATCH_CARD');
  const puzzleActivity = activities.find((a) => a.activityType === 'NUMBER_PUZZLE');
  const quizActivity = activities.find((a) => a.activityType === 'QUIZ');

  const spinSegments = spinActivity?.spinSegments && spinActivity.spinSegments.length > 0
    ? spinActivity.spinSegments
    : DEFAULT_SEGMENTS;

  // ----------------------------------------------------
  // SPIN WHEEL: Server-authoritative alignment
  // ----------------------------------------------------
  const handleSpin = async () => {
    if (isSpinning) return;
    if (spinActivity && spinActivity.attemptsRemainingToday <= 0) {
      Alert.alert('Daily Limit Reached', 'You have used all your spin attempts for today. Check back tomorrow!');
      return;
    }

    try {
      setIsSpinning(true);
      setSpinResult(null);

      // Server determines winning outcome
      const res = await spinWheelApi();

      // Mathematically calculate landing rotation so pointer at top (0 deg)
      // lands centered on the server's segmentIndex
      const numSegments = spinSegments.length;
      const segAngle = 360 / numSegments;
      const targetSegCenter = res.segmentIndex * segAngle;

      // Current normalized angle modulo 360
      const curMod = currentAngleRef.current % 360;
      // Target normalized angle modulo 360 to bring segment center to 0 deg (top pointer)
      const targetMod = (360 - (targetSegCenter % 360)) % 360;
      let diff = (targetMod - curMod + 360) % 360;
      if (diff === 0) diff = 360;

      const fullSpins = 5;
      const nextAngle = currentAngleRef.current + (360 * fullSpins) + diff;

      Animated.timing(spinAngleAnim, {
        toValue: nextAngle,
        duration: 3200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(async () => {
        currentAngleRef.current = nextAngle;
        setIsSpinning(false);
        setSpinResult(
          `🎉 +${res.pointsAwarded} points (${formatUsd(res.usdValue)} USD) won! (Pending Review)`
        );
        await Promise.all([loadActivities(), fetchSummary()]);
      });
    } catch (err: any) {
      setIsSpinning(false);
      Alert.alert('Spin Failed', err.message || 'Spin wheel attempt failed.');
    }
  };

  // ----------------------------------------------------
  // SCRATCH CARD: Tactile reveal
  // ----------------------------------------------------
  const triggerScratchReveal = async () => {
    if (isScratching || scratchedCard) return;
    try {
      setIsScratching(true);
      const res = await scratchCardApi();
      setScratchedCard(res);
      // Mark all patches scratched
      setScratchedPatches(new Array(9).fill(true));
      await Promise.all([loadActivities(), fetchSummary()]);
    } catch (err: any) {
      Alert.alert('Scratch Card', err.message || 'Scratch card attempt failed.');
    } finally {
      setIsScratching(false);
    }
  };

  const handlePatchScratch = (index: number) => {
    if (scratchedCard || isScratching) return;
    const nextPatches = [...scratchedPatches];
    nextPatches[index] = true;
    setScratchedPatches(nextPatches);

    const scratchedCount = nextPatches.filter(Boolean).length;
    // Reveal once user rubs 3 or more patches
    if (scratchedCount >= 3) {
      triggerScratchReveal();
    }
  };

  const resetScratchCard = () => {
    setScratchedCard(null);
    setScratchedPatches(new Array(9).fill(false));
  };

  // ----------------------------------------------------
  // NUMBER PUZZLE: Solvable 3x3 sliding scramble
  // ----------------------------------------------------
  const generateSolvablePuzzle = (): number[] => {
    let cur = [1, 2, 3, 4, 5, 6, 7, 8, 0];
    let emptyIdx = 8;
    let lastMoved = -1;

    // Generate puzzle via legal backward moves from solved state
    for (let step = 0; step < 14; step++) {
      const row = Math.floor(emptyIdx / 3);
      const col = emptyIdx % 3;
      const neighbors: number[] = [];
      if (row > 0) neighbors.push(emptyIdx - 3);
      if (row < 2) neighbors.push(emptyIdx + 3);
      if (col > 0) neighbors.push(emptyIdx - 1);
      if (col < 2) neighbors.push(emptyIdx + 1);

      const candidates = neighbors.filter((n) => n !== lastMoved);
      const chosen = candidates[Math.floor(Math.random() * candidates.length)] ?? neighbors[0];
      cur[emptyIdx] = cur[chosen];
      cur[chosen] = 0;
      lastMoved = emptyIdx;
      emptyIdx = chosen;
    }

    // Ensure not already solved
    if (cur.every((v, i) => v === (i === 8 ? 0 : i + 1))) {
      cur = [1, 2, 3, 4, 5, 0, 7, 8, 6];
    }
    return cur;
  };

  const startPuzzle = () => {
    setBoard(generateSolvablePuzzle());
    setPuzzleMoves(0);
    setPuzzleStartTime(Date.now());
    setPuzzleSolved(false);
  };

  const handleTilePress = (index: number) => {
    if (puzzleSolved || puzzleValidating) return;
    const emptyIndex = board.indexOf(0);
    const row = Math.floor(index / 3);
    const col = index % 3;
    const emptyRow = Math.floor(emptyIndex / 3);
    const emptyCol = emptyIndex % 3;

    // Must be adjacent (up, down, left, right)
    const isAdjacent =
      (Math.abs(row - emptyRow) === 1 && col === emptyCol) ||
      (Math.abs(col - emptyCol) === 1 && row === emptyRow);

    if (isAdjacent) {
      const nextBoard = [...board];
      nextBoard[emptyIndex] = board[index];
      nextBoard[index] = 0;
      setBoard(nextBoard);
      const newMoves = puzzleMoves + 1;
      setPuzzleMoves(newMoves);

      // Check if solved: [1, 2, 3, 4, 5, 6, 7, 8, 0]
      const solved = nextBoard.every((val, idx) => val === (idx === 8 ? 0 : idx + 1));
      if (solved) {
        setPuzzleSolved(true);
        const elapsed = Math.max(
          1,
          Math.floor((Date.now() - (puzzleStartTime || Date.now())) / 1000)
        );
        validatePuzzleServer(nextBoard, newMoves, elapsed);
      }
    }
  };

  const validatePuzzleServer = async (finalBoard: number[], moves: number, elapsedSeconds: number) => {
    try {
      setPuzzleValidating(true);
      const res = await validatePuzzleApi({ finalBoard, moves, elapsedSeconds });
      Alert.alert('Puzzle Solved! 🧩', res.message);
      await Promise.all([loadActivities(), fetchSummary()]);
    } catch (err: any) {
      Alert.alert('Puzzle Validation', err.message || 'Validation failed.');
    } finally {
      setPuzzleValidating(false);
    }
  };

  // ----------------------------------------------------
  // DAILY QUIZ: Server-managed questions & grading
  // ----------------------------------------------------
  const startQuiz = async () => {
    try {
      setLoading(true);
      const res = await getQuizQuestionsApi();
      setQuizQuestions(res.questions || []);
      setCurrentQIndex(0);
      setSelectedAnswers({});
      setQuizResult(null);
    } catch (err: any) {
      Alert.alert('Daily Quiz', err.message || 'Failed to load quiz.');
      navigateToGame('NONE');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectQuizOption = (qId: string, optIndex: number) => {
    setSelectedAnswers((prev) => ({ ...prev, [qId]: optIndex }));
  };

  const handleSubmitQuiz = async () => {
    if (quizSubmitting) return;
    try {
      setQuizSubmitting(true);
      const res = await submitQuizAnswersApi(selectedAnswers);
      setQuizResult(res);
      await Promise.all([loadActivities(), fetchSummary()]);
    } catch (err: any) {
      Alert.alert('Quiz Submission Error', err.message || 'Failed to submit quiz.');
    } finally {
      setQuizSubmitting(false);
    }
  };

  // Interpolate wheel spin degrees
  const spinInterpolation = spinAngleAnim.interpolate({
    inputRange: [0, 36000],
    outputRange: ['0deg', '36000deg'],
  });

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <Header
        title="Play & Earn Arena"
        subtitle="Server-validated games with genuine integer points rewards"
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={THEME.colors.primary}
          />
        }
      >
        {loading ? (
          <View style={styles.loaderBox}>
            <ActivityIndicator size="large" color={THEME.colors.primary} />
            <Text style={styles.loaderText}>Loading live activities...</Text>
          </View>
        ) : activeGame === 'NONE' ? (
          <>
            {/* Conversion Banner */}
            <Card variant="gold" style={styles.rateBanner}>
              <Text style={styles.rateTitle}>Fair Rewards Engine</Text>
              <Text style={styles.rateDesc}>
                1,000 Points = USD $1.00. All game outcomes and limits are enforced by the server with transactional ledger crediting.
              </Text>
            </Card>

            <Text style={styles.sectionHeader}>Choose Activity</Text>

            <View style={styles.activitiesGrid}>
              {activities.map((act) => (
                <TouchableOpacity
                  key={act.activityType}
                  activeOpacity={0.8}
                  onPress={() => {
                    if (act.activityType === 'SPIN_WHEEL') {
                      navigateToGame('SPIN');
                    } else if (act.activityType === 'SCRATCH_CARD') {
                      resetScratchCard();
                      navigateToGame('SCRATCH');
                    } else if (act.activityType === 'NUMBER_PUZZLE') {
                      startPuzzle();
                      navigateToGame('PUZZLE');
                    } else if (act.activityType === 'QUIZ') {
                      startQuiz();
                      navigateToGame('QUIZ');
                    }
                  }}
                  style={styles.activityCard}
                >
                  <View style={styles.activityIconBox}>
                    <Text style={styles.activityIcon}>{act.icon}</Text>
                  </View>
                  <View style={styles.activityInfo}>
                    <View style={styles.activityHeaderRow}>
                      <Text style={styles.activityTitle}>{act.title}</Text>
                      <Text style={styles.limitPill}>
                        {act.attemptsRemainingToday}/{act.dailyLimit} left
                      </Text>
                    </View>
                    <Text style={styles.activityDesc} numberOfLines={2}>
                      {act.description}
                    </Text>
                    <Text style={styles.rewardText}>
                      Up to {act.maxPoints} pts ({formatUsd(act.maxPoints / 1000)})
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : (
          // Active Game View
          <View style={styles.gameContainer}>
            <TouchableOpacity
              onPress={() => navigateToGame('NONE')}
              style={styles.backBtn}
            >
              <Text style={styles.backBtnText}>← Back to Activities</Text>
            </TouchableOpacity>

            {/* 1. SPIN WHEEL */}
            {activeGame === 'SPIN' && (
              <Card variant="default" style={styles.gameCard}>
                <Text style={styles.gameTitle}>🎡 Lucky Spin Wheel</Text>
                <Text style={styles.gameSub}>
                  Spin to win up to {spinActivity?.maxPoints || 100} points. Server authoritatively chooses the outcome.
                </Text>

                <View style={styles.attemptsIndicator}>
                  <Text style={styles.attemptsText}>
                    Attempts Today: {spinActivity ? `${spinActivity.attemptsUsedToday}/${spinActivity.dailyLimit}` : ''}
                  </Text>
                </View>

                {/* SVG Radial Wheel */}
                <View style={styles.wheelWrapper}>
                  {/* Top Pointer Indicator */}
                  <View style={styles.pointerContainer}>
                    <View style={styles.wheelPointerArrow} />
                  </View>

                  <Animated.View
                    style={[
                      styles.wheelCircleContainer,
                      { transform: [{ rotate: spinInterpolation }] },
                    ]}
                  >
                    <Svg width={220} height={220} viewBox="0 0 220 220">
                      <G>
                        {spinSegments.map((pts, i) => {
                          const n = spinSegments.length;
                          const sliceDeg = 360 / n;
                          // Center of slice i is at i * sliceDeg - 90 deg (12 o'clock)
                          const startDeg = i * sliceDeg - sliceDeg / 2 - 90;
                          const endDeg = i * sliceDeg + sliceDeg / 2 - 90;
                          const startRad = (startDeg * Math.PI) / 180;
                          const endRad = (endDeg * Math.PI) / 180;
                          const cx = 110;
                          const cy = 110;
                          const r = 104;

                          const x1 = cx + r * Math.cos(startRad);
                          const y1 = cy + r * Math.sin(startRad);
                          const x2 = cx + r * Math.cos(endRad);
                          const y2 = cy + r * Math.sin(endRad);

                          const pathData = `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;

                          // Text position
                          const textRadius = 70;
                          const midRad = ((i * sliceDeg - 90) * Math.PI) / 180;
                          const tx = cx + textRadius * Math.cos(midRad);
                          const ty = cy + textRadius * Math.sin(midRad);

                          return (
                            <G key={i}>
                              <Path
                                d={pathData}
                                fill={SEGMENT_COLORS[i % SEGMENT_COLORS.length]}
                                stroke="#FFFFFF"
                                strokeWidth={2}
                              />
                              <SvgText
                                x={tx}
                                y={ty + 4}
                                fill="#FFFFFF"
                                fontSize="12"
                                fontWeight="bold"
                                textAnchor="middle"
                              >
                                {`${pts}`}
                              </SvgText>
                            </G>
                          );
                        })}

                        {/* Center Hub */}
                        <Circle cx={110} cy={110} r={24} fill="#FFFFFF" stroke="#DC2626" strokeWidth={3} />
                        <Circle cx={110} cy={110} r={18} fill="#DC2626" />
                        <SvgText
                          x={110}
                          y={114}
                          fill="#FFFFFF"
                          fontSize="9"
                          fontWeight="900"
                          textAnchor="middle"
                        >
                          SPIN
                        </SvgText>
                      </G>
                    </Svg>
                  </Animated.View>
                </View>

                {spinResult && (
                  <View style={styles.resultBox}>
                    <Text style={styles.resultText}>{spinResult}</Text>
                  </View>
                )}

                <Button
                  title={
                    isSpinning
                      ? 'Spinning...'
                      : spinActivity && spinActivity.attemptsRemainingToday <= 0
                      ? 'Daily Limit Reached'
                      : 'SPIN WHEEL'
                  }
                  onPress={handleSpin}
                  variant="primary"
                  size="lg"
                  disabled={isSpinning || (spinActivity ? spinActivity.attemptsRemainingToday <= 0 : false)}
                  style={styles.actionBtn}
                />
              </Card>
            )}

            {/* 2. SCRATCH CARD */}
            {activeGame === 'SCRATCH' && (
              <Card variant="default" style={styles.gameCard}>
                <Text style={styles.gameTitle}>✨ Golden Scratch Card</Text>
                <Text style={styles.gameSub}>
                  Rub or tap the foil cells to reveal your server-generated cash reward!
                </Text>

                <View style={styles.attemptsIndicator}>
                  <Text style={styles.attemptsText}>
                    Attempts Today: {scratchActivity ? `${scratchActivity.attemptsUsedToday}/${scratchActivity.dailyLimit}` : ''}
                  </Text>
                </View>

                <View style={styles.scratchCanvasContainer}>
                  {scratchedCard ? (
                    <View style={styles.scratchRewardRevealed}>
                      <Text style={styles.scratchRewardEmoji}>🎉</Text>
                      <Text style={styles.scratchRewardTitle}>REWARD REVEALED!</Text>
                      <Text style={styles.scratchRewardPoints}>
                        +{scratchedCard.revealedPoints} Points
                      </Text>
                      <Text style={styles.scratchRewardUsd}>
                        ({formatUsd(scratchedCard.usdValue)} USD)
                      </Text>
                      <Text style={styles.scratchRewardSub}>
                        Persisted in your transaction ledger
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.scratchFoilGrid}>
                      {scratchedPatches.map((isPatchScratched, pIdx) => (
                        <TouchableOpacity
                          key={pIdx}
                          activeOpacity={0.7}
                          onPress={() => handlePatchScratch(pIdx)}
                          disabled={isScratching || (scratchActivity ? scratchActivity.attemptsRemainingToday <= 0 : false)}
                          style={[
                            styles.scratchPatch,
                            isPatchScratched ? styles.scratchPatchRevealed : styles.scratchPatchFoil,
                          ]}
                        >
                          <Text style={styles.scratchPatchText}>
                            {isPatchScratched ? '✨' : '⭐'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                {isScratching ? (
                  <View style={styles.scratchingLoader}>
                    <ActivityIndicator size="small" color={THEME.colors.primary} />
                    <Text style={styles.scratchingText}>Revealing server outcome...</Text>
                  </View>
                ) : null}

                {!scratchedCard && (
                  <Button
                    title={
                      scratchActivity && scratchActivity.attemptsRemainingToday <= 0
                        ? 'Daily Limit Reached'
                        : 'Tap to Reveal Reward'
                    }
                    onPress={triggerScratchReveal}
                    variant="primary"
                    size="md"
                    disabled={isScratching || (scratchActivity ? scratchActivity.attemptsRemainingToday <= 0 : false)}
                    style={styles.actionBtn}
                  />
                )}

                {scratchedCard && (
                  <Button
                    title="Done"
                    onPress={() => navigateToGame('NONE')}
                    variant="primary"
                    size="md"
                    style={styles.actionBtn}
                  />
                )}
              </Card>
            )}

            {/* 3. NUMBER PUZZLE */}
            {activeGame === 'PUZZLE' && (
              <Card variant="default" style={styles.gameCard}>
                <Text style={styles.gameTitle}>🧩 3x3 Sliding Puzzle</Text>
                <Text style={styles.gameSub}>
                  Slide numbers into ascending order [1 to 8, empty].
                </Text>

                <View style={styles.puzzleStatsRow}>
                  <Text style={styles.puzzleStat}>Moves: {puzzleMoves}</Text>
                  <Text style={styles.puzzleStat}>
                    Reward: {puzzleActivity?.maxPoints || 25} pts
                  </Text>
                </View>

                <View style={styles.puzzleGrid}>
                  {board.map((tile, idx) => (
                    <TouchableOpacity
                      key={idx}
                      activeOpacity={0.7}
                      onPress={() => handleTilePress(idx)}
                      disabled={tile === 0 || puzzleSolved || puzzleValidating}
                      style={[
                        styles.puzzleTile,
                        tile === 0 ? styles.puzzleTileEmpty : styles.puzzleTileNumber,
                      ]}
                    >
                      <Text style={styles.puzzleTileText}>
                        {tile === 0 ? '' : tile}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {puzzleValidating ? (
                  <View style={styles.resultBox}>
                    <ActivityIndicator size="small" color={THEME.colors.primary} />
                    <Text style={styles.resultText}>Validating solution on server...</Text>
                  </View>
                ) : null}

                <Button
                  title="Reset Scramble"
                  onPress={startPuzzle}
                  variant="secondary"
                  size="sm"
                  style={styles.actionBtn}
                />
              </Card>
            )}

            {/* 4. DAILY QUIZ */}
            {activeGame === 'QUIZ' && (
              <Card variant="default" style={styles.gameCard}>
                <Text style={styles.gameTitle}>🧠 Daily Mind Quiz</Text>
                {quizResult ? (
                  <View style={styles.resultBox}>
                    <Text style={styles.resultHeader}>Quiz Graded!</Text>
                    <Text style={styles.resultText}>{quizResult.message}</Text>
                    <Button
                      title="Finish"
                      onPress={() => navigateToGame('NONE')}
                      variant="primary"
                      size="md"
                      style={styles.actionBtn}
                    />
                  </View>
                ) : quizQuestions.length > 0 ? (
                  <View style={styles.quizWrapper}>
                    <Text style={styles.quizProgress}>
                      Question {currentQIndex + 1} of {quizQuestions.length}
                    </Text>
                    <Text style={styles.quizQuestion}>
                      {quizQuestions[currentQIndex]?.question}
                    </Text>

                    <View style={styles.optionsList}>
                      {quizQuestions[currentQIndex]?.options.map((opt, optIdx) => {
                        const qId = quizQuestions[currentQIndex].id;
                        const isSelected = selectedAnswers[qId] === optIdx;
                        return (
                          <TouchableOpacity
                            key={optIdx}
                            activeOpacity={0.8}
                            onPress={() => handleSelectQuizOption(qId, optIdx)}
                            style={[
                              styles.quizOptionBtn,
                              isSelected && styles.quizOptionSelected,
                            ]}
                          >
                            <Text
                              style={[
                                styles.quizOptionText,
                                isSelected && styles.quizOptionTextSelected,
                              ]}
                            >
                              {opt}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <View style={styles.quizNavRow}>
                      {currentQIndex < quizQuestions.length - 1 ? (
                        <Button
                          title="Next →"
                          onPress={() => setCurrentQIndex((i) => i + 1)}
                          variant="primary"
                          size="md"
                          style={{ flex: 1 }}
                        />
                      ) : (
                        <Button
                          title={quizSubmitting ? 'Grading...' : 'Submit Answers'}
                          onPress={handleSubmitQuiz}
                          variant="primary"
                          size="md"
                          disabled={quizSubmitting}
                          style={{ flex: 1 }}
                        />
                      )}
                    </View>
                  </View>
                ) : (
                  <Text style={styles.emptyText}>No questions available today.</Text>
                )}
              </Card>
            )}
          </View>
        )}
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
  loaderBox: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderText: {
    marginTop: 12,
    fontSize: 13,
    color: THEME.colors.textSecondary,
  },
  rateBanner: {
    padding: THEME.spacing.lg,
    marginBottom: 20,
  },
  rateTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 4,
  },
  rateDesc: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 12,
  },
  activitiesGrid: {
    gap: 12,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surface,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  activityIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activityIcon: {
    fontSize: 24,
  },
  activityInfo: {
    flex: 1,
  },
  activityHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  limitPill: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.primary,
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  activityDesc: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    lineHeight: 16,
    marginBottom: 4,
  },
  rewardText: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.emerald,
  },
  gameContainer: {
    gap: 16,
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  gameCard: {
    padding: THEME.spacing.lg,
    alignItems: 'center',
  },
  gameTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
    marginBottom: 4,
  },
  gameSub: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  attemptsIndicator: {
    backgroundColor: 'rgba(220, 38, 38, 0.06)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 16,
  },
  attemptsText: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  wheelWrapper: {
    width: 230,
    height: 230,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  pointerContainer: {
    position: 'absolute',
    top: -6,
    zIndex: 10,
    alignItems: 'center',
  },
  wheelPointerArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 16,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#DC2626',
  },
  wheelCircleContainer: {
    width: 220,
    height: 220,
    borderRadius: 110,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  scratchCanvasContainer: {
    width: 260,
    height: 160,
    borderRadius: 16,
    overflow: 'hidden',
    marginVertical: 14,
    backgroundColor: '#FFFBEB',
    borderWidth: 2,
    borderColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scratchFoilGrid: {
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#D97706',
  },
  scratchPatch: {
    width: '33.33%',
    height: '33.33%',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: '#B45309',
  },
  scratchPatchFoil: {
    backgroundColor: '#D97706',
  },
  scratchPatchRevealed: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  scratchPatchText: {
    fontSize: 16,
  },
  scratchRewardRevealed: {
    padding: 12,
    alignItems: 'center',
  },
  scratchRewardEmoji: {
    fontSize: 32,
    marginBottom: 4,
  },
  scratchRewardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400E',
    letterSpacing: 1,
  },
  scratchRewardPoints: {
    fontSize: 22,
    fontWeight: '900',
    color: THEME.colors.emerald,
    marginTop: 2,
  },
  scratchRewardUsd: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    fontWeight: '700',
  },
  scratchRewardSub: {
    fontSize: 10,
    color: THEME.colors.textSecondary,
    marginTop: 4,
  },
  scratchingLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  scratchingText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
  },
  puzzleStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  puzzleStat: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  puzzleGrid: {
    width: 240,
    height: 240,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 12,
  },
  puzzleTile: {
    width: 74,
    height: 74,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  puzzleTileNumber: {
    backgroundColor: THEME.colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  puzzleTileEmpty: {
    backgroundColor: 'transparent',
  },
  puzzleTileText: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '900',
  },
  quizWrapper: {
    width: '100%',
  },
  quizProgress: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.primary,
    marginBottom: 6,
  },
  quizQuestion: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    lineHeight: 22,
    marginBottom: 16,
  },
  optionsList: {
    gap: 10,
    marginBottom: 20,
  },
  quizOptionBtn: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
  },
  quizOptionSelected: {
    borderColor: THEME.colors.primary,
    backgroundColor: 'rgba(220, 38, 38, 0.05)',
  },
  quizOptionText: {
    fontSize: 13,
    color: THEME.colors.textPrimary,
    fontWeight: '600',
  },
  quizOptionTextSelected: {
    color: THEME.colors.primary,
    fontWeight: '800',
  },
  quizNavRow: {
    flexDirection: 'row',
    gap: 10,
  },
  resultBox: {
    width: '100%',
    padding: 14,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
    alignItems: 'center',
    marginVertical: 12,
  },
  resultHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.emerald,
    marginBottom: 4,
  },
  resultText: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    marginVertical: 20,
  },
  actionBtn: {
    width: '100%',
    marginTop: 8,
  },
});
