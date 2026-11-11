import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SponsoredBannerItem } from '@adpayon/shared';
import { getSponsoredBannersApi, trackBannerClickApi } from '../../services/api/features.api';
import { THEME } from '../../constants/theme';

export const SponsoredBannersSection: React.FC = () => {
  const navigation = useNavigation<any>();
  const [banners, setBanners] = useState<SponsoredBannerItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const [containerWidth, setContainerWidth] = useState(Dimensions.get('window').width - 32);

  const fallbackBanners: SponsoredBannerItem[] = [
    {
      id: 'default-1',
      title: 'HDFC Millennia Card • 5% Cashback on Top Brands',
      sponsorName: 'HDFC Bank Partner',
      imageUrl: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=1200&q=80',
      destinationUrl: '',
      ctaText: 'Explore',
      targetCategory: 'ALL',
      active: true,
      displayOrder: 1,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'default-2',
      title: 'Kotak 811 Digital Account • Zero Balance & Video KYC',
      sponsorName: 'Kotak Mahindra Partner',
      imageUrl: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?auto=format&fit=crop&w=1200&q=80',
      destinationUrl: '',
      ctaText: 'Apply Now',
      targetCategory: 'ALL',
      active: true,
      displayOrder: 2,
      createdAt: new Date().toISOString(),
    },
  ];

  useEffect(() => {
    let mounted = true;
    getSponsoredBannersApi()
      .then((data) => {
        if (mounted) {
          if (data && data.length > 0) {
            setBanners(data);
          } else {
            setBanners(fallbackBanners);
          }
        }
      })
      .catch(() => {
        if (mounted) setBanners(fallbackBanners);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Auto-advance banner carousel every 4.5 seconds if multiple banners
  useEffect(() => {
    if (banners.length <= 1) return;

    const timer = setInterval(() => {
      setActiveIndex((prev) => {
        const nextIndex = (prev + 1) % banners.length;
        if (scrollRef.current && containerWidth > 0) {
          scrollRef.current.scrollTo({ x: nextIndex * containerWidth, animated: true });
        }
        return nextIndex;
      });
    }, 4500);

    return () => clearInterval(timer);
  }, [banners.length, containerWidth]);

  const handleBannerPress = (banner: SponsoredBannerItem) => {
    if (banner.id && !banner.id.startsWith('default-')) {
      trackBannerClickApi(banner.id).catch(() => {});
    }
    const targetCategory =
      banner.targetCategory && banner.targetCategory !== 'ALL'
        ? banner.targetCategory
        : undefined;

    navigation.navigate('MainTabs', {
      screen: 'Categories',
      params: targetCategory ? { categoryId: targetCategory } : undefined,
    });
  };

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    if (containerWidth > 0) {
      const idx = Math.round(offsetX / containerWidth);
      if (idx !== activeIndex && idx >= 0 && idx < banners.length) {
        setActiveIndex(idx);
      }
    }
  };

  if (!banners || banners.length === 0) {
    return null;
  }

  // Responsive card height: mobile ~140px, desktop up to 200px maintaining good proportion
  const cardHeight = Math.min(200, Math.max(140, Math.round(containerWidth * 0.32)));

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0) setContainerWidth(w);
      }}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        style={{ width: containerWidth }}
      >
        {banners.map((item) => (
          <TouchableOpacity
            key={item.id}
            activeOpacity={0.9}
            onPress={() => handleBannerPress(item)}
            style={[styles.bannerCard, { width: containerWidth, height: cardHeight }]}
          >
            <Image
              source={{ uri: item.imageUrl }}
              style={styles.bannerImage}
              resizeMode="cover"
            />
            <View style={styles.overlay}>
              <View style={styles.topMetaRow}>
                <View style={styles.sponsorBadge}>
                  <Text style={styles.sponsorText}>{item.sponsorName || 'Sponsored'}</Text>
                </View>
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedText}>Verified Partner</Text>
                </View>
              </View>

              <View style={styles.bottomInfoRow}>
                <View style={styles.titleCol}>
                  <Text style={styles.bannerTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => handleBannerPress(item)}
                  style={styles.ctaButton}
                >
                  <Text style={styles.ctaText}>{item.ctaText || 'Explore'} ↗</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Carousel Indicators */}
      {banners.length > 1 ? (
        <View style={styles.indicatorsRow}>
          {banners.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                activeIndex === index ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
    width: '100%',
  },
  bannerCard: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: THEME.colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    position: 'relative',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  topMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sponsorBadge: {
    backgroundColor: THEME.colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  sponsorText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  verifiedBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  verifiedText: {
    color: '#E5E7EB',
    fontSize: 9,
    fontWeight: '700',
  },
  bottomInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleCol: {
    flex: 1,
  },
  bannerTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  ctaButton: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  ctaText: {
    color: THEME.colors.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  indicatorsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  dot: {
    height: 5,
    borderRadius: 3,
  },
  dotActive: {
    width: 18,
    backgroundColor: THEME.colors.primary,
  },
  dotInactive: {
    width: 6,
    backgroundColor: '#D1D5DB',
  },
});
