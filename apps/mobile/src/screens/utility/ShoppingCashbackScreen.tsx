import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShoppingMerchantItem, CashbackClaimItem, formatUsd } from '@adpayon/shared';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Header } from '../../components/ui/Header';
import { Modal } from '../../components/ui/Modal';
import { ProofImagePicker } from '../../components/ui/ProofImagePicker';
import { THEME } from '../../constants/theme';
import {
  getShoppingMerchantsApi,
  submitCashbackClaimApi,
  getUserCashbackClaimsApi,
} from '../../services/api/features.api';

export const ShoppingCashbackScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'STORES' | 'MY_CLAIMS'>('STORES');
  const [merchants, setMerchants] = useState<ShoppingMerchantItem[]>([]);
  const [claims, setClaims] = useState<CashbackClaimItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Claim Modal State
  const [claimModalVisible, setClaimModalVisible] = useState(false);
  const [selectedMerchant, setSelectedMerchant] = useState<ShoppingMerchantItem | null>(null);
  const [orderId, setOrderId] = useState('');
  const [orderAmount, setOrderAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [uploadedFileId, setUploadedFileId] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [submittingClaim, setSubmittingClaim] = useState(false);

  const loadData = async () => {
    try {
      if (activeTab === 'STORES') {
        const data = await getShoppingMerchantsApi();
        setMerchants(data);
      } else {
        const data = await getUserCashbackClaimsApi();
        setClaims(data);
      }
    } catch (err: any) {
      console.error('Failed to load shopping data', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [activeTab]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleOpenStore = (store: ShoppingMerchantItem) => {
    Alert.alert(
      `Redirecting to ${store.name}`,
      `Affiliate session will be opened in your browser. Complete your purchase normally, then return here and tap "Claim Cashback" with your order invoice.\n\nNote: Simply clicking this link does not create earnings. Verification requires an approved invoice.`,
      [
        {
          text: 'Open Store',
          onPress: () => {
            if (store.destinationUrl) {
              Linking.openURL(store.destinationUrl).catch(() => {});
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleOpenClaimModal = (store: ShoppingMerchantItem) => {
    setSelectedMerchant(store);
    setOrderId('');
    setOrderAmount('');
    setNotes('');
    setUploadedFileId(null);
    setUploadedUrl(null);
    setClaimModalVisible(true);
  };

  const handleSubmitClaim = async () => {
    if (!selectedMerchant) return;
    if (!orderId.trim()) {
      Alert.alert('Required', 'Please enter your order ID or invoice number.');
      return;
    }
    const amt = parseFloat(orderAmount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert('Required', 'Please enter a valid positive order amount.');
      return;
    }
    if (!uploadedFileId && !uploadedUrl) {
      Alert.alert('Required', 'Please upload a screenshot of your purchase invoice or receipt.');
      return;
    }

    try {
      setSubmittingClaim(true);
      // Estimate points as ~5% of purchase (50 pts per dollar, 1,000 pts = $1)
      const estimatedPoints = Math.max(10, Math.round(amt * 50));

      await submitCashbackClaimApi({
        merchantId: selectedMerchant.id,
        orderId: orderId.trim(),
        orderAmount: amt,
        claimedPoints: estimatedPoints,
        proofFileId: uploadedFileId || undefined,
        proofUrl: uploadedUrl || undefined,
        notes: notes.trim() || undefined,
      });

      setClaimModalVisible(false);
      Alert.alert(
        'Claim Submitted! 🛍️',
        'Your invoice has been submitted for admin verification. Points will be credited once the purchase is confirmed.'
      );
      setActiveTab('MY_CLAIMS');
    } catch (err: any) {
      Alert.alert('Submission Failed', err.message || 'Could not submit claim.');
    } finally {
      setSubmittingClaim(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <Header
        title="Shopping Cashback"
        subtitle="Earn real cash rewards on purchases from partner retail stores"
      />

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setActiveTab('STORES')}
          style={[styles.tabBtn, activeTab === 'STORES' && styles.tabBtnActive]}
        >
          <Text style={[styles.tabText, activeTab === 'STORES' && styles.tabTextActive]}>
            Partner Stores
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setActiveTab('MY_CLAIMS')}
          style={[styles.tabBtn, activeTab === 'MY_CLAIMS' && styles.tabBtnActive]}
        >
          <Text style={[styles.tabText, activeTab === 'MY_CLAIMS' && styles.tabTextActive]}>
            My Claims
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={THEME.colors.primary}
          />
        }
      >
        {activeTab === 'STORES' ? (
          <>
            {/* Banner */}
            <Card variant="gold" style={styles.bannerCard}>
              <View style={styles.bannerRow}>
                <Text style={styles.bannerEmoji}>🛍️</Text>
                <View style={styles.bannerCol}>
                  <Text style={styles.bannerTitle}>Genuine Cashback Engine</Text>
                  <Text style={styles.bannerDesc}>
                    Shop via partner links, upload your purchase receipt, and earn verified points (1,000 pts = $1 USD).
                  </Text>
                </View>
              </View>
            </Card>

            <Text style={styles.storesHeader}>Popular Retail Stores</Text>

            {loading ? (
              <View style={styles.loaderBox}>
                <ActivityIndicator size="large" color={THEME.colors.primary} />
                <Text style={styles.loaderText}>Loading verified merchant partners...</Text>
              </View>
            ) : merchants.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyEmoji}>🏬</Text>
                <Text style={styles.emptyTitle}>No Merchants Listed</Text>
                <Text style={styles.emptyDesc}>New partner retail stores will appear here soon.</Text>
              </View>
            ) : (
              <View style={styles.storesGrid}>
                {merchants.map((store) => (
                  <Card key={store.id} variant="default" style={styles.storeCard}>
                    <View style={styles.storeHeader}>
                      <Image source={{ uri: store.logoUrl }} style={styles.storeLogo} resizeMode="contain" />
                      {store.featuredBadge && (
                        <Badge label={store.featuredBadge} variant="gold" />
                      )}
                    </View>

                    <Text style={styles.storeName}>{store.name}</Text>
                    <Text style={styles.storeDesc} numberOfLines={2}>
                      {store.description}
                    </Text>

                    <View style={styles.termsBox}>
                      <Text style={styles.termsLabel}>Terms:</Text>
                      <Text style={styles.termsValue}>{store.cashbackTerms}</Text>
                    </View>

                    <View style={styles.storeBtnRow}>
                      <Button
                        title="Shop Now ↗"
                        onPress={() => handleOpenStore(store)}
                        variant="secondary"
                        size="sm"
                        style={{ flex: 1 }}
                      />
                      <Button
                        title="Claim"
                        onPress={() => handleOpenClaimModal(store)}
                        variant="primary"
                        size="sm"
                        style={{ flex: 1 }}
                      />
                    </View>
                  </Card>
                ))}
              </View>
            )}
          </>
        ) : (
          // My Claims Tab
          <View style={styles.claimsContainer}>
            <Text style={styles.storesHeader}>My Submitted Claims</Text>

            {loading ? (
              <View style={styles.loaderBox}>
                <ActivityIndicator size="large" color={THEME.colors.primary} />
                <Text style={styles.loaderText}>Loading your claims history...</Text>
              </View>
            ) : claims.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyEmoji}>🧾</Text>
                <Text style={styles.emptyTitle}>No Claims Submitted Yet</Text>
                <Text style={styles.emptyDesc}>After making a partner purchase, submit your invoice here.</Text>
              </View>
            ) : (
              <View style={styles.claimsList}>
                {claims.map((claim) => (
                  <Card key={claim.id} variant="default" style={styles.claimCard}>
                    <View style={styles.claimHeader}>
                      <View>
                        <Text style={styles.claimMerchant}>{claim.merchantName}</Text>
                        <Text style={styles.claimOrderId}>Order #{claim.orderId}</Text>
                      </View>
                      <View
                        style={[
                          styles.claimStatusBadge,
                          claim.status === 'APPROVED'
                            ? styles.statusApproved
                            : claim.status === 'REJECTED'
                            ? styles.statusRejected
                            : styles.statusPending,
                        ]}
                      >
                        <Text
                          style={[
                            styles.claimStatusText,
                            claim.status === 'APPROVED'
                              ? styles.statusTextApproved
                              : claim.status === 'REJECTED'
                              ? styles.statusTextRejected
                              : styles.statusTextPending,
                          ]}
                        >
                          {claim.status}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.claimMetaRow}>
                      <Text style={styles.claimAmount}>Amount: ${claim.orderAmount} {claim.currency}</Text>
                      <Text style={styles.claimPoints}>
                        {claim.status === 'APPROVED' && claim.approvedPoints
                          ? `+${claim.approvedPoints} pts (${formatUsd(claim.approvedPoints / 1000)})`
                          : `Claimed: ${claim.claimedPoints} pts`}
                      </Text>
                    </View>

                    {claim.rejectionReason && (
                      <View style={styles.rejectionBox}>
                        <Text style={styles.rejectionHeader}>Rejection Reason:</Text>
                        <Text style={styles.rejectionText}>{claim.rejectionReason}</Text>
                      </View>
                    )}
                  </Card>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Claim Submission Modal */}
      {selectedMerchant && (
        <Modal
          visible={claimModalVisible}
          onClose={() => setClaimModalVisible(false)}
          title={`Claim Cashback: ${selectedMerchant.name}`}
        >
          <ScrollView style={styles.modalScroll}>
            <Text style={styles.inputLabel}>Order ID / Receipt Number *</Text>
            <TextInput
              value={orderId}
              onChangeText={setOrderId}
              placeholder="e.g. AMZ-982144-IN"
              placeholderTextColor={THEME.colors.textSecondary}
              style={styles.modalInput}
            />

            <Text style={styles.inputLabel}>Order Total Amount (USD) *</Text>
            <TextInput
              value={orderAmount}
              onChangeText={setOrderAmount}
              placeholder="e.g. 45.00"
              keyboardType="decimal-pad"
              placeholderTextColor={THEME.colors.textSecondary}
              style={styles.modalInput}
            />

            <Text style={styles.inputLabel}>Upload Invoice / Receipt Screenshot *</Text>
            <ProofImagePicker
              onProofUploaded={(proof) => {
                setUploadedFileId(proof?.fileId || null);
                setUploadedUrl(proof?.url || null);
              }}
            />

            <Text style={styles.inputLabel}>Notes (Optional)</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Item purchased or delivery note"
              placeholderTextColor={THEME.colors.textSecondary}
              style={[styles.modalInput, { height: 60 }]}
              multiline
            />

            <Button
              title={submittingClaim ? 'Submitting...' : 'Submit for Review'}
              onPress={handleSubmitClaim}
              variant="primary"
              size="lg"
              disabled={submittingClaim}
              style={{ marginTop: 16 }}
            />
          </ScrollView>
        </Modal>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.colors.background,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: THEME.colors.border,
    backgroundColor: THEME.colors.surface,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: THEME.colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: THEME.colors.textSecondary,
  },
  tabTextActive: {
    color: THEME.colors.primary,
    fontWeight: '800',
  },
  scroll: {
    padding: THEME.spacing.lg,
    paddingBottom: 40,
  },
  bannerCard: {
    padding: THEME.spacing.lg,
    marginBottom: 20,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bannerEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  bannerCol: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 2,
  },
  bannerDesc: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    lineHeight: 16,
  },
  storesHeader: {
    fontSize: 16,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 12,
  },
  loaderBox: {
    padding: 30,
    alignItems: 'center',
  },
  loaderText: {
    marginTop: 8,
    fontSize: 12,
    color: THEME.colors.textSecondary,
  },
  emptyBox: {
    padding: 30,
    alignItems: 'center',
  },
  emptyEmoji: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  emptyDesc: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  storesGrid: {
    gap: 14,
  },
  storeCard: {
    padding: 14,
  },
  storeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  storeLogo: {
    width: 80,
    height: 35,
  },
  storeName: {
    fontSize: 15,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
    marginBottom: 4,
  },
  storeDesc: {
    fontSize: 12,
    color: THEME.colors.textSecondary,
    lineHeight: 16,
    marginBottom: 10,
  },
  termsBox: {
    backgroundColor: 'rgba(217, 119, 6, 0.08)',
    padding: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  termsLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D97706',
    textTransform: 'uppercase',
  },
  termsValue: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
  },
  storeBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  claimsContainer: {
    gap: 12,
  },
  claimsList: {
    gap: 12,
  },
  claimCard: {
    padding: 14,
  },
  claimHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  claimMerchant: {
    fontSize: 14,
    fontWeight: '800',
    color: THEME.colors.textPrimary,
  },
  claimOrderId: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
  },
  claimStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusApproved: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  statusRejected: {
    backgroundColor: 'rgba(220, 38, 38, 0.12)',
  },
  statusPending: {
    backgroundColor: 'rgba(217, 119, 6, 0.12)',
  },
  claimStatusText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  statusTextApproved: {
    color: THEME.colors.emerald,
  },
  statusTextRejected: {
    color: THEME.colors.primary,
  },
  statusTextPending: {
    color: '#D97706',
  },
  claimMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: THEME.colors.border,
  },
  claimAmount: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.textPrimary,
  },
  claimPoints: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.colors.emerald,
  },
  rejectionBox: {
    marginTop: 8,
    padding: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(220, 38, 38, 0.06)',
  },
  rejectionHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.colors.primary,
    textTransform: 'uppercase',
  },
  rejectionText: {
    fontSize: 11,
    color: THEME.colors.textSecondary,
    marginTop: 2,
  },
  modalScroll: {
    maxHeight: 400,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.textPrimary,
    marginTop: 10,
    marginBottom: 4,
  },
  modalInput: {
    backgroundColor: THEME.colors.surface,
    borderWidth: 1,
    borderColor: THEME.colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: THEME.colors.textPrimary,
  },
});
