/**
 * Safe Task Navigation & Modal Disallowance Utility
 *
 * Ensures specialized task engines (VIDEO_WATCH, ARTICLE_READ, APP_INSTALL) always route to
 * dedicated screens and never fall back to or open the legacy generic dwell-time modal.
 */

export type NavigationDestination =
  | { screen: 'VideoWatchTask'; params: { taskId: string; assignmentId?: string } }
  | { screen: 'ArticleReadTask'; params: { taskId: string; assignmentId?: string } }
  | { screen: 'AppInstallTask'; params: { taskId: string; assignmentId?: string } }
  | { screen: 'LegacyModal'; params: { taskId: string } };

/**
 * Returns true if the task category is permitted to use the legacy generic task modal.
 * Specialized tasks (VIDEO_WATCH, ARTICLE_READ, APP_INSTALL) are strictly excluded.
 */
export function isLegacyModalAllowed(category?: string | null): boolean {
  if (!category) return false;
  const normalized = String(category).trim().toUpperCase();
  if (normalized === 'VIDEO_WATCH' || normalized === 'ARTICLE_READ' || normalized === 'APP_INSTALL') {
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
  activeAssignment?: { id: string } | null;
}): NavigationDestination {
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

  if (normalized === 'ARTICLE_READ') {
    return {
      screen: 'ArticleReadTask',
      params: {
        taskId: task.id,
        assignmentId: task.activeAssignment?.id,
      },
    };
  }

  if (normalized === 'APP_INSTALL') {
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
 * Returns a human-friendly action button label tailored to the task category.
 */
export function getTaskActionButtonLabel(
  task: {
    category?: string | null;
    rewardPoints: number;
    hasActiveAssignment?: boolean;
    isEligible?: boolean;
    ineligibilityReason?: string;
  }
): string {
  if (!task.isEligible) {
    return task.ineligibilityReason || 'Ineligible';
  }

  const normalized = String(task.category || '').trim().toUpperCase();

  if (task.hasActiveAssignment) {
    if (normalized === 'APP_INSTALL') return 'Check Install Status 📱';
    if (normalized === 'ARTICLE_READ') return 'Resume Reading 📖';
    if (normalized === 'VIDEO_WATCH') return 'Resume Video 🎬';
    return 'Resume Task ⏱️';
  }

  if (normalized === 'APP_INSTALL') return `Discover App (+${task.rewardPoints} PTS)`;
  if (normalized === 'ARTICLE_READ') return `Read Article (+${task.rewardPoints} PTS)`;
  if (normalized === 'VIDEO_WATCH') return `Watch Video (+${task.rewardPoints} PTS)`;
  return `Start Task (+${task.rewardPoints} PTS)`;
}
