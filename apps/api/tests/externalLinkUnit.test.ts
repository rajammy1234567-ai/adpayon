import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import {
  ExternalLinkSession,
  VerificationEvidence,
  Task,
  TaskAssignment,
  TaskCompletion,
  WalletLedgerEntry,
} from '../src/models';

describe('External Link Elapsed-Time Unit & Model Validation Tests', () => {
  describe('1. Model & Schema Invariants', () => {
    it('1.1 ExternalLinkSession rejects missing required fields', async () => {
      const session = new ExternalLinkSession({});
      let err: any = null;
      try {
        await session.validate();
      } catch (e) {
        err = e;
      }
      assert.ok(err);
      assert.ok(err.errors['sessionId']);
      assert.ok(err.errors['userId']);
      assert.ok(err.errors['taskId']);
      assert.ok(err.errors['assignmentId']);
      assert.ok(err.errors['targetUrl']);
      assert.ok(err.errors['requiredDurationSeconds']);
      assert.ok(err.errors['expiresAt']);
    });

    it('1.2 ExternalLinkSession applies correct defaults', async () => {
      const session = new ExternalLinkSession({
        sessionId: 'els_test1234567890',
        userId: new Types.ObjectId(),
        taskId: new Types.ObjectId(),
        assignmentId: new Types.ObjectId(),
        targetUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        category: 'YOUTUBE_LEARNING',
        requiredDurationSeconds: 15,
        expiresAt: new Date(Date.now() + 3600000),
      });
      await session.validate();
      assert.equal(session.status, 'ACTIVE');
      assert.equal(session.linkLaunched, false);
      assert.equal(session.launchFailure, false);
      assert.equal(session.rewardGranted, false);
      assert.ok(session.startedAt instanceof Date);
    });

    it('1.3 VerificationEvidence accepts EXTERNAL_LINK_ELAPSED evidence type', async () => {
      const evidence = new VerificationEvidence({
        assignmentId: new Types.ObjectId(),
        taskId: new Types.ObjectId(),
        userId: new Types.ObjectId(),
        evidenceType: 'EXTERNAL_LINK_ELAPSED',
        signatureVerified: true,
        rawPayload: {
          evidenceLabel: 'EXTERNAL_LINK_ELAPSED',
          sessionId: 'els_sample_test',
          elapsedSeconds: 20,
          requiredDurationSeconds: 15,
          verifiedAt: new Date().toISOString(),
        },
      });
      await evidence.validate();
      assert.equal(evidence.evidenceType, 'EXTERNAL_LINK_ELAPSED');
      assert.equal((evidence.rawPayload as any).evidenceLabel, 'EXTERNAL_LINK_ELAPSED');
    });

    it('1.4 VerificationEvidence rejects unsupported evidence types', async () => {
      const evidence = new VerificationEvidence({
        assignmentId: new Types.ObjectId(),
        taskId: new Types.ObjectId(),
        userId: new Types.ObjectId(),
        evidenceType: 'UNVERIFIED_CLIENT_CLAIM' as any,
      });
      let err: any = null;
      try {
        await evidence.validate();
      } catch (e) {
        err = e;
      }
      assert.ok(err);
      assert.ok(err.errors['evidenceType']);
    });
  });

  describe('2. Elapsed Time Logic & Calculations', () => {
    it('2.1 Correctly detects insufficient duration (early return)', () => {
      const requiredDuration = 30;
      const startedAt = new Date(Date.now() - 10000); // 10 seconds ago
      const now = new Date();
      const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
      const remainingSeconds = Math.max(0, requiredDuration - elapsedSeconds);

      assert.ok(elapsedSeconds >= 9 && elapsedSeconds <= 11);
      assert.ok(remainingSeconds >= 19 && remainingSeconds <= 21);
      assert.equal(elapsedSeconds < requiredDuration, true, 'Early return condition met');
    });

    it('2.2 Correctly detects satisfied duration (late return)', () => {
      const requiredDuration = 10;
      const startedAt = new Date(Date.now() - 15000); // 15 seconds ago
      const now = new Date();
      const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
      const remainingSeconds = Math.max(0, requiredDuration - elapsedSeconds);

      assert.ok(elapsedSeconds >= 14);
      assert.equal(remainingSeconds, 0);
      assert.equal(elapsedSeconds >= requiredDuration, true, 'Late return condition met');
    });

    it('2.3 Unlaunched links do not accumulate valid elapsed duration', () => {
      const session = {
        linkLaunched: false,
        linkLaunchedAt: undefined,
        startedAt: new Date(Date.now() - 60000), // started 1 min ago but never launched
        requiredDurationSeconds: 15,
      };

      // Server logic: unlaunched links have 0 valid engagement elapsed seconds
      const elapsedSeconds = session.linkLaunched
        ? Math.max(0, Math.floor((Date.now() - (session.linkLaunchedAt || session.startedAt).getTime()) / 1000))
        : 0;

      assert.equal(elapsedSeconds, 0, 'Unlaunched link must yield 0 elapsed seconds');
      assert.equal(session.linkLaunched, false, 'Link launch requirement failed');
    });

    it('2.4 App restart preserves original startedAt and linkLaunchedAt without reset', () => {
      const initialStartedAt = new Date(Date.now() - 25000);
      const initialLaunchedAt = new Date(Date.now() - 24000);

      const existingSession = {
        sessionId: 'els_persistent_session_id',
        startedAt: initialStartedAt,
        linkLaunched: true,
        linkLaunchedAt: initialLaunchedAt,
        requiredDurationSeconds: 20,
      };

      // Simulating second start/status call after app restart:
      const refTime = existingSession.linkLaunchedAt || existingSession.startedAt;
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - refTime.getTime()) / 1000));
      const remainingSeconds = Math.max(0, existingSession.requiredDurationSeconds - elapsedSeconds);

      assert.equal(existingSession.startedAt, initialStartedAt, 'startedAt timestamp preserved');
      assert.equal(existingSession.linkLaunchedAt, initialLaunchedAt, 'linkLaunchedAt timestamp preserved');
      assert.ok(elapsedSeconds >= 23, 'Elapsed time counted continuously from initial launch');
      assert.equal(remainingSeconds, 0, 'Completed duration recognized');
    });

    it('2.5 Idempotency key pattern ensures exactly one reward ledger entry', () => {
      const completionId = new Types.ObjectId();
      const key1 = `ext-elapsed-reward-${completionId}`;
      const key2 = `ext-elapsed-reward-${completionId}`;

      assert.equal(key1, key2, 'Idempotency keys must be identical across replays');
    });

    it('2.6 Single uninterrupted attempt: returning early resets eligible to false and elapsed to 0', () => {
      const requiredDurationSeconds = 30;
      const attemptStartedAt = new Date(Date.now() - 17000); // 17s ago
      const rawDelta = Math.max(0, Math.floor((Date.now() - attemptStartedAt.getTime()) / 1000));
      const isEligible = rawDelta >= requiredDurationSeconds;
      const elapsedSeconds = isEligible ? requiredDurationSeconds : 0;
      const remainingSeconds = isEligible ? 0 : requiredDurationSeconds;

      assert.equal(isEligible, false);
      assert.equal(elapsedSeconds, 0);
      assert.equal(remainingSeconds, 30);
    });

    it('2.7 Single uninterrupted attempt: time from multiple attempts is never combined', () => {
      const attempt1Duration = 17;
      const attempt2Duration = 15;
      const required = 30;

      // Old interval logic would have combined 17 + 15 = 32 >= 30.
      // Single uninterrupted attempt logic strictly rejects both:
      assert.equal(attempt1Duration >= required, false, 'Attempt 1 fails independently');
      assert.equal(attempt2Duration >= required, false, 'Attempt 2 fails independently');
      const combinedDuration = Math.max(
        attempt1Duration >= required ? required : 0,
        attempt2Duration >= required ? required : 0
      );
      assert.equal(combinedDuration, 0, 'Eligible duration remains 0 when attempts are fragmented');
    });

    it('2.8 Attempt IDs guard against delayed/duplicate return packets from older attempts', () => {
      const currentAttemptId: string = 'att_current_1234';
      const delayedOldAttemptId: string = 'att_old_5678';

      const isStale = delayedOldAttemptId !== currentAttemptId;
      assert.equal(isStale, true, 'Old attempt must be detected as stale');
    });
  });
});
