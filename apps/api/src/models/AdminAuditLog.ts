import { Schema, model, Document, Types } from 'mongoose';

export interface IAdminAuditLog extends Document {
  _id: Types.ObjectId;
  adminId: Types.ObjectId;
  action: string;
  targetEntity: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ipAddress: string;
  createdAt: Date;
}

const adminAuditLogSchema = new Schema<IAdminAuditLog>(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Admin ID reference is required'],
    },
    action: {
      type: String,
      required: [true, 'Audit action is required'],
      trim: true,
      maxlength: [100, 'Action cannot exceed 100 characters'],
    },
    targetEntity: {
      type: String,
      required: [true, 'Target entity is required'],
      trim: true,
      maxlength: [100, 'Target entity cannot exceed 100 characters'],
    },
    targetId: {
      type: String,
      trim: true,
      maxlength: [100, 'Target ID cannot exceed 100 characters'],
    },
    details: {
      type: Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      required: [true, 'IP address is required'],
      trim: true,
      maxlength: [45, 'IP address cannot exceed 45 characters'],
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Append-only audit trail
    collection: 'admin_audit_logs',
  }
);

adminAuditLogSchema.index({ adminId: 1, createdAt: -1 });
adminAuditLogSchema.index({ action: 1, createdAt: -1 });
adminAuditLogSchema.index({ createdAt: -1 });

export const AdminAuditLog = model<IAdminAuditLog>('AdminAuditLog', adminAuditLogSchema);
