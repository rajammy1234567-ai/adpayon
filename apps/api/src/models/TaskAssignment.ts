import { Schema, model, Document, Types } from 'mongoose';

export type AssignmentStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';

export interface ITaskAssignment extends Document {
  _id: Types.ObjectId;
  taskId: Types.ObjectId;
  campaignId: Types.ObjectId;
  userId: Types.ObjectId;
  clickId: string; // Unique tracking token for external/internal attribution
  status: AssignmentStatus;
  assignedAt: Date;
  expiresAt: Date;
  dwellTimeAccumulatedSeconds: number;
  lastHeartbeatAt?: Date;
  completedAt?: Date;
  hasOpenedStore?: boolean;
  storeVisitedAt?: Date;
  initialInstallStatus?: 'INSTALLED' | 'NOT_INSTALLED' | 'UNAVAILABLE';
  initialPackageName?: string;
  initialInstallCheckedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const taskAssignmentSchema = new Schema<ITaskAssignment>(
  {
    taskId: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
      required: [true, 'Task reference is required'],
    },
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: 'Campaign',
      required: [true, 'Campaign reference is required'],
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
    },
    clickId: {
      type: String,
      required: [true, 'Click tracking ID is required'],
      unique: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED', 'CANCELLED'],
      default: 'ASSIGNED',
    },
    assignedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiry date is required'],
    },
    dwellTimeAccumulatedSeconds: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Dwell time accumulated seconds must be an integer',
      },
    },
    lastHeartbeatAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
    hasOpenedStore: {
      type: Boolean,
      default: false,
    },
    storeVisitedAt: {
      type: Date,
    },
    initialInstallStatus: {
      type: String,
      enum: ['INSTALLED', 'NOT_INSTALLED', 'UNAVAILABLE'],
    },
    initialPackageName: {
      type: String,
      trim: true,
    },
    initialInstallCheckedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    collection: 'task_assignments',
  }
);

taskAssignmentSchema.index({ taskId: 1, userId: 1, status: 1 });
taskAssignmentSchema.index(
  { taskId: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['ASSIGNED', 'IN_PROGRESS'] } },
  }
);
taskAssignmentSchema.index({ userId: 1, status: 1, createdAt: -1 });
taskAssignmentSchema.index({ expiresAt: 1 });

export const TaskAssignment = model<ITaskAssignment>('TaskAssignment', taskAssignmentSchema);
