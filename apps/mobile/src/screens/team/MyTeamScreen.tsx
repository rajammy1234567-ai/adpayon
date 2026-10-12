import React, { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { TeamMemberNode } from '@adpayon/shared';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { Header } from '../../components/ui/Header';
import { THEME } from '../../constants/theme';
import { MOCK_TEAM_TREE } from '../../services/mockData';
import { useAuthStore } from '../../store/authStore';

export const MyTeamScreen: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    usr_1001: true,
    usr_2001: true,
  });

  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  };

  const renderTreeNode = (node: TeamMemberNode, depth = 0) => {
    const isExpanded = !!expandedNodes[node.id];
    const hasChildren = node.hasChildren && node.children && node.children.length > 0;

    return (
      <View key={node.id} style={[styles.nodeContainer, { marginLeft: depth * 14 }]}>
        <Card
          variant={node.id === user?.id ? 'emerald' : 'default'}
          style={styles.nodeCard}
        >
          <View style={styles.nodeHeader}>
            <View style={styles.nodeHeaderLeft}>
              <View
                style={[
                  styles.legIndicator,
                  node.leg === 'LEFT'
                    ? styles.legLeft
                    : node.leg === 'RIGHT'
                    ? styles.legRight
                    : styles.legRoot,
                ]}
              >
                <Text style={styles.legIndicatorText}>
                  {node.leg ? node.leg[0] : '★'}
                </Text>
              </View>

              <View>
                <View style={styles.nameRow}>
                  <Text style={styles.nodeName}>{node.name}</Text>
                  {node.currentRank !== 'NONE' ? (
                    <Badge label={node.currentRank} variant="gold" style={styles.rankBadge} />
                  ) : null}
                </View>
                <Text style={styles.nodeSub}>
                  ID: {node.referralCode} • {node.mobileMasked}
                </Text>
              </View>
            </View>

            <Badge
              label={node.isActive ? t('common.active') : t('common.inactive')}
              variant={node.isActive ? 'active' : 'inactive'}
            />
          </View>

          <View style={styles.nodeStatsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Directs</Text>
              <Text style={styles.statVal}>{node.directReferralsCount}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Left Team</Text>
              <Text style={styles.statVal}>{node.leftCount}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Right Team</Text>
              <Text style={styles.statVal}>{node.rightCount}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Level</Text>
              <Text style={styles.statVal}>L{node.level}</Text>
            </View>
          </View>

          {hasChildren ? (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => toggleNode(node.id)}
              style={styles.expandToggle}
            >
              <Text style={styles.expandText}>
                {isExpanded ? '▲ Collapse Downline' : `▼ Expand Children (${node.children?.length})`}
              </Text>
            </TouchableOpacity>
          ) : null}
        </Card>

        {/* Recursive Children rendering */}
        {hasChildren && isExpanded
          ? node.children!.map((child) => renderTreeNode(child, depth + 1))
          : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title={t('team.myTeam')}
        subtitle={t('team.treeOverview')}
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Binary Leg Stats Summary Card */}
        <Card variant="elevated" style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Binary Pair Volume Meter</Text>

          <View style={styles.legColumnsRow}>
            {/* Left */}
            <View style={[styles.legCol, styles.legColLeft]}>
              <Text style={styles.legColHeader}>⬅️ LEFT LEG</Text>
              <Text style={styles.legCountText}>
                {user?.binaryStats.leftCount || 42} Active Members
              </Text>
              <View style={styles.volumePill}>
                <Text style={styles.volumeText}>
                  {user?.binaryStats.leftVolumeUnits || 1420} PV
                </Text>
              </View>
              <Text style={styles.carryLabel}>
                Carry: +{user?.binaryStats.leftCarryForwardUnits || 320} PV
              </Text>
            </View>

            <View style={styles.vsCircle}>
              <Text style={styles.vsText}>VS</Text>
            </View>

            {/* Right */}
            <View style={[styles.legCol, styles.legColRight]}>
              <Text style={styles.legColHeader}>➡️ RIGHT LEG</Text>
              <Text style={styles.legCountText}>
                {user?.binaryStats.rightCount || 38} Active Members
              </Text>
              <View style={styles.volumePill}>
                <Text style={styles.volumeText}>
                  {user?.binaryStats.rightVolumeUnits || 1100} PV
                </Text>
              </View>
              <Text style={styles.carryLabel}>
                Matched: {user?.binaryStats.lifetimeMatchedVolumeUnits || 1100} PV
              </Text>
            </View>
          </View>
        </Card>

        {/* Tree Header */}
        <View style={styles.treeSectionHeader}>
          <Text style={styles.treeTitle}>8-Level Hierarchy Visualizer</Text>
          <Text style={styles.treeSub}>
            Tap any node to view descendants and leg branches
          </Text>
        </View>

        {/* Render Root and Recursive Tree */}
        {renderTreeNode(MOCK_TEAM_TREE, 0)}
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
    paddingBottom: 40,
  },
  summaryCard: {
    padding: THEME.spacing.lg,
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 12,
  },
  legColumnsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  legCol: {
    flex: 1,
    backgroundColor: THEME.colors.surfaceSubtle,
    padding: 12,
    borderRadius: THEME.borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  legColLeft: {
    borderColor: THEME.colors.cyanGlow,
  },
  legColRight: {
    borderColor: THEME.colors.goldGlow,
  },
  legColHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: THEME.colors.textSecondary,
    marginBottom: 4,
  },
  legCountText: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    marginBottom: 8,
  },
  volumePill: {
    backgroundColor: THEME.colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: THEME.borderRadius.full,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  volumeText: {
    fontSize: 14,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  carryLabel: {
    fontSize: 10,
    color: THEME.colors.emerald,
    marginTop: 6,
    fontWeight: '700',
  },
  vsCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: THEME.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  vsText: {
    fontSize: 11,
    fontWeight: '900',
    color: THEME.colors.textMuted,
  },
  treeSectionHeader: {
    marginBottom: 14,
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
  nodeContainer: {
    marginBottom: 10,
  },
  nodeCard: {
    padding: 12,
  },
  nodeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  nodeHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  legIndicator: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1,
  },
  legLeft: {
    backgroundColor: THEME.colors.cyanGlow,
    borderColor: THEME.colors.cyan,
  },
  legRight: {
    backgroundColor: THEME.colors.goldGlow,
    borderColor: THEME.colors.gold,
  },
  legRoot: {
    backgroundColor: THEME.colors.emeraldGlow,
    borderColor: THEME.colors.emerald,
  },
  legIndicatorText: {
    fontSize: 13,
    fontWeight: '900',
    color: THEME.colors.textPrimary,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nodeName: {
    fontSize: 14,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  rankBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  nodeSub: {
    fontSize: 11,
    color: THEME.colors.textMuted,
    marginTop: 2,
  },
  nodeStatsRow: {
    flexDirection: 'row',
    backgroundColor: THEME.colors.surfaceSubtle,
    borderRadius: THEME.borderRadius.sm,
    padding: 8,
    justifyContent: 'space-between',
  },
  statBox: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 10,
    color: THEME.colors.textMuted,
    fontWeight: '600',
  },
  statVal: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginTop: 2,
  },
  expandToggle: {
    marginTop: 10,
    alignItems: 'center',
    paddingVertical: 4,
  },
  expandText: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.emerald,
  },
});
