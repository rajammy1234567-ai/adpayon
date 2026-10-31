import React, { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ReferralSummaryResponse, ReferralTreeNode } from '@adpayon/shared';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Header } from '../../components/ui/Header';
import { THEME } from '../../constants/theme';
import { useBottomTabSpacing } from '../../hooks/useBottomTabSpacing';
import { useAuthStore } from '../../store/authStore';
import {
  getReferralSummaryApi,
  getDirectReferralsApi,
  getTreeChildrenApi,
} from '../../services/api/referral.api';

export const MyTeamScreen: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const bottomSpacing = useBottomTabSpacing();

  const [summary, setSummary] = useState<ReferralSummaryResponse | null>(null);
  const [directs, setDirects] = useState<ReferralTreeNode[]>([]);
  const [childrenMap, setChildrenMap] = useState<Record<string, ReferralTreeNode[]>>({});
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [loadingNode, setLoadingNode] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [sumRes, dirRes] = await Promise.all([
        getReferralSummaryApi(),
        getDirectReferralsApi(1, 50),
      ]);
      setSummary(sumRes.data);
      setDirects(dirRes.data.items);
    } catch (err: any) {
      setError(err.message || 'Failed to load referral network');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleToggleNode = async (nodeId: string) => {
    const isCurrentlyExpanded = !!expandedNodes[nodeId];

    if (isCurrentlyExpanded) {
      setExpandedNodes((prev) => ({ ...prev, [nodeId]: false }));
      return;
    }

    // If children already loaded, simply expand
    if (childrenMap[nodeId]) {
      setExpandedNodes((prev) => ({ ...prev, [nodeId]: true }));
      return;
    }

    // Lazy load children from backend API
    setLoadingNode((prev) => ({ ...prev, [nodeId]: true }));
    try {
      const res = await getTreeChildrenApi(nodeId);
      setChildrenMap((prev) => ({
        ...prev,
        [nodeId]: res.data.children,
      }));
      setExpandedNodes((prev) => ({ ...prev, [nodeId]: true }));
    } catch (err: any) {
      Alert.alert('Unable to load branch', err.message || 'Could not fetch team members.');
    } finally {
      setLoadingNode((prev) => ({ ...prev, [nodeId]: false }));
    }
  };

  const handleShare = async () => {
    const code = summary?.referralCode || user?.referralCode || 'ADPAYON';
    const link = `https://adpayon.com/join?ref=${code}`;
    try {
      await Share.share({
        title: 'Join My AdPayOn Team',
        message: `Join my team on AdPayOn to earn verified rewards and daily bonuses! Register with my referral code ${code}: ${link}`,
      });
    } catch {
      // User dismissed share dialog
    }
  };

  const renderMemberNode = (node: ReferralTreeNode, depth = 1) => {
    const isExpanded = !!expandedNodes[node.id];
    const isNodeLoading = !!loadingNode[node.id];
    const children = childrenMap[node.id] || [];

    return (
      <View key={node.id} style={[styles.nodeWrapper, { marginLeft: Math.min(depth * 14, 42) }]}>
        <Card variant="default" style={styles.nodeCard}>
          <View style={styles.nodeHeader}>
            <View style={styles.nodeHeaderLeft}>
              <View style={styles.levelBadge}>
                <Text style={styles.levelBadgeText}>L{node.level}</Text>
              </View>

              <View style={styles.nodeIdentity}>
                <View style={styles.nameRow}>
                  <Text style={styles.nodeName}>{node.name}</Text>
                  {node.directReferralsCount > 0 ? (
                    <Badge
                      label={`${node.directReferralsCount} Directs`}
                      variant="gold"
                      style={styles.directsBadge}
                    />
                  ) : null}
                </View>
                <Text style={styles.nodeSub}>
                  ID: {node.referralCode} • {node.mobileMasked}
                </Text>
              </View>
            </View>

            <Badge
              label={node.isActive ? t('common.active') : t('common.pending')}
              variant={node.isActive ? 'active' : 'inactive'}
            />
          </View>

          {/* Expand / Collapse Action */}
          {node.hasChildren ? (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => handleToggleNode(node.id)}
              style={styles.expandBtn}
              disabled={isNodeLoading}
            >
              {isNodeLoading ? (
                <View style={styles.expandLoadingRow}>
                  <ActivityIndicator size="small" color={THEME.colors.primary} />
                  <Text style={styles.expandText}>Loading team branch...</Text>
                </View>
              ) : (
                <Text style={styles.expandText}>
                  {isExpanded
                    ? '▲ Collapse Team Branch'
                    : `▼ View Team Members (${node.directReferralsCount} Directs)`}
                </Text>
              )}
            </TouchableOpacity>
          ) : null}
        </Card>

        {/* Recursive Children Rendering */}
        {isExpanded && children.length > 0 ? (
          <View style={styles.childrenBranch}>
            {children.map((child) => renderMemberNode(child, depth + 1))}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <Header
        title={t('team.myTeam')}
        subtitle="Referral Team Network"
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomSpacing }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={THEME.colors.primary}
          />
        }
      >
        {/* Network Metrics Summary Card */}
        <Card variant="elevated" style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Your Referral Network</Text>
          <Text style={styles.summarySub}>
            Direct team members and overall network size with verified activity counts
          </Text>

          <View style={styles.metricsRow}>
            {/* Direct Referrals */}
            <View style={styles.metricBox}>
              <Text style={styles.metricVal}>
                {summary ? summary.directCount : user?.directReferralsCount ?? 0}
              </Text>
              <Text style={styles.metricLabel}>Direct Team</Text>
              <Text style={styles.metricActiveTag}>
                {summary ? `${summary.activeDirectCount} Active` : 'Verified L1'}
              </Text>
            </View>

            <View style={styles.metricDivider} />

            {/* Total Downline */}
            <View style={styles.metricBox}>
              <Text style={[styles.metricVal, { color: THEME.colors.gold }]}>
                {summary ? summary.totalDownlineCount : 0}
              </Text>
              <Text style={styles.metricLabel}>Total Team</Text>
              <Text style={styles.metricActiveTag}>
                {summary ? `${summary.activeDownlineCount} Active` : 'All Levels'}
              </Text>
            </View>
          </View>

          {/* Sponsor attribution if present */}
          {summary?.sponsor ? (
            <View style={styles.sponsorBanner}>
              <Text style={styles.sponsorEmoji}>🤝</Text>
              <View style={styles.sponsorInfo}>
                <Text style={styles.sponsorLabel}>Your Sponsor:</Text>
                <Text style={styles.sponsorName}>
                  {summary.sponsor.name} ({summary.sponsor.referralCode})
                </Text>
              </View>
            </View>
          ) : null}

          {/* Quick Share Bar */}
          <View style={styles.shareRow}>
            <View style={styles.codeContainer}>
              <Text style={styles.codePrefix}>Your Code:</Text>
              <Text style={styles.codeText}>
                {summary?.referralCode || user?.referralCode || 'ADP1000'}
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleShare}
              style={styles.inviteBtn}
            >
              <Text style={styles.inviteBtnText}>📢 Share Invite</Text>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Hierarchy Section */}
        <View style={styles.treeSectionHeader}>
          <Text style={styles.treeTitle}>Team Hierarchy Tree</Text>
          <Text style={styles.treeSub}>
            Tap any branch to expand direct and indirect team members
          </Text>
        </View>

        {/* Current User Root Node */}
        <Card variant="default" style={styles.rootNodeCard}>
          <View style={styles.nodeHeader}>
            <View style={styles.nodeHeaderLeft}>
              <View style={styles.rootIconBox}>
                <Text style={styles.rootIcon}>👑</Text>
              </View>
              <View>
                <View style={styles.nameRow}>
                  <Text style={styles.rootNodeName}>{user?.name || 'You'}</Text>
                  <Badge label="You (Root)" variant="gold" style={styles.directsBadge} />
                </View>
                <Text style={styles.rootNodeSub}>
                  Referral ID: {summary?.referralCode || user?.referralCode}
                </Text>
              </View>
            </View>
            <Badge label="Active" variant="active" />
          </View>
        </Card>

        {/* Loading Spinner */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={THEME.colors.primary} />
            <Text style={styles.loadingText}>Loading referral team...</Text>
          </View>
        ) : error ? (
          <Card variant="default" style={styles.errorCard}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
            <Button
              title="Try Again"
              onPress={loadData}
              variant="secondary"
              size="sm"
              style={styles.retryBtn}
            />
          </Card>
        ) : directs.length === 0 ? (
          /* Empty State */
          <Card variant="default" style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🌱</Text>
            <Text style={styles.emptyTitle}>Build Your Team Network</Text>
            <Text style={styles.emptySub}>
              You don't have any direct referrals yet. Share your unique referral code with friends and colleagues to start growing your team!
            </Text>
            <Button
              title="Share Referral Code"
              onPress={handleShare}
              variant="primary"
              size="md"
              style={styles.emptyBtn}
            />
          </Card>
        ) : (
          /* Direct Referrals & Expandable Branches */
          <View style={styles.treeList}>
            {directs.map((child) => renderMemberNode(child, 1))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  scroll: {
    padding: THEME.spacing.lg,
  },
  summaryCard: {
    marginBottom: THEME.spacing.xl,
    padding: THEME.spacing.lg,
    backgroundColor: THEME.colors.surface,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  summarySub: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 16,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surfaceSubtle,
    borderRadius: THEME.borderRadius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  metricBox: {
    flex: 1,
    alignItems: 'center',
  },
  metricVal: {
    fontSize: 26,
    fontWeight: '900',
    color: THEME.colors.emerald,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginTop: 2,
  },
  metricActiveTag: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    marginTop: 2,
  },
  metricDivider: {
    width: 1,
    height: 44,
    backgroundColor: THEME.colors.border,
  },
  sponsorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surfaceSubtle,
    padding: 10,
    borderRadius: THEME.borderRadius.sm,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    marginBottom: 14,
  },
  sponsorEmoji: {
    fontSize: 20,
    marginRight: 10,
  },
  sponsorInfo: {
    flex: 1,
  },
  sponsorLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    color: THEME.colors.textMuted,
    fontWeight: '700',
  },
  sponsorName: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: THEME.colors.surfaceSubtle,
    padding: 10,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  codeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  codePrefix: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginRight: 6,
  },
  codeText: {
    fontSize: 15,
    fontWeight: '900',
    color: THEME.colors.primary,
    letterSpacing: 0.5,
  },
  inviteBtn: {
    backgroundColor: THEME.colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: THEME.borderRadius.sm,
  },
  inviteBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  treeSectionHeader: {
    marginBottom: 12,
  },
  treeTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  treeSub: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  rootNodeCard: {
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: THEME.colors.primary,
    backgroundColor: THEME.colors.surface,
  },
  rootIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: THEME.colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rootIcon: {
    fontSize: 18,
  },
  rootNodeName: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  rootNodeSub: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  treeList: {
    marginTop: 4,
  },
  nodeWrapper: {
    marginBottom: 10,
  },
  nodeCard: {
    padding: THEME.spacing.md,
    backgroundColor: THEME.colors.surface,
  },
  nodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nodeHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  levelBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: THEME.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  levelBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.primary,
  },
  nodeIdentity: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  nodeName: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  directsBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  nodeSub: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  expandBtn: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.border,
    alignItems: 'center',
  },
  expandLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  expandText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  childrenBranch: {
    borderLeftWidth: 1.5,
    borderLeftColor: THEME.colors.border,
    paddingLeft: 6,
    marginTop: 6,
  },
  loadingContainer: {
    padding: 30,
    alignItems: 'center',
  },
  loadingText: {
    color: THEME.colors.textSecondary,
    fontSize: 13,
    marginTop: 10,
  },
  errorCard: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: THEME.colors.surface,
  },
  errorText: {
    color: THEME.colors.danger,
    fontSize: 13,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 12,
  },
  emptyCard: {
    padding: 28,
    alignItems: 'center',
    backgroundColor: THEME.colors.surface,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  emptyBtn: {
    width: '100%',
  },
});
