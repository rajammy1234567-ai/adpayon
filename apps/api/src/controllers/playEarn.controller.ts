import { Request, Response } from 'express';
import { PlayEarnConfig, PlayEarnAttempt, PlayEarnActivityType } from '../models/PlayEarn';
import { WalletLedgerEntry } from '../models/WalletLedgerEntry';
import { pointsToUsd, pointsToPaise } from '@adpayon/shared';
import mongoose from 'mongoose';

function getTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

// Default initial configs if not in DB
const DEFAULT_CONFIGS: Record<PlayEarnActivityType, {
  title: string;
  description: string;
  dailyLimit: number;
  minPoints: number;
  maxPoints: number;
  spinSegments?: number[];
  quizQuestions?: any[];
  puzzleConfig?: any;
}> = {
  SPIN_WHEEL: {
    title: 'Lucky Spin Wheel',
    description: 'Spin the wheel daily to win mystery reward points!',
    dailyLimit: 3,
    minPoints: 5,
    maxPoints: 100,
    spinSegments: [5, 10, 15, 20, 25, 50, 75, 100],
  },
  SCRATCH_CARD: {
    title: 'Golden Scratch Card',
    description: 'Rub cards to reveal surprise cash gift points!',
    dailyLimit: 2,
    minPoints: 10,
    maxPoints: 150,
  },
  NUMBER_PUZZLE: {
    title: 'Sliding Number Puzzle',
    description: 'Solve the 3x3 sliding numbers puzzle in minimum moves!',
    dailyLimit: 2,
    minPoints: 25,
    maxPoints: 25,
    puzzleConfig: { rewardPoints: 25, timeLimitSeconds: 120 },
  },
  QUIZ: {
    title: 'Daily Mind Quiz',
    description: 'Answer questions correctly to earn bonus points!',
    dailyLimit: 1,
    minPoints: 30,
    maxPoints: 30,
    quizQuestions: [
      {
        id: 'q1',
        question: 'What is the points to USD conversion rate on AdPayOn?',
        options: ['100 pts = $1', '500 pts = $1', '1,000 pts = $1', '10,000 pts = $1'],
        correctOptionIndex: 2,
        rewardPoints: 10,
      },
      {
        id: 'q2',
        question: 'What is the minimum withdrawal threshold on AdPayOn?',
        options: ['1,000 pts ($1.00)', '2,500 pts ($2.50)', '5,000 pts ($5.00)', '10,000 pts ($10.00)'],
        correctOptionIndex: 2,
        rewardPoints: 10,
      },
      {
        id: 'q3',
        question: 'Which network is supported for USDT cryptocurrency payouts?',
        options: ['TRC20', 'BEP20 (BNB Smart Chain)', 'ERC20', 'Solana'],
        correctOptionIndex: 1,
        rewardPoints: 10,
      },
    ],
  },
};

async function getOrInitConfig(type: PlayEarnActivityType) {
  let config = await PlayEarnConfig.findOne({ activityType: type });
  if (!config) {
    const defaults = DEFAULT_CONFIGS[type];
    config = new PlayEarnConfig({
      activityType: type,
      title: defaults.title,
      description: defaults.description,
      dailyLimit: defaults.dailyLimit,
      minPoints: defaults.minPoints,
      maxPoints: defaults.maxPoints,
      enabled: true,
      spinSegments: defaults.spinSegments,
      quizQuestions: defaults.quizQuestions,
      puzzleConfig: defaults.puzzleConfig,
    });
    await config.save();
  }
  return config;
}

// User: Get all activities and current daily limits
export async function getActivitiesStatus(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id;
    if (!userId) {
      res.status(401).json({ success: false, error: { message: 'Authentication required' } });
      return;
    }

    const todayStr = getTodayString();
    const activityTypes: PlayEarnActivityType[] = ['SPIN_WHEEL', 'SCRATCH_CARD', 'NUMBER_PUZZLE', 'QUIZ'];

    const activities = await Promise.all(
      activityTypes.map(async (type) => {
        const config = await getOrInitConfig(type);
        const usedCount = await PlayEarnAttempt.countDocuments({
          userId,
          activityType: type,
          date: todayStr,
        });

        const latestAttempt = await PlayEarnAttempt.findOne({
          userId,
          activityType: type,
          date: todayStr,
        }).sort({ createdAt: -1 });

        const icons: Record<PlayEarnActivityType, string> = {
          SPIN_WHEEL: '🎡',
          SCRATCH_CARD: '✨',
          NUMBER_PUZZLE: '🧩',
          QUIZ: '🧠',
        };

        return {
          activityType: type,
          title: config.title,
          description: config.description,
          icon: icons[type],
          dailyLimit: config.dailyLimit,
          attemptsUsedToday: usedCount,
          attemptsRemainingToday: Math.max(0, config.dailyLimit - usedCount),
          minPoints: config.minPoints,
          maxPoints: config.maxPoints,
          enabled: config.enabled,
          spinSegments: config.spinSegments && config.spinSegments.length > 0 ? config.spinSegments : [5, 10, 15, 20, 25, 50, 75, 100],
          latestAttempt: latestAttempt
            ? {
                pointsAwarded: latestAttempt.pointsAwarded,
                usdValue: latestAttempt.usdValue,
                status: latestAttempt.status,
                metadata: latestAttempt.metadata,
                createdAt: latestAttempt.createdAt,
              }
            : null,
        };
      })
    );

    res.json({ success: true, data: activities });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message || 'Internal server error' } });
  }
}

// User: Play Spin Wheel (Server-determined outcome)
export async function spinWheel(req: Request, res: Response): Promise<void> {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = (req as any).user?.id || (req as any).user?._id;
    if (!userId) {
      await session.abortTransaction();
      res.status(401).json({ success: false, error: { message: 'Authentication required' } });
      return;
    }

    const todayStr = getTodayString();
    const config = await getOrInitConfig('SPIN_WHEEL');

    if (!config.enabled) {
      await session.abortTransaction();
      res.status(400).json({ success: false, error: { message: 'Spin wheel is currently disabled.' } });
      return;
    }

    const usedCount = await PlayEarnAttempt.countDocuments({
      userId,
      activityType: 'SPIN_WHEEL',
      date: todayStr,
    }).session(session);

    if (usedCount >= config.dailyLimit) {
      await session.abortTransaction();
      res.status(429).json({
        success: false,
        error: { message: `Daily spin limit reached (${config.dailyLimit}/${config.dailyLimit}). Come back tomorrow!` },
      });
      return;
    }

    const segments = config.spinSegments && config.spinSegments.length > 0
      ? config.spinSegments
      : [5, 10, 15, 20, 25, 50, 75, 100];

    // Server determines the segment index
    const segmentIndex = Math.floor(Math.random() * segments.length);
    const pointsAwarded = segments[segmentIndex];
    const usdValue = pointsToUsd(pointsAwarded);
    const attemptNumber = usedCount + 1;

    const attempt = new PlayEarnAttempt({
      userId,
      activityType: 'SPIN_WHEEL',
      date: todayStr,
      attemptNumber,
      pointsAwarded,
      usdValue,
      status: 'PENDING_REVIEW',
      metadata: { segmentIndex, totalSegments: segments.length },
    });
    await attempt.save({ session });

    await session.commitTransaction();

    res.json({
      success: true,
      data: {
        attemptId: attempt._id.toString(),
        segmentIndex,
        pointsAwarded,
        usdValue,
        status: 'PENDING_REVIEW',
        message: `Congratulations! You won ${pointsAwarded} points ($${usdValue.toFixed(3)} USD)! (Submitted for review)`,
        remainingAttempts: Math.max(0, config.dailyLimit - attemptNumber),
      },
    });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(500).json({ success: false, error: { message: error.message || 'Spin wheel failed' } });
  } finally {
    session.endSession();
  }
}

// User: Scratch Card (Server-determined reward)
export async function scratchCard(req: Request, res: Response): Promise<void> {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = (req as any).user?.id || (req as any).user?._id;
    if (!userId) {
      await session.abortTransaction();
      res.status(401).json({ success: false, error: { message: 'Authentication required' } });
      return;
    }

    const todayStr = getTodayString();
    const config = await getOrInitConfig('SCRATCH_CARD');

    if (!config.enabled) {
      await session.abortTransaction();
      res.status(400).json({ success: false, error: { message: 'Scratch card is currently disabled.' } });
      return;
    }

    const usedCount = await PlayEarnAttempt.countDocuments({
      userId,
      activityType: 'SCRATCH_CARD',
      date: todayStr,
    }).session(session);

    if (usedCount >= config.dailyLimit) {
      await session.abortTransaction();
      res.status(429).json({
        success: false,
        error: { message: `Daily scratch card limit reached (${config.dailyLimit}/${config.dailyLimit}).` },
      });
      return;
    }

    // Determine random points within range
    const min = config.minPoints || 10;
    const max = config.maxPoints || 100;
    const pointsAwarded = Math.floor(Math.random() * (max - min + 1)) + min;
    const usdValue = pointsToUsd(pointsAwarded);
    const attemptNumber = usedCount + 1;

    const attempt = new PlayEarnAttempt({
      userId,
      activityType: 'SCRATCH_CARD',
      date: todayStr,
      attemptNumber,
      pointsAwarded,
      usdValue,
      status: 'PENDING_REVIEW',
      metadata: { min, max },
    });
    await attempt.save({ session });

    await session.commitTransaction();

    res.json({
      success: true,
      data: {
        cardId: attempt._id.toString(),
        revealedPoints: pointsAwarded,
        usdValue,
        isRevealed: true,
        status: 'PENDING_REVIEW',
        message: `Scratch reward revealed (+${pointsAwarded} points / $${usdValue.toFixed(3)} USD) and submitted for verification.`,
        remainingAttempts: Math.max(0, config.dailyLimit - attemptNumber),
      },
    });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(500).json({ success: false, error: { message: error.message || 'Scratch card failed' } });
  } finally {
    session.endSession();
  }
}

// User: Validate Sliding Number Puzzle (Server-validated solution)
export async function validatePuzzle(req: Request, res: Response): Promise<void> {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = (req as any).user?.id || (req as any).user?._id;
    if (!userId) {
      await session.abortTransaction();
      res.status(401).json({ success: false, error: { message: 'Authentication required' } });
      return;
    }

    const { finalBoard, moves, elapsedSeconds } = req.body;
    const todayStr = getTodayString();
    const config = await getOrInitConfig('NUMBER_PUZZLE');

    if (!config.enabled) {
      await session.abortTransaction();
      res.status(400).json({ success: false, error: { message: 'Number puzzle is currently disabled.' } });
      return;
    }

    const usedCount = await PlayEarnAttempt.countDocuments({
      userId,
      activityType: 'NUMBER_PUZZLE',
      date: todayStr,
    }).session(session);

    if (usedCount >= config.dailyLimit) {
      await session.abortTransaction();
      res.status(429).json({
        success: false,
        error: { message: `Daily puzzle limit reached (${config.dailyLimit}/${config.dailyLimit}).` },
      });
      return;
    }

    // Server-side validation of solved target: [1, 2, 3, 4, 5, 6, 7, 8, 0]
    const target = [1, 2, 3, 4, 5, 6, 7, 8, 0];
    const isSolved = Array.isArray(finalBoard) &&
      finalBoard.length === 9 &&
      finalBoard.every((val, idx) => val === target[idx]);

    if (!isSolved) {
      await session.abortTransaction();
      res.status(400).json({
        success: false,
        error: { message: 'Invalid puzzle state: The puzzle has not been completely solved.' },
      });
      return;
    }

    if (!moves || moves < 1 || !elapsedSeconds || elapsedSeconds < 1) {
      await session.abortTransaction();
      res.status(400).json({
        success: false,
        error: { message: 'Invalid puzzle completion metrics.' },
      });
      return;
    }

    const pointsAwarded = config.puzzleConfig?.rewardPoints || 25;
    const usdValue = pointsToUsd(pointsAwarded);
    const attemptNumber = usedCount + 1;

    const attempt = new PlayEarnAttempt({
      userId,
      activityType: 'NUMBER_PUZZLE',
      date: todayStr,
      attemptNumber,
      pointsAwarded,
      usdValue,
      status: 'PENDING_REVIEW',
      metadata: { moves, elapsedSeconds },
    });
    await attempt.save({ session });

    await session.commitTransaction();

    res.json({
      success: true,
      data: {
        attemptId: attempt._id.toString(),
        pointsAwarded,
        usdValue,
        status: 'PENDING_REVIEW',
        message: `Great job! Puzzle solved in ${moves} moves. +${pointsAwarded} points ($${usdValue.toFixed(3)} USD) submitted for review.`,
        remainingAttempts: Math.max(0, config.dailyLimit - attemptNumber),
      },
    });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(500).json({ success: false, error: { message: error.message || 'Puzzle validation failed' } });
  } finally {
    session.endSession();
  }
}

// User: Get Quiz Questions (excludes correct answer index)
export async function getQuizQuestions(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id;
    if (!userId) {
      res.status(401).json({ success: false, error: { message: 'Authentication required' } });
      return;
    }

    const todayStr = getTodayString();
    const config = await getOrInitConfig('QUIZ');

    const usedCount = await PlayEarnAttempt.countDocuments({
      userId,
      activityType: 'QUIZ',
      date: todayStr,
    });

    if (usedCount >= config.dailyLimit) {
      res.status(429).json({
        success: false,
        error: { message: `Daily quiz limit reached (${config.dailyLimit}/${config.dailyLimit}).` },
      });
      return;
    }

    const questions = (config.quizQuestions || []).map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options,
      rewardPoints: q.rewardPoints,
    }));

    res.json({
      success: true,
      data: {
        questions,
        remainingAttempts: Math.max(0, config.dailyLimit - usedCount),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}

// User: Submit Quiz (Server-side answer validation & grading)
export async function submitQuizAnswers(req: Request, res: Response): Promise<void> {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = (req as any).user?.id || (req as any).user?._id;
    if (!userId) {
      await session.abortTransaction();
      res.status(401).json({ success: false, error: { message: 'Authentication required' } });
      return;
    }

    const { answers } = req.body; // Map of questionId -> selectedIndex
    if (!answers || typeof answers !== 'object') {
      await session.abortTransaction();
      res.status(400).json({ success: false, error: { message: 'Answers object is required' } });
      return;
    }

    const todayStr = getTodayString();
    const config = await getOrInitConfig('QUIZ');

    const usedCount = await PlayEarnAttempt.countDocuments({
      userId,
      activityType: 'QUIZ',
      date: todayStr,
    }).session(session);

    if (usedCount >= config.dailyLimit) {
      await session.abortTransaction();
      res.status(429).json({
        success: false,
        error: { message: `Daily quiz limit reached (${config.dailyLimit}/${config.dailyLimit}).` },
      });
      return;
    }

    const questions = config.quizQuestions || [];
    let correctCount = 0;
    let earnedPoints = 0;

    for (const q of questions) {
      const selectedIndex = answers[q.id];
      if (selectedIndex !== undefined && selectedIndex === q.correctOptionIndex) {
        correctCount++;
        earnedPoints += q.rewardPoints || 10;
      }
    }

    const usdValue = pointsToUsd(earnedPoints);
    const attemptNumber = usedCount + 1;

    const attempt = new PlayEarnAttempt({
      userId,
      activityType: 'QUIZ',
      date: todayStr,
      attemptNumber,
      pointsAwarded: earnedPoints,
      usdValue,
      status: 'PENDING_REVIEW',
      metadata: { correctCount, totalQuestions: questions.length },
    });
    await attempt.save({ session });

    await session.commitTransaction();

    res.json({
      success: true,
      data: {
        attemptId: attempt._id.toString(),
        correctCount,
        totalQuestions: questions.length,
        pointsAwarded: earnedPoints,
        usdValue,
        status: 'PENDING_REVIEW',
        message: `Quiz completed! Score: ${correctCount}/${questions.length}. +${earnedPoints} points ($${usdValue.toFixed(3)} USD) submitted for review.`,
        remainingAttempts: Math.max(0, config.dailyLimit - attemptNumber),
      },
    });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(500).json({ success: false, error: { message: error.message || 'Quiz submission failed' } });
  } finally {
    session.endSession();
  }
}

// Admin: Get all play & earn configs
export async function adminGetConfigs(req: Request, res: Response): Promise<void> {
  try {
    const activityTypes: PlayEarnActivityType[] = ['SPIN_WHEEL', 'SCRATCH_CARD', 'NUMBER_PUZZLE', 'QUIZ'];
    const configs = await Promise.all(activityTypes.map((t) => getOrInitConfig(t)));
    res.json({ success: true, data: configs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}

// Admin: Update config for an activity
export async function adminUpdateConfig(req: Request, res: Response): Promise<void> {
  try {
    const { activityType } = req.params;
    const { dailyLimit, minPoints, maxPoints, enabled, spinSegments, quizQuestions, puzzleConfig } = req.body;

    const config: any = await PlayEarnConfig.findOne({ activityType: activityType as PlayEarnActivityType });
    if (!config) {
      res.status(404).json({ success: false, error: { message: 'Config not found' } });
      return;
    }

    if (dailyLimit !== undefined) config.dailyLimit = Number(dailyLimit);
    if (minPoints !== undefined) config.minPoints = Number(minPoints);
    if (maxPoints !== undefined) config.maxPoints = Number(maxPoints);
    if (enabled !== undefined) config.enabled = Boolean(enabled);
    if (spinSegments !== undefined) config.spinSegments = spinSegments;
    if (quizQuestions !== undefined) config.quizQuestions = quizQuestions;
    if (puzzleConfig !== undefined) config.puzzleConfig = puzzleConfig;

    await config.save();
    res.json({ success: true, data: config });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}

// Admin: List play & earn attempts with status filter
export async function adminListAttempts(req: Request, res: Response): Promise<void> {
  try {
    const { status, activityType, page = 1, limit = 20 } = req.query;
    const filter: any = {};
    if (status) filter.status = status;
    if (activityType) filter.activityType = activityType;

    const skip = (Number(page) - 1) * Number(limit);
    const [attempts, total] = await Promise.all([
      PlayEarnAttempt.find(filter)
        .populate('userId', 'name mobile')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      PlayEarnAttempt.countDocuments(filter),
    ]);

    res.json({ success: true, data: { attempts, total, page: Number(page), limit: Number(limit) } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}

// Admin: Review and approve/reject a play & earn attempt
export async function adminReviewAttempt(req: Request, res: Response): Promise<void> {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const adminId = (req as any).admin?.id || (req as any).admin?._id || (req as any).user?.id || (req as any).user?._id;
    const { id } = req.params;
    const { decision, adminNotes, rejectionReason } = req.body;

    if (!['APPROVE', 'REJECT'].includes(decision)) {
      await session.abortTransaction();
      res.status(400).json({ success: false, error: { message: 'Decision must be APPROVE or REJECT' } });
      return;
    }

    const attempt = await PlayEarnAttempt.findOne({ _id: id, status: 'PENDING_REVIEW' }).session(session);
    if (!attempt) {
      await session.abortTransaction();
      res.status(409).json({ success: false, error: { message: 'Attempt not found or has already been reviewed.' } });
      return;
    }

    if (decision === 'APPROVE') {
      attempt.status = 'COMPLETED';
      attempt.metadata = {
        ...(attempt.metadata || {}),
        reviewedBy: adminId,
        reviewNotes: adminNotes,
        reviewedAt: new Date(),
      };
      await attempt.save({ session });

      if (attempt.pointsAwarded > 0) {
        const idempotencyKey = `PLAY_EARN_APPROVE_${attempt._id}`;
        const ledger = new WalletLedgerEntry({
          userId: attempt.userId,
          entryType: 'TASK_REWARD',
          amountPaise: 0,
          pointsEquivalent: attempt.pointsAwarded,
          status: 'CONFIRMED',
          referenceEntity: 'PlayEarnAttempt',
          referenceId: attempt._id,
          idempotencyKey,
          notes: `${attempt.activityType} Reward Approved (+${attempt.pointsAwarded} pts)`,
          metadata: {
            activity: attempt.activityType,
            rewardPolicy: 'REDEEMABLE_V1',
            currency: 'USD',
            points: attempt.pointsAwarded,
            usd: attempt.usdValue,
            reviewedBy: adminId,
          },
        });
        await ledger.save({ session });
      }
    } else {
      attempt.status = 'REJECTED';
      attempt.metadata = {
        ...(attempt.metadata || {}),
        reviewedBy: adminId,
        rejectionReason: rejectionReason || adminNotes || 'Rejected by admin verification',
        reviewedAt: new Date(),
      };
      await attempt.save({ session });
    }

    await session.commitTransaction();

    res.json({
      success: true,
      data: {
        id: attempt._id,
        status: attempt.status,
        pointsAwarded: decision === 'APPROVE' ? attempt.pointsAwarded : 0,
        usdValue: decision === 'APPROVE' ? attempt.usdValue : 0,
        rejectionReason: decision === 'REJECT' ? attempt.metadata?.rejectionReason : undefined,
        message: decision === 'APPROVE'
          ? `Attempt approved! +${attempt.pointsAwarded} points ($${attempt.usdValue.toFixed(3)} USD) credited.`
          : `Attempt rejected: ${attempt.metadata?.rejectionReason}. Zero points credited.`,
      },
    });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(500).json({ success: false, error: { message: error.message } });
  } finally {
    session.endSession();
  }
}
