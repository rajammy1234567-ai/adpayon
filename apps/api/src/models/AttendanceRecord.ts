import { Schema, model, Document, Types } from 'mongoose';

export interface IAttendanceRecord extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  date: string; // YYYY-MM-DD
  dayOfCycle: number; // 1-7
  pointsAwarded: number;
  usdValue: number;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  reviewNotes?: string;
  reviewedBy?: Types.ObjectId;
  claimedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const attendanceRecordSchema = new Schema<IAttendanceRecord>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    date: {
      type: String,
      required: [true, 'Date string (YYYY-MM-DD) is required'],
      trim: true,
    },
    dayOfCycle: {
      type: Number,
      required: [true, 'Day of cycle (1-7) is required'],
      min: 1,
      max: 7,
    },
    pointsAwarded: {
      type: Number,
      required: [true, 'Points awarded is required'],
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Points awarded must be an integer',
      },
    },
    usdValue: {
      type: Number,
      required: [true, 'USD value is required'],
      min: 0,
    },
    claimedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['PENDING_REVIEW', 'APPROVED', 'REJECTED'],
      default: 'PENDING_REVIEW',
      index: true,
    },
    reviewNotes: {
      type: String,
      trim: true,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    collection: 'attendance_records',
  }
);

// Unique index: One attendance claim per user per calendar day
attendanceRecordSchema.index({ userId: 1, date: 1 }, { unique: true });

export const AttendanceRecord = model<IAttendanceRecord>('AttendanceRecord', attendanceRecordSchema);

