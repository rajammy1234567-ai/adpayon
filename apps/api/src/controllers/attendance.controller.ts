import { Request, Response } from 'express';
import { AttendanceRecord } from '../models/AttendanceRecord';
import { User } from '../models/User';
import { WalletLedgerEntry } from '../models/WalletLedgerEntry';
import { POINTS_PER_USD, pointsToUsd, pointsToPaise } from '@adpayon/shared';
import mongoose from 'mongoose';

// Standard 7-day reward cycle in integer points (1,000 pts = $1 USD)
const CYCLE_REWARDS = [10, 20, 30, 50, 75, 100, 250];

function getTodayString(): string {
  // Use UTC YYYY-MM-DD for consistency
  return new Date().toISOString().slice(0, 10);
}

function getYesterdayString(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function getAttendanceStatus(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.id || (req as any).user?._id;
    if (!userId) {
      res.status(401).json({ success: false, error: { message: 'Authentication required' } });
      return;
    }

    const todayStr = getTodayString();
    const yesterdayStr = getYesterdayString();

    const [todayRecord, yesterdayRecord, userRecord] = await Promise.all([
      AttendanceRecord.findOne({ userId, date: todayStr }),
      AttendanceRecord.findOne({ userId, date: yesterdayStr }),
      User.findById(userId).select('streakCount'),
    ]);

    const claimedToday = !!todayRecord;
    let currentStreak = userRecord?.streakCount || 0;

    // If user missed yesterday and hasn't claimed today, their active streak has broken
    if (!claimedToday && !yesterdayRecord && currentStreak > 0) {
      currentStreak = 0;
    }

    // Determine current day in the 7-day cycle (1 to 7)
    let dayOfCycle = 1;
    if (claimedToday && todayRecord) {
      dayOfCycle = todayRecord.dayOfCycle;
    } else if (yesterdayRecord) {
      dayOfCycle = (yesterdayRecord.dayOfCycle % 7) + 1;
    } else {
      dayOfCycle = 1;
    }

    const cycleDays = CYCLE_REWARDS.map((points, index) => {
      const dayNum = index + 1;
      const isClaimed = claimedToday ? dayNum <= dayOfCycle : dayNum < dayOfCycle;
      const isToday = dayNum === dayOfCycle;
      const isLocked = dayNum > dayOfCycle;
      return {
        day: dayNum,
        points,
        usdValue: pointsToUsd(points),
        isClaimed,
        isToday,
        isLocked,
      };
    });

    const todayPoints = CYCLE_REWARDS[dayOfCycle - 1];

    res.json({
      success: true,
      data: {
        currentStreak,
        claimedToday,
        dayOfCycle,
        cycleDays,
        todayPoints,
        todayUsd: pointsToUsd(todayPoints),
        canClaim: !claimedToday,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message || 'Internal server error' } });
  }
}

export async function claimAttendance(req: Request, res: Response): Promise<void> {
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
    const yesterdayStr = getYesterdayString();

    // Check if already claimed today (server-side authority)
    const existingToday = await AttendanceRecord.findOne({ userId, date: todayStr }).session(session);
    if (existingToday) {
      await session.abortTransaction();
      res.status(409).json({
        success: false,
        error: { message: "Today's attendance reward has already been claimed." },
      });
      return;
    }

    const [yesterdayRecord, user] = await Promise.all([
      AttendanceRecord.findOne({ userId, date: yesterdayStr }).session(session),
      User.findById(userId).session(session),
    ]);

    if (!user) {
      await session.abortTransaction();
      res.status(404).json({ success: false, error: { message: 'User not found' } });
      return;
    }

    let newStreak = 1;
    let dayOfCycle = 1;

    if (yesterdayRecord) {
      newStreak = (user.streakCount || 0) + 1;
      dayOfCycle = (yesterdayRecord.dayOfCycle % 7) + 1;
    } else {
      newStreak = 1;
      dayOfCycle = 1;
    }

    const pointsAwarded = CYCLE_REWARDS[dayOfCycle - 1];
    const usdValue = pointsToUsd(pointsAwarded);

    // Create attendance record with PENDING_REVIEW
    const attendanceDoc = new AttendanceRecord({
      userId,
      date: todayStr,
      dayOfCycle,
      pointsAwarded,
      usdValue,
      status: 'PENDING_REVIEW',
      claimedAt: new Date(),
    });
    await attendanceDoc.save({ session });

    // Update user streak
    user.streakCount = newStreak;
    await user.save({ session });

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      data: {
        recordId: attendanceDoc._id.toString(),
        message: `Attendance claimed! +${pointsAwarded} points ($${usdValue.toFixed(3)} USD) submitted for review.`,
        currentStreak: newStreak,
        dayOfCycle,
        pointsAwarded,
        usdValue,
        status: 'PENDING_REVIEW',
        claimedToday: true,
      },
    });
  } catch (error: any) {
    await session.abortTransaction();
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        error: { message: "Today's attendance reward has already been claimed." },
      });
      return;
    }
    res.status(500).json({ success: false, error: { message: error.message || 'Failed to claim attendance' } });
  } finally {
    session.endSession();
  }
}

// Admin: List attendance records
export async function adminListAttendance(req: Request, res: Response): Promise<void> {
  try {
    const { status, date, page = 1, limit = 20 } = req.query;
    const filter: any = {};
    if (status) filter.status = status;
    if (date) filter.date = date;

    const skip = (Number(page) - 1) * Number(limit);
    const [records, total] = await Promise.all([
      AttendanceRecord.find(filter)
        .populate('userId', 'name mobile')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      AttendanceRecord.countDocuments(filter),
    ]);

    res.json({ success: true, data: { records, total, page: Number(page), limit: Number(limit) } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
}

// Admin: Review attendance record
export async function adminReviewAttendance(req: Request, res: Response): Promise<void> {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const adminId = (req as any).admin?.id || (req as any).admin?._id || (req as any).user?.id || (req as any).user?._id;
    const { id } = req.params;
    const { decision, rejectionReason } = req.body;

    if (!['APPROVE', 'REJECT'].includes(decision)) {
      await session.abortTransaction();
      res.status(400).json({ success: false, error: { message: 'Decision must be APPROVE or REJECT' } });
      return;
    }

    const record = await AttendanceRecord.findOne({ _id: id, status: 'PENDING_REVIEW' }).session(session);
    if (!record) {
      await session.abortTransaction();
      res.status(409).json({ success: false, error: { message: 'Attendance record not found or has already been reviewed.' } });
      return;
    }

    if (decision === 'APPROVE') {
      record.status = 'APPROVED';
      record.reviewedBy = adminId;
      await record.save({ session });

      if (record.pointsAwarded > 0) {
        const idempotencyKey = `ATTENDANCE_APPROVE_${record._id}`;
        const ledger = new WalletLedgerEntry({
          userId: record.userId,
          entryType: 'TASK_REWARD',
          amountPaise: 0,
          pointsEquivalent: record.pointsAwarded,
          status: 'CONFIRMED',
          referenceEntity: 'AttendanceRecord',
          referenceId: record._id,
          idempotencyKey,
          notes: `Daily Attendance Approved (+${record.pointsAwarded} pts)`,
          metadata: {
            activity: 'ATTENDANCE_CHECKIN',
            rewardPolicy: 'REDEEMABLE_V1',
            currency: 'USD',
            points: record.pointsAwarded,
            usd: record.usdValue,
            reviewedBy: adminId,
          },
        });
        await ledger.save({ session });
      }
    } else {
      record.status = 'REJECTED';
      record.reviewNotes = rejectionReason || 'Rejected by admin';
      record.reviewedBy = adminId;
      await record.save({ session });
    }

    await session.commitTransaction();

    res.json({
      success: true,
      data: {
        id: record._id,
        status: record.status,
        pointsAwarded: decision === 'APPROVE' ? record.pointsAwarded : 0,
        usdValue: decision === 'APPROVE' ? record.usdValue : 0,
        rejectionReason: decision === 'REJECT' ? record.reviewNotes : undefined,
        message: decision === 'APPROVE'
          ? `Attendance approved! +${record.pointsAwarded} points ($${record.usdValue.toFixed(3)} USD) credited.`
          : `Attendance rejected: ${record.reviewNotes}. Zero points credited.`,
      },
    });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(500).json({ success: false, error: { message: error.message } });
  } finally {
    session.endSession();
  }
}

