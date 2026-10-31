import React from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Newspaper, RefreshCw, AlertCircle } from 'lucide-react-native';
import { THEME } from '../../constants/theme';
import { fetchNewsFeedApi, NewsArticleItem } from '../../services/api/news.api';

export const HomeNewsSection: React.FC = () => {
  const {
    data: articles = [],
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['newsFeed'],
    queryFn: fetchNewsFeedApi,
    staleTime: 1000 * 60 * 10, // 10 minutes
  });

  const handleOpenLink = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      }
    } catch {
      // Graceful fallback if URL cannot be opened
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <View style={styles.container}>
      {/* Section Header */}
      <View style={styles.headerRow}>
        <View style={styles.titleWithIcon}>
          <View style={styles.headerIconBox}>
            <Newspaper size={18} color={THEME.colors.primary} />
          </View>
          <View>
            <Text style={styles.headerTitle}>News / समाचार</Text>
            <Text style={styles.headerSubtitle}>Official platform announcements</Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh news"
          onPress={() => refetch()}
          disabled={isLoading || isRefetching}
          style={styles.refreshButton}
        >
          <RefreshCw
            size={14}
            color={THEME.colors.textMuted}
            style={isRefetching ? styles.rotating : undefined}
          />
        </Pressable>
      </View>

      {/* Notice Pill: Inform users that news reading is informational and does not award points */}
      <View style={styles.noticePill}>
        <Text style={styles.noticeText}>
          ℹ️ Official Updates • Browsing news does not earn task points
        </Text>
      </View>

      {/* Loading State */}
      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="small" color={THEME.colors.primary} />
          <Text style={styles.loadingText}>Loading latest announcements...</Text>
        </View>
      ) : null}

      {/* Error State */}
      {!isLoading && isError ? (
        <View style={styles.stateCard}>
          <AlertCircle size={24} color={THEME.colors.danger} />
          <Text style={styles.stateTitle}>Unable to load news</Text>
          <Text style={styles.stateSubtitle}>
            Check your network connection and try again.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => refetch()}
            style={styles.retryButton}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Empty State */}
      {!isLoading && !isError && articles.length === 0 ? (
        <View style={styles.stateCard}>
          <View style={styles.emptyIconCircle}>
            <Newspaper size={20} color={THEME.colors.textMuted} />
          </View>
          <Text style={styles.stateTitle}>No news updates right now</Text>
          <Text style={styles.stateSubtitle}>
            Check back soon for official platform announcements and releases.
          </Text>
        </View>
      ) : null}

      {/* News Feed List */}
      {!isLoading && !isError && articles.length > 0 ? (
        <View style={styles.articlesList}>
          {articles.map((item: NewsArticleItem) => (
            <Pressable
              key={item.id}
              accessibilityRole="link"
              accessibilityLabel={`${item.title}, Source: ${item.source}`}
              onPress={() => handleOpenLink(item.url)}
              style={({ pressed }) => [
                styles.articleCard,
                pressed ? styles.articleCardPressed : null,
              ]}
            >
              <View style={styles.articleHeader}>
                <View style={styles.metaRow}>
                  <Text style={styles.sourceText}>{item.source}</Text>
                  <Text style={styles.dotSeparator}>•</Text>
                  <Text style={styles.dateText}>{formatDate(item.publishedAt)}</Text>
                </View>
                <ExternalLink size={14} color={THEME.colors.primary} />
              </View>

              <Text style={styles.articleTitle} numberOfLines={2}>
                {item.title}
              </Text>

              {item.summary ? (
                <Text style={styles.articleSummary} numberOfLines={3}>
                  {item.summary}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: THEME.spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: THEME.spacing.sm,
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: THEME.colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 11,
    color: THEME.colors.textMuted,
  },
  refreshButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: THEME.colors.surfaceSubtle,
  },
  rotating: {
    opacity: 0.6,
  },
  noticePill: {
    backgroundColor: THEME.colors.surfaceSubtle,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: THEME.spacing.sm,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  noticeText: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    fontWeight: '500',
  },
  centerBox: {
    padding: THEME.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 12,
    color: THEME.colors.textMuted,
  },
  stateCard: {
    backgroundColor: THEME.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    padding: THEME.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...THEME.shadows.card,
  },
  emptyIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: THEME.colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  stateTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
    marginTop: 4,
  },
  stateSubtitle: {
    fontSize: 12,
    color: THEME.colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 16,
  },
  retryButton: {
    marginTop: 12,
    paddingVertical: 6,
    paddingHorizontal: 16,
    backgroundColor: THEME.colors.primarySubtle,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: THEME.colors.primary,
  },
  retryButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.primary,
  },
  articlesList: {
    gap: 10,
  },
  articleCard: {
    backgroundColor: THEME.colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    ...THEME.shadows.card,
  },
  articleCardPressed: {
    backgroundColor: THEME.colors.surfaceSubtle,
  },
  articleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sourceText: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  dotSeparator: {
    fontSize: 10,
    color: THEME.colors.textMuted,
  },
  dateText: {
    fontSize: 11,
    color: THEME.colors.textMuted,
  },
  articleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    lineHeight: 20,
    marginBottom: 4,
  },
  articleSummary: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
  },
});

