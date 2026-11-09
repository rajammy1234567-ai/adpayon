import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/adminAuth';
import {
  getAttendanceStatus,
  claimAttendance,
  adminListAttendance,
  adminReviewAttendance,
} from '../controllers/attendance.controller';

export const attendanceRouter = Router();

attendanceRouter.get('/attendance/status', requireAuth, getAttendanceStatus);
attendanceRouter.post('/attendance/check-in', requireAuth, claimAttendance);

// Admin review routes
attendanceRouter.get('/admin/attendance/records', requireAdmin, adminListAttendance);
attendanceRouter.post('/admin/attendance/records/:id/review', requireAdmin, adminReviewAttendance);

