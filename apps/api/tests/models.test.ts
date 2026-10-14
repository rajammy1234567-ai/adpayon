import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { User, AuthSession, AdminAuditLog } from '../src/models';

describe('Mongoose Schema & Model Validation Tests', () => {
  describe('1. User Model Schema Validation', () => {
    it('1.1 Rejects User when required fields are missing', async () => {
      const user = new User({});
      let err: any = null;
      try {
        await user.validate();
      } catch (e) {
        err = e;
      }
      assert.ok(err);
      assert.ok(err.errors['mobile']);
      assert.ok(err.errors['name']);
      assert.ok(err.errors['passwordHash']);
      assert.ok(err.errors['referralCode']);
    });

    it('1.2 Rejects invalid mobile number formats', async () => {
      const user = new User({
        mobile: 'invalid-number',
        name: 'Test User',
        passwordHash: '$2b$12$samplehashvaluegoeshere1234567890',
        referralCode: 'ADTEST1',
      });
      let err: any = null;
      try {
        await user.validate();
      } catch (e) {
        err = e;
      }
      assert.ok(err);
      assert.ok(err.errors['mobile']);
    });

    it('1.3 Applies safe default values for role and status', async () => {
      const user = new User({
        mobile: '+919876543210',
        name: 'Safe User',
        passwordHash: '$2b$12$samplehashvaluegoeshere1234567890',
        referralCode: 'ADSAFE100',
      });
      await user.validate();
      assert.equal(user.role, 'USER');
      assert.equal(user.status, 'PENDING_VERIFICATION');
      assert.equal(user.metadata?.kycStatus, 'NOT_SUBMITTED');
      assert.equal(user.metadata?.language, 'en');
    });

    it('1.4 Rejects invalid enum values for role', async () => {
      const user = new User({
        mobile: '+919876543211',
        name: 'Role Test',
        passwordHash: '$2b$12$samplehashvaluegoeshere1234567890',
        referralCode: 'ADROLE1',
        role: 'SUPER_HACKER' as unknown as import('../src/models/User').UserRole,
      });
      let err: any = null;
      try {
        await user.validate();
      } catch (e) {
        err = e;
      }
      assert.ok(err);
      assert.ok(err.errors['role']);
    });
  });

  describe('2. AuthSession Model Schema Validation', () => {
    it('2.1 Rejects AuthSession when required fields are missing', async () => {
      const session = new AuthSession({});
      let err: any = null;
      try {
        await session.validate();
      } catch (e) {
        err = e;
      }
      assert.ok(err);
      assert.ok(err.errors['userId']);
      assert.ok(err.errors['refreshTokenHash']);
      assert.ok(err.errors['familyId']);
      assert.ok(err.errors['expiresAt']);
    });

    it('2.2 Rejects refreshTokenHash that is not a 64-character SHA-256 hash', async () => {
      const session = new AuthSession({
        userId: new Types.ObjectId(),
        refreshTokenHash: 'short-non-sha256-hash',
        familyId: 'c1c2c3c4-0000-0000-0000-000000000000',
        expiresAt: new Date(Date.now() + 86400000),
      });
      let err: any = null;
      try {
        await session.validate();
      } catch (e) {
        err = e;
      }
      assert.ok(err);
      assert.ok(err.errors['refreshTokenHash']);
    });

    it('2.3 Accepts valid AuthSession with 64-character hash and ObjectId ref', async () => {
      const validSha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      const session = new AuthSession({
        userId: new Types.ObjectId(),
        refreshTokenHash: validSha256,
        familyId: 'c1c2c3c4-0000-0000-0000-000000000000',
        expiresAt: new Date(Date.now() + 86400000),
      });
      await session.validate();
      assert.equal(session.revokedAt, null);
    });
  });

  describe('3. AdminAuditLog Model Schema Validation', () => {
    it('3.1 Rejects AdminAuditLog when required fields are missing', async () => {
      const log = new AdminAuditLog({});
      let err: any = null;
      try {
        await log.validate();
      } catch (e) {
        err = e;
      }
      assert.ok(err);
      assert.ok(err.errors['adminId']);
      assert.ok(err.errors['action']);
      assert.ok(err.errors['targetEntity']);
      assert.ok(err.errors['ipAddress']);
    });

    it('3.2 Accepts valid append-only AdminAuditLog record', async () => {
      const log = new AdminAuditLog({
        adminId: new Types.ObjectId(),
        action: 'KYC_APPROVE',
        targetEntity: 'User',
        targetId: '507f1f77bcf86cd799439011',
        details: { previousStatus: 'PENDING', approvedBy: 'finance_admin' },
        ipAddress: '192.168.1.1',
      });
      await log.validate();
      assert.equal(log.action, 'KYC_APPROVE');
      assert.equal(log.targetEntity, 'User');
    });
  });
});
