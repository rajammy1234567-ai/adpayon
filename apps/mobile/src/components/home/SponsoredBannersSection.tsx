import React, { useEffect, useState } from 'react';
import {
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SponsoredBannerItem } from '@adpayon/shared';
import { getSponsoredBannersApi, trackBannerClickApi } from '../../services/api/features.api';
import { THEME } from '../../constants/theme';

export const SponsoredBannersSection: React.FC = () => {
  const [banners, setBanners] = useState<SponsoredBannerItem[]>([]);

  useEffect(() => {
    let mounted = true;
    getSponsoredBannersApi()
      .then((data) => {
        if (mounted && data) setBanners(data);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  if (!banners || banners.length === 0) {
    return null;
  }

  const handleBannerPress = (banner: SponsoredBannerItem) => {
    trackBannerClickApi(banner.id);
    if (banner.destinationUrl) {
      if (banner.destinationUrl.startsWith('http://') || banner.destinationUrl.startsWith('https://')) {
        Linking.openURL(banner.destinationUrl).catch(() => {});
      }
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {banners.map((item) => (
          <TouchableOpacity
            key={item.id}
            activeOpacity={0.85}
            onPress={() => handleBannerPress(item)}
            style={styles.bannerCard}
          >
            <Image
              source={{ uri: item.imageUrl }}
              style={styles.bannerImage}
              resizeMode="cover"
            />
            <View style={styles.overlay}>
              <View style={styles.sponsorBadge}>
                <Text style={styles.sponsorText}>{item.sponsorName || 'Sponsored'}</Text>
              </View>
              <Text style={styles.title} numberOfLines={1}>
                {item.title}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  scrollContent: {
    paddingHorizontal: 2,
    gap: 12,
  },
  bannerCard: {
    width: 290,
    height: 125,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: THEME.colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  sponsorBadge: {
    alignSelf: 'flex-start',
    backgroundColor: THEME.colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
    marginBottom: 2,
  },
  sponsorText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
});

