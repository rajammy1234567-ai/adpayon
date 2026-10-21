import { Schema, model, Document, Types } from 'mongoose';

export type TaskEventType =
  | 'START'
  | 'HEARTBEAT'
  | 'SUBMIT'
  | 'VERIFY_SUCCESS'
  | 'VERIFY_FAIL'
  | 'REJECT'
  | 'EXPIRE'
  | 'STORE_VISIT';

export interface ITaskEvent extends Document {
  _id: Types.ObjectId;
  assignmentId: Types.ObjectId;
  taskId: Types.ObjectId;
  userId: Types.ObjectId;
  eventType: TaskEventType;
  payload: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

const taskEventSchema = new Schema<ITaskEvent>(
  {
    assignmentId: {
      type: Schema.Types.ObjectId,
      ref: 'TaskAssignment',
      required: [true, 'Assignment reference is required'],
    },
    taskId: {
      type: Schema.Types.ObjectId,
      ref: 'Task',
      required: [true, 'Task reference is required'],
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
    },
    eventType: {
      type: String,
      enum: ['START', 'HEARTBEAT', 'SUBMIT', 'VERIFY_SUCCESS', 'VERIFY_FAIL', 'REJECT', 'EXPIRE', 'STORE_VISIT'],
      required: [true, 'Event type is required'],
    },
    payload: {
      type: Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      trim: true,
      maxlength: [45, 'IP address cannot exceed 45 characters'],
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: [300, 'User agent cannot exceed 300 characters'],
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Append-only lifecycle event trail
    collection: 'task_events',
  }
);

taskEventSchema.index({ assignmentId: 1, createdAt: 1 });
taskEventSchema.index({ userId: 1, eventType: 1, createdAt: -1 });
taskEventSchema.index({ taskId: 1, createdAt: -1 });

export const TaskEvent = model<ITaskEvent>('TaskEvent', taskEventSchema);
