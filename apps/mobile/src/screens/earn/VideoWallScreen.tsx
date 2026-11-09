import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VideoContentItem, formatUsd } from '@adpayon/shared';
import { Card } from '../../components/ui/Card';
import { Header } from '../../components/ui/Header';
import { THEME } from '../../constants/theme';
import { getPublishedVideosApi } from '../../services/api/features.api';

export const VideoWallScreen: React.FC = () => {
  const [videos, setVideos] = useState<VideoContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  const categories = ['ALL', 'Learning', 'Product', 'Tutorial', 'Entertainment'];

  const loadVideos = async () => {
    try {
      const data = await getPublishedVideosApi(selectedCategory);
      setVideos(data);
    } catch (err: any) {
      console.error('Failed to load videos', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadVideos();
  }, [selectedCategory]);

  const onRefresh = () => {
    setRefreshing(true);
    loadVideos();
  };

  const handleOpenVideo = (video: VideoContentItem) => {
    if (video.videoUrl) {
      Linking.openURL(video.videoUrl).catch(() => {});
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <Header
        title="Video Wall"
        subtitle="Watch educational partner presentations and task tutorials"
      />

      <View style={styles.categoryBar}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={categories}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.categoryList}
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setSelectedCategory(item)}
              style={[
                styles.categoryChip,
                selectedCategory === item && styles.categoryChipActive,
              ]}
            >
              <Text
                style={[
                  styles.categoryText,
                  selectedCategory === item && styles.categoryTextActive,
                ]}
              >
                {item}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      <FlatList
        data={videos}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={THEME.colors.primary}
          />
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.loaderBox}>
              <ActivityIndicator size="large" color={THEME.colors.primary} />
              <Text style={styles.loaderText}>Loading published videos...</Text>
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyEmoji}>🎬</Text>
              <Text style={styles.emptyTitle}>No Videos Available</Text>
              <Text style={styles.emptyDesc}>Check back soon for new video streams.</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Card variant="default" style={styles.videoCard}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => handleOpenVideo(item)}
              style={styles.thumbnailWrapper}
            >
              <Image
                source={{ uri: item.thumbnailUrl }}
                style={styles.thumbnail}
                resizeMode="cover"
              />
              <View style={styles.playIconOverlay}>
                <Text style={styles.playIcon}>▶</Text>
              </View>
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>{formatDuration(item.durationSeconds)}</Text>
              </View>
              <View style={styles.badgeTopLeft}>
                <Text
                  style={[
                    styles.tagText,
                    item.isRewardBearing ? styles.tagReward : styles.tagInfo,
                  ]}
                >
                  {item.isRewardBearing
                    ? `${item.rewardPoints} PTS (${formatUsd(item.usdValue)})`
                    : 'INFO'}
                </Text>
              </View>
            </TouchableOpacity>

            <View style={styles.videoInfo}>
              <Text style={styles.categoryLabel}>{item.category}</Text>
              <Text style={styles.videoTitle} numberOfLines={2}>
                {item.title}
              </Text>
              {item.instructions && item.instructions.length > 0 && (
                <Text style={styles.instructionSnippet} numberOfLines={1}>
                  • {item.instructions[0]}
                </Text>
              )}
            </View>
          </Card>
        )}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  categoryBar: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
  },
  categoryList: {
    paddingHorizontal: THEME.spacing.lg,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: THEME.colors.surface,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  categoryChipActive: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primary,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  categoryTextActive: {
    color: '#FFF',
  },
  list: {
    padding: THEME.spacing.lg,
    gap: 16,
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
    fontSize: 40,
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
    marginTop: 4,
  },
  videoCard: {
    overflow: 'hidden',
    padding: 0,
  },
  thumbnailWrapper: {
    width: '100%',
    height: 170,
    position: 'relative',
    backgroundColor: '#000',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  playIconOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -22,
    marginLeft: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    color: '#FFF',
    fontSize: 18,
    marginLeft: 3,
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  badgeTopLeft: {
    position: 'absolute',
    top: 8,
    left: 8,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
    textTransform: 'uppercase',
  },
  tagReward: {
    backgroundColor: 'rgba(217, 119, 6, 0.9)',
    color: '#FFF',
  },
  tagInfo: {
    backgroundColor: 'rgba(59, 130, 246, 0.85)',
    color: '#FFF',
  },
  videoInfo: {
    padding: 14,
  },
  categoryLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.primary,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  videoTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    lineHeight: 20,
    marginBottom: 4,
  },
  instructionSnippet: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    lineHeight: 16,
  },
});

