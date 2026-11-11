import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Image,
  Share,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Search,
  Gift,
  Share2,
  ExternalLink,
  ChevronRight,
  Coins,
  ShieldCheck,
  Tag,
} from 'lucide-react-native';
import { Category, Offer } from '@adpayon/shared';
import { Card } from '../../components/ui/Card';
import { Header } from '../../components/ui/Header';
import { THEME } from '../../constants/theme';
import { useBottomTabSpacing } from '../../hooks/useBottomTabSpacing';
import { getCategoriesApi } from '../../services/api/category.api';
import { getOffersApi, generateOfferShareLinkApi } from '../../services/api/offer.api';
import { RootStackParamList, MainTabParamList } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const CategoriesScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProp<MainTabParamList, 'Categories'>>();
  const bottomSpacing = useBottomTabSpacing();

  const [categories, setCategories] = useState<Category[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('ALL');
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sharingOfferId, setSharingOfferId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setError('');
    try {
      const [catRes, offersRes] = await Promise.all([
        getCategoriesApi(),
        getOffersApi(),
      ]);
      if (!catRes.success || !offersRes.success || !Array.isArray(catRes.data) || !Array.isArray(offersRes.data)) throw new Error('Invalid categories or offers response.');
      setCategories(catRes.data);
      setOffers(offersRes.data);
    } catch (err: any) {
      setError(err.message || 'Unable to load offers.');
      setCategories([]); setOffers([]);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Pre-select category if routed from banner or external link
  useEffect(() => {
    if (route.params?.categoryId) {
      setSelectedCategoryId(route.params.categoryId);
    }
  }, [route.params?.categoryId]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleShareOffer = async (offer: Offer) => {
    try {
      setSharingOfferId(offer.id);
      const res = await generateOfferShareLinkApi(offer.id);
      const shareUrl = res.data?.shareUrl;
      const refCode = res.data?.referralCode;

      if (!shareUrl) {
        Alert.alert('Error', 'Unable to generate share link at this time.');
        return;
      }

      const message = `${offer.content?.marketingMessage || offer.title}\n\n${shareUrl}`;

      await Share.share({
        title: offer.title,
        message,
        url: shareUrl,
      });
    } catch (err: any) {
      // User cancelled or error
      if (err.message && !err.message.includes('dismissed')) {
        Alert.alert('Share', err.message || 'Could not complete sharing.');
      }
    } finally {
      setSharingOfferId(null);
    }
  };

  const filteredOffers = useMemo(() => {
    return offers.filter((o) => {
      const matchesCategory =
        selectedCategoryId === 'ALL' || o.categoryId === selectedCategoryId;
      const matchesSearch =
        o.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [offers, selectedCategoryId, searchQuery]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) {
      map.set(c.id, c.name);
    }
    return map;
  }, [categories]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <Header
        title="Task Hub"
        subtitle="Explore verified partner offers & earn reward points"
      />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomSpacing }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={THEME.colors.primary}
          />
        }
      >
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Search size={18} color={THEME.colors.textSecondary} style={styles.searchIcon} />
          <TextInput
            placeholder="Search offers by name or keyword..."
            placeholderTextColor={THEME.colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
          />
        </View>

        {/* Categories Horizontal Scroller */}
        <View style={styles.categoriesSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryPillsContainer}
          >
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setSelectedCategoryId('ALL')}
              style={[
                styles.categoryPill,
                selectedCategoryId === 'ALL' && styles.categoryPillActive,
              ]}
            >
              <Text
                style={[
                  styles.categoryPillText,
                  selectedCategoryId === 'ALL' && styles.categoryPillTextActive,
                ]}
              >
                All Offers ({offers.length})
              </Text>
            </TouchableOpacity>

            {categories.map((cat) => {
              const count = offers.filter((o) => o.categoryId === cat.id).length;
              const isSelected = selectedCategoryId === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  activeOpacity={0.7}
                  onPress={() => setSelectedCategoryId(cat.id)}
                  style={[styles.categoryPill, isSelected && styles.categoryPillActive]}
                >
                  {cat.icon ? <Text style={styles.categoryIcon}>{cat.icon}</Text> : null}
                  <Text
                    style={[
                      styles.categoryPillText,
                      isSelected && styles.categoryPillTextActive,
                    ]}
                  >
                    {cat.name} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Informational Banner */}
        <Card variant="glass" style={styles.infoBanner}>
          <View style={styles.infoRow}>
            <ShieldCheck size={20} color={THEME.colors.emerald} style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>Verified Partner Offers</Text>
              <Text style={styles.infoText}>
                1,000 points = USD $1.00. Share with friends using your signed link. Points credit upon verified task completion.
              </Text>
            </View>
          </View>
        </Card>

        {!!error && <TouchableOpacity accessibilityRole="button" onPress={loadData} style={{ padding: 16 }}><Text style={{ color: THEME.colors.danger }}>{error} · Tap to retry</Text></TouchableOpacity>}
        {/* Offers Listing */}
        <View style={styles.offersSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {selectedCategoryId === 'ALL'
                ? 'Available Offers'
                : categoryMap.get(selectedCategoryId) || 'Offers'}
            </Text>
            <Text style={styles.sectionSub}>
              {filteredOffers.length} {filteredOffers.length === 1 ? 'offer' : 'offers'} available
            </Text>
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={THEME.colors.primary} />
              <Text style={styles.loadingText}>Loading partner offers...</Text>
            </View>
          ) : filteredOffers.length === 0 ? (
            <Card variant="default" style={styles.emptyCard}>
              <Gift size={36} color={THEME.colors.textMuted} />
              <Text style={styles.emptyTitle}>No Offers Found</Text>
              <Text style={styles.emptySub}>
                There are currently no active offers matching your filter. Please check back soon!
              </Text>
            </Card>
          ) : (
            filteredOffers.map((offer) => {
              const usdValue = (offer.rewardPoints * 0.001).toFixed(2);
              const catName = categoryMap.get(offer.categoryId) || 'Offer';
              const isSharing = sharingOfferId === offer.id;

              return (
                <TouchableOpacity
                  key={offer.id}
                  activeOpacity={0.92}
                  onPress={() =>
                    navigation.navigate('OfferDetails', { offerId: offer.id, slug: offer.slug })
                  }
                  style={styles.offerCardWrapper}
                >
                  <Card variant="default" style={styles.offerCard}>
                    {/* Banner Image if present */}
                    {offer.bannerUrl ? (
                      <View style={styles.bannerContainer}>
                        <Image
                          source={{ uri: offer.bannerUrl }}
                          style={styles.bannerImage}
                          resizeMode="cover"
                        />
                      </View>
                    ) : null}

                    <View style={styles.cardContent}>
                      {/* Top Row: Category & Reward */}
                      <View style={styles.topRow}>
                        <View style={styles.catBadge}>
                          <Tag size={12} color={THEME.colors.primary} style={{ marginRight: 4 }} />
                          <Text style={styles.catBadgeText}>{catName}</Text>
                        </View>

                        <View style={styles.rewardBadge}>
                          <Coins size={14} color="#D97706" style={{ marginRight: 4 }} />
                          <Text style={styles.rewardPoints}>
                            {offer.rewardPoints.toLocaleString()} pts
                          </Text>
                          <Text style={styles.rewardRupees}>(${usdValue} USD)</Text>
                        </View>
                      </View>

                      {/* Header Row: Logo & Title */}
                      <View style={styles.offerHeaderRow}>
                        {offer.content?.logoUrl ? (
                          <Image
                            source={{ uri: offer.content.logoUrl }}
                            style={styles.offerLogo}
                            resizeMode="contain"
                          />
                        ) : (
                          <View style={styles.offerLogoPlaceholder}>
                            <Gift size={20} color={THEME.colors.primary} />
                          </View>
                        )}
                        <View style={styles.offerHeaderInfo}>
                          <Text style={styles.offerTitle} numberOfLines={2}>
                            {offer.title}
                          </Text>
                          {!!offer.description && (
                            <Text numberOfLines={2} style={styles.offerDesc}>
                              {offer.description}
                            </Text>
                          )}
                        </View>
                      </View>

                      {/* Benefits Checklist (BankSathi reference) */}
                      {offer.content?.benefits && offer.content.benefits.length > 0 && (
                        <View style={styles.benefitsContainer}>
                          {offer.content.benefits.slice(0, 3).map((benefit, i) => (
                            <View key={i} style={styles.benefitRow}>
                              <Text style={styles.benefitCheck}>✓</Text>
                              <Text numberOfLines={1} style={styles.benefitText}>
                                {benefit}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* Actions Row */}
                      <View style={styles.actionsRow}>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            handleShareOffer(offer);
                          }}
                          disabled={isSharing}
                          style={styles.shareBtn}
                        >
                          {isSharing ? (
                            <ActivityIndicator size="small" color={THEME.colors.primary} />
                          ) : (
                            <>
                              <Share2 size={16} color={THEME.colors.primary} />
                              <Text style={styles.shareBtnText}>Share & Refer</Text>
                            </>
                          )}
                        </TouchableOpacity>

                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() =>
                            navigation.navigate('OfferDetails', { offerId: offer.id, slug: offer.slug })
                          }
                          style={styles.detailsBtn}
                        >
                          <Text style={styles.detailsBtnText}>View Details</Text>
                          <ChevronRight size={16} color="#FFFFFF" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </Card>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: THEME.colors.textPrimary,
    paddingVertical: 0,
  },
  categoriesSection: {
    marginBottom: 16,
  },
  categoryPillsContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: THEME.colors.surface,
    borderWidth: 1,
    borderColor: THEME.colors.border,
  },
  categoryPillActive: {
    backgroundColor: THEME.colors.primary,
    borderColor: THEME.colors.primary,
  },
  categoryIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  categoryPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.colors.textSecondary,
  },
  categoryPillTextActive: {
    color: '#FFFFFF',
  },
  infoBanner: {
    padding: 12,
    marginBottom: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  infoText: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 2,
    lineHeight: 15,
  },
  offersSection: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  sectionSub: {
    fontSize: 12,
    color: THEME.colors.textMuted,
  },
  offerCardWrapper: {
    marginBottom: 12,
  },
  offerCard: {
    padding: 0,
    borderRadius: 14,
    overflow: 'hidden',
  },
  bannerContainer: {
    height: 120,
    width: '100%',
    overflow: 'hidden',
    backgroundColor: THEME.colors.surfaceSubtle,
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  cardContent: {
    padding: 14,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  catBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
  },
  catBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  rewardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  rewardPoints: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400E',
    marginRight: 4,
  },
  rewardRupees: {
    fontSize: 11,
    fontWeight: '600',
    color: '#065F46',
  },
  offerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 8,
  },
  offerLogo: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  offerLogoPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(220, 38, 38, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerHeaderInfo: {
    flex: 1,
  },
  offerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginBottom: 2,
  },
  offerDesc: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    lineHeight: 16,
  },
  benefitsContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 8,
    marginVertical: 8,
    gap: 4,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  benefitCheck: {
    color: '#059669',
    fontWeight: '800',
    fontSize: 12,
  },
  benefitText: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    flex: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: THEME.colors.primary,
    backgroundColor: 'rgba(220, 38, 38, 0.04)',
  },
  shareBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.primary,
  },
  detailsBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 38,
    borderRadius: 8,
    backgroundColor: THEME.colors.primary,
  },
  detailsBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 13,
    color: THEME.colors.textSecondary,
    marginTop: 8,
  },
  emptyCard: {
    padding: 30,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginTop: 10,
  },
  emptySub: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
});
export default CategoriesScreen;
