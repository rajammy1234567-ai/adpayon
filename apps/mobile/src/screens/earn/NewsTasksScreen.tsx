import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatUsd } from '@adpayon/shared';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Header } from '../../components/ui/Header';
import { Modal } from '../../components/ui/Modal';
import { ProofImagePicker } from '../../components/ui/ProofImagePicker';
import { HomeNewsSection } from '../../components/home/HomeNewsSection';
import { THEME } from '../../constants/theme';
import { getTaskFeedApi, submitTaskProofApi, TaskFeedItem } from '../../services/api/task.api';

export const NewsTasksScreen: React.FC = () => {
  const [tasks, setTasks] = useState<TaskFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Proof submission modal state
  const [activeTask, setActiveTask] = useState<TaskFeedItem | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [proofFileId, setProofFileId] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [proofNotes, setProofNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadNewsTasks = async () => {
    try {
      const res = await getTaskFeedApi();
      if (res.success && res.data?.tasks) {
        const articleTasks = res.data.tasks.filter(
          (t) =>
            t.category === 'ARTICLE_READ' ||
            (t.instructions && t.instructions.toLowerCase().includes('article')) ||
            (t.instructions && t.instructions.toLowerCase().includes('news'))
        );
        setTasks(articleTasks);
      }
    } catch (err: any) {
      console.error('Failed to load news tasks:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadNewsTasks();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadNewsTasks();
  };

  const handleDirectReadNews = (task: TaskFeedItem) => {
    const targetUrl =
      task.externalActionUrl ||
      task.articleReadConfig?.sourceUrl ||
      'https://news.ycombinator.com';

    Linking.openURL(targetUrl).catch(() => {
      Alert.alert('Cannot Open Article', 'Unable to launch target article URL. Please check your connection.');
    });
  };

  const handleOpenProofModal = (task: TaskFeedItem) => {
    setActiveTask(task);
    setProofFileId('');
    setProofUrl(task.userSubmission?.proofUrl || '');
    setProofNotes(task.userSubmission?.notes || '');
    setIsModalVisible(true);
  };

  const handleSubmitProof = async () => {
    if (!activeTask) return;
    if (!proofFileId && !proofUrl) {
      Alert.alert('Screenshot Required', 'Please attach a screenshot proof before submitting.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await submitTaskProofApi(activeTask.id, {
        proofFileId,
        proofUrl,
        notes: proofNotes.trim() || undefined,
      });

      if (res.success) {
        setIsModalVisible(false);
        setActiveTask(null);
        setProofFileId('');
        setProofUrl('');
        setProofNotes('');
        await loadNewsTasks();
        Alert.alert(
          'Submitted for Admin Review',
          `Your article read screenshot has been submitted. +${activeTask.rewardPoints} PTS (${formatUsd(activeTask.rewardPoints * 0.001)} USD) will be credited upon approval.`
        );
      } else {
        throw new Error(res.data?.message || 'Submission failed');
      }
    } catch (err: any) {
      Alert.alert('Submission Error', err.message || 'Failed to submit proof. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <Header
        title="News Tasks"
        subtitle="Read curated financial news & upload screenshot proof to earn points"
      />

      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={THEME.colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.bannerNotice}>
            <Text style={styles.bannerNoticeText}>
              📰 Read the full article, take a screenshot of key insights, and tap "Submit Proof" for verified reward points.
            </Text>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.loaderBox}>
              <ActivityIndicator size="large" color={THEME.colors.primary} />
              <Text style={styles.loaderText}>Loading news tasks...</Text>
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyEmoji}>📰</Text>
              <Text style={styles.emptyTitle}>No News Tasks Active</Text>
              <Text style={styles.emptyDesc}>All active article reading campaigns have been completed. Check back soon!</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const subStatus = item.userSubmission?.status;
          const rejectionReason = item.userSubmission?.rejectionReason;

          return (
            <Card variant="default" style={styles.taskCard}>
              <View style={styles.cardHeader}>
                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryBadgeText}>📰 NEWS REWARD</Text>
                </View>
                <View style={styles.rewardChip}>
                  <Text style={styles.rewardPointsText}>+{item.rewardPoints} PTS</Text>
                  <Text style={styles.rewardUsdText}>({formatUsd(item.rewardPoints * 0.001)})</Text>
                </View>
              </View>

              <Text style={styles.taskTitle}>{item.title}</Text>
              <Text style={styles.taskDesc} numberOfLines={2}>
                {item.description || item.instructions || 'Read the article and upload proof.'}
              </Text>

              {/* Rejection Notice Banner */}
              {subStatus === 'REJECTED' && rejectionReason ? (
                <View style={styles.rejectionNoticeCard}>
                  <Text style={styles.rejectionNoticeTitle}>⚠️ Submission Rejected by Reviewer</Text>
                  <Text style={styles.rejectionNoticeText}>
                    {rejectionReason}. Tap "Resubmit Proof" to upload a corrected capture.
                  </Text>
                </View>
              ) : null}

              {/* Dual Action Row: Read News button (direct URL) vs Submit Proof button */}
              <View style={styles.dualActionRow}>
                <Button
                  title={`Read News (+${item.rewardPoints}) ↗️`}
                  variant="primary"
                  size="sm"
                  onPress={() => handleDirectReadNews(item)}
                  style={styles.actionBtn}
                />
                <Button
                  title={
                    subStatus === 'PENDING_REVIEW'
                      ? 'Under Review ⏳'
                      : subStatus === 'REJECTED'
                      ? 'Resubmit Proof ⚠️'
                      : subStatus === 'VERIFIED'
                      ? 'Completed ✅'
                      : 'Submit Proof 📤'
                  }
                  disabled={subStatus === 'VERIFIED'}
                  variant={
                    subStatus === 'REJECTED'
                      ? 'danger'
                      : subStatus === 'PENDING_REVIEW'
                      ? 'secondary'
                      : 'outline'
                  }
                  size="sm"
                  onPress={() => handleOpenProofModal(item)}
                  style={styles.actionBtn}
                />
              </View>
            </Card>
          );
        }}
        ListFooterComponent={
          <View style={styles.footerSection}>
            <View style={styles.divider} />
            <Text style={styles.officialHeader}>Official Platform Announcements</Text>
            <Text style={styles.officialSub}>
              Informational updates from the AdPayOn executive team. Browsing official news does not earn task points.
            </Text>
            <HomeNewsSection />
          </View>
        }
      />

      {/* Proof Submission Modal */}
      <Modal
        visible={isModalVisible}
        onClose={() => {
          if (!isSubmitting) {
            setIsModalVisible(false);
            setActiveTask(null);
          }
        }}
        title={activeTask?.title || 'Submit Screenshot Proof'}
      >
        {activeTask && (
          <View style={styles.modalContent}>
            {activeTask.userSubmission?.status === 'REJECTED' && (
              <View style={styles.rejectionNoticeCard}>
                <Text style={styles.rejectionNoticeTitle}>⚠️ Previous Submission Rejected</Text>
                <Text style={styles.rejectionNoticeText}>
                  Reason: {activeTask.userSubmission.rejectionReason}. Please upload a clear screenshot showing article reading.
                </Text>
              </View>
            )}

            <Text style={styles.modalInstructions}>
              {activeTask.instructions || '1. Read the article.\n2. Take a screenshot.\n3. Upload your proof below.'}
            </Text>

            <ProofImagePicker
              onProofUploaded={(proof) => {
                setProofFileId(proof?.fileId || '');
                setProofUrl(proof?.url || '');
              }}
              label="Attach Article Screenshot *"
              helperText="Upload clear JPEG or PNG capture showing completed article reading."
              initialProofUrl={proofUrl || activeTask.userSubmission?.proofUrl}
            />

            <Button
              title={
                isSubmitting
                  ? 'Submitting Proof...'
                  : `Submit Proof for Admin Review (+${activeTask.rewardPoints} PTS)`
              }
              onPress={handleSubmitProof}
              variant="primary"
              size="lg"
              disabled={isSubmitting || (!proofFileId && !proofUrl)}
              isLoading={isSubmitting}
              style={{ marginTop: 16 }}
            />
          </View>
        )}
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  list: {
    padding: THEME.spacing.lg,
    paddingBottom: 40,
    gap: 12,
  },
  bannerNotice: {
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.25)',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  bannerNoticeText: {
    fontSize: 12,
    color: '#0E7490',
    lineHeight: 17,
    fontWeight: '600',
  },
  taskCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.12)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryBadge: {
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0891B2',
  },
  rewardChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: THEME.colors.goldGlow,
    borderWidth: 1,
    borderColor: THEME.colors.goldDark,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  rewardPointsText: {
    fontSize: 11,
    fontWeight: '900',
    color: THEME.colors.goldLight,
  },
  rewardUsdText: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 4,
  },
  taskDesc: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    lineHeight: 17,
    marginBottom: 12,
  },
  rejectionNoticeCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  rejectionNoticeTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.danger,
    marginBottom: 2,
  },
  rejectionNoticeText: {
    fontSize: 11,
    color: THEME.colors.danger,
    lineHeight: 15,
  },
  dualActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  actionBtn: {
    flex: 1,
  },
  footerSection: {
    marginTop: 20,
  },
  divider: {
    height: 1,
    backgroundColor: THEME.colors.border,
    marginVertical: 14,
  },
  officialHeader: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 2,
  },
  officialSub: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginBottom: 12,
    lineHeight: 16,
  },
  loaderBox: {
    padding: 40,
    alignItems: 'center',
  },
  loaderText: {
    marginTop: 10,
    fontSize: 12,
    color: THEME.colors.textSecondary,
  },
  emptyBox: {
    padding: 40,
    alignItems: 'center',
  },
  emptyEmoji: {
    fontSize: 38,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  emptyDesc: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  modalContent: {
    paddingVertical: 10,
  },
  modalInstructions: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
  },
});

