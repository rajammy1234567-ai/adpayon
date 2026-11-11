/**
 * Safe Task Navigation & Modal Disallowance Utility
 *
 * Ensures specialized task engines (VIDEO_WATCH, ARTICLE_READ, APP_INSTALL) always route to
 * dedicated screens and never fall back to or open the legacy generic dwell-time modal.
 */

export type NavigationDestination =
  | { screen: 'VideoWatchTask'; params: { taskId: string; assignmentId?: string } }
  | { screen: 'YouTubeLearningTask'; params: { taskId: string; assignmentId?: string } }
  | { screen: 'ArticleReadTask'; params: { taskId: string; assignmentId?: string } }
  | { screen: 'AppInstallTask'; params: { taskId: string; assignmentId?: string } }
  | { screen: 'LegacyModal'; params: { taskId: string } };

/**
 * Returns true if the task category is permitted to use the legacy generic task modal.
 * Tasks using MANUAL_REVIEW (screenshot verification) always use the modal.
 * Specialized tasks with automated telemetry (VIDEO_WATCH, YOUTUBE_LEARNING, ARTICLE_READ, APP_INSTALL, APP_TESTING) are strictly excluded from the generic dwell-time modal.
 */
export function isLegacyModalAllowed(
  category?: string | null,
  verificationMethod?: string | null
): boolean {
  if (String(verificationMethod || '').trim().toUpperCase() === 'MANUAL_REVIEW') {
    return true;
  }
  if (!category) return false;
  const normalized = String(category).trim().toUpperCase();
  if (
    normalized === 'VIDEO_WATCH' ||
    normalized === 'YOUTUBE_LEARNING' ||
    normalized === 'ARTICLE_READ' ||
    normalized === 'APP_INSTALL' ||
    normalized === 'APP_TESTING'
  ) {
    return false;
  }
  return true;
}

/**
 * Evaluates a task feed item and returns the authoritative navigation destination.
 * Case-insensitive, whitespace-trimmed, and fails closed for safety.
 */
export function resolveTaskNavigation(task: {
  id: string;
  category?: string | null;
  verificationMethod?: string | null;
  activeAssignment?: { id: string } | null;
}): NavigationDestination {
  const method = String(task.verificationMethod || '').trim().toUpperCase();
  if (method === 'MANUAL_REVIEW') {
    return {
      screen: 'LegacyModal',
      params: {
        taskId: task.id,
      },
    };
  }

  const normalized = String(task.category || '').trim().toUpperCase();

  if (normalized === 'VIDEO_WATCH') {
    return {
      screen: 'VideoWatchTask',
      params: {
        taskId: task.id,
        assignmentId: task.activeAssignment?.id,
      },
    };
  }

  if (normalized === 'YOUTUBE_LEARNING') {
    return {
      screen: 'YouTubeLearningTask',
      params: {
        taskId: task.id,
        assignmentId: task.activeAssignment?.id,
      },
    };
  }

  if (normalized === 'ARTICLE_READ') {
    return {
      screen: 'ArticleReadTask',
      params: {
        taskId: task.id,
        assignmentId: task.activeAssignment?.id,
      },
    };
  }

  if (normalized === 'APP_INSTALL' || normalized === 'APP_TESTING') {
    return {
      screen: 'AppInstallTask',
      params: {
        taskId: task.id,
        assignmentId: task.activeAssignment?.id,
      },
    };
  }

  return {
    screen: 'LegacyModal',
    params: {
      taskId: task.id,
    },
  };
}

/**
 * Returns a human-friendly action button label tailored to the task category and submission status.
 */
export function getTaskActionButtonLabel(
  task: {
    category?: string | null;
    verificationMethod?: string | null;
    rewardPoints: number;
    hasActiveAssignment?: boolean;
    isEligible?: boolean;
    ineligibilityReason?: string;
    userSubmission?: { status?: string } | null;
  }
): string {
  if (!task.isEligible) {
    return task.ineligibilityReason || 'Ineligible';
  }

  if (task.userSubmission?.status === 'PENDING_REVIEW') {
    return 'Under Review ⏳';
  }
  if (task.userSubmission?.status === 'REJECTED') {
    return 'Resubmit Proof ⚠️';
  }
  if (task.userSubmission?.status === 'VERIFIED') {
    return 'Completed ✅';
  }

  const normalized = String(task.category || '').trim().toUpperCase();

  if (task.hasActiveAssignment) {
    if (normalized === 'APP_INSTALL' || normalized === 'APP_TESTING') return 'Check Testing Status 📱';
    if (normalized === 'ARTICLE_READ') return 'Resume Reading 📖';
    if (normalized === 'VIDEO_WATCH') return `Watch (+${task.rewardPoints} PTS) 🎬`;
    if (normalized === 'YOUTUBE_LEARNING') return 'Resume Learning 📺';
    return 'Resume Task ⏱️';
  }

  if (normalized === 'APP_INSTALL' || normalized === 'APP_TESTING') return `Test App (+${task.rewardPoints} PTS)`;
  if (normalized === 'ARTICLE_READ') return `Read News (+${task.rewardPoints} PTS)`;
  if (normalized === 'VIDEO_WATCH') return `Watch (+${task.rewardPoints} PTS)`;
  if (normalized === 'YOUTUBE_LEARNING') return `Watch & Learn (+${task.rewardPoints} PTS)`;
  return `Start Task (+${task.rewardPoints} PTS)`;
}
