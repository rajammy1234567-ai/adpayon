import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Share,
  Alert,
  Linking,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ArrowLeft,
  Share2,
  ExternalLink,
  Play,
  CheckCircle,
  Coins,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react-native';
import { Offer } from '@adpayon/shared';
import { THEME } from '../../constants/theme';
import {
  getOfferDetailsApi,
  getOfferActivityApi,
  generateOfferShareLinkApi,
  completeOfferApi,
} from '../../services/api/offer.api';
import { RootStackParamList } from '../../navigation/types';
import { ProofImagePicker } from '../../components/ui/ProofImagePicker';

type DetailSection = 'Benefits' | 'Whom to sell?' | 'T&C' | 'How to perform?' | 'FAQs';

export const OfferDetailsScreen = () => {
  const { params } = useRoute<RouteProp<RootStackParamList, 'OfferDetails'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  const [offer, setOffer] = useState<Offer | null>(null);
  const [activity, setActivity] = useState<{
    personalStats: NonNullable<Offer['personalStats']>;
    submission: Offer['submission'] | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'Details' | 'Marketing' | 'Training'>('Details');
  const [section, setSection] = useState<DetailSection>('Benefits');
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [showSubmission, setShowSubmission] = useState(false);
  const [notes, setNotes] = useState('');
  const [proofFileId, setProofFileId] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [completionCode, setCompletionCode] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const detail = await getOfferDetailsApi(params.offerId || params.slug || '');
      if (!detail.success || !detail.data?.id)
        throw new Error('Invalid offer response. Please retry.');
      const status = await getOfferActivityApi(detail.data.id);
      if (!status.success) throw new Error('Unable to load your offer activity.');
      setOffer(detail.data);
      setActivity(status.data);
    } catch (e: any) {
      setError(e.message || 'Unable to load offer.');
    } finally {
      setLoading(false);
    }
  }, [params.offerId, params.slug]);

  useEffect(() => {
    load();
  }, [load]);

  const open = async (url: string) => {
    try {
      if (!/^https?:\/\//i.test(url)) throw new Error('This link is unavailable.');
      await Linking.openURL(url);
    } catch (e: any) {
      Alert.alert('Cannot open link', e.message || 'Please try again.');
    }
  };

  const share = async (banner?: { title: string; imageUrl: string }) => {
    if (!offer || busy) return;
    setBusy(true);
    try {
      const response = await generateOfferShareLinkApi(offer.id);
      if (!response.success || !response.data.shareUrl)
        throw new Error('Could not generate share link.');
      const message = [
        offer.content?.marketingMessage || offer.title,
        banner?.title,
        banner?.imageUrl,
        response.data.shareUrl,
      ]
        .filter(Boolean)
        .join('\n\n');
      if (Platform.OS === 'web')
        await Linking.openURL(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`);
      else await Share.share({ title: offer.title, message });
    } catch (e: any) {
      Alert.alert('Share unavailable', e.message || 'Please retry.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!offer || busy) return;
    if (notes.trim().length < 5) {
      Alert.alert('Completion details', 'Describe what was completed (at least 5 characters).');
      return;
    }
    if (offer.completionConditions.requiresProof && !proofFileId && !proofUrl) {
      Alert.alert('Proof Screenshot Required', 'Please upload a screenshot proof of completion.');
      return;
    }

    setBusy(true);
    try {
      await completeOfferApi(offer.id, {
        notes: notes.trim(),
        proofFileId: proofFileId || undefined,
        proofUrl: proofUrl.trim() || undefined,
        completionCode: completionCode.trim() || undefined,
      });
      setShowSubmission(false);
      await load();
      Alert.alert(
        'Submitted for Review',
        'Your submission is now pending admin review. No points are credited until explicitly verified.'
      );
    } catch (e: any) {
      Alert.alert('Submission failed', e.message || 'Please retry.');
    } finally {
      setBusy(false);
    }
  };

  const points = (title: string, items?: string[]) =>
    items?.length ? (
      <View style={styles.card}>
        <Text style={styles.heading}>{title}</Text>
        {items.map((text, i) => (
          <View key={i} style={styles.point}>
            <CheckCircle size={18} color={THEME.colors.primary} />
            <Text style={styles.body}>{text}</Text>
          </View>
        ))}
      </View>
    ) : null;

  const c = offer?.content || {};
  const usdReward = offer ? (offer.rewardPoints * 0.001).toFixed(2) : '0.00';

  const hasMarketing = Boolean(
    (c.marketingBanners && c.marketingBanners.length > 0) ||
      (offer?.images && offer.images.length > 0) ||
      !!c.marketingMessage
  );

  const hasTraining = Boolean(
    (offer?.trainingLinks && offer.trainingLinks.length > 0) ||
      (c.trackingNotes && c.trackingNotes.length > 0) ||
      (c.payoutNotes && c.payoutNotes.length > 0)
  );

  const availableTabs = React.useMemo(() => {
    const tabs: ('Details' | 'Marketing' | 'Training')[] = ['Details'];
    if (hasMarketing) tabs.push('Marketing');
    if (hasTraining) tabs.push('Training');
    return tabs;
  }, [hasMarketing, hasTraining]);

  React.useEffect(() => {
    if (!availableTabs.includes(tab)) {
      setTab(availableTabs[0] || 'Details');
    }
  }, [availableTabs, tab]);

  const hasBenefits = Boolean(offer?.description || (c.benefits && c.benefits.length > 0));
  const hasEligibility = Boolean(
    (c.eligibility && c.eligibility.length > 0) || (c.documents && c.documents.length > 0)
  );
  const hasSteps = Boolean(offer?.instructions && offer.instructions.length > 0);
  const hasTerms = Boolean((c.terms && c.terms.length > 0) || offer?.additionalNotes);
  const hasFaqs = Boolean(offer?.faqs && offer.faqs.length > 0);

  const availableSections = React.useMemo(() => {
    const list: DetailSection[] = [];
    if (hasBenefits) list.push('Benefits');
    if (hasEligibility) list.push('Whom to sell?');
    if (hasSteps) list.push('How to perform?');
    if (hasTerms) list.push('T&C');
    if (hasFaqs) list.push('FAQs');
    return list;
  }, [hasBenefits, hasEligibility, hasSteps, hasTerms, hasFaqs]);

  React.useEffect(() => {
    if (availableSections.length > 0 && !availableSections.includes(section)) {
      setSection(availableSections[0]);
    }
  }, [availableSections, section]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel="Go back"
          style={styles.touch}
          onPress={() => navigation.goBack()}
        >
          <ArrowLeft size={24} color={THEME.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Task Hub Offer</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={THEME.colors.primary} />
          <Text style={styles.body}>Loading offer details...</Text>
        </View>
      ) : error || !offer ? (
        <View style={styles.center}>
          <Text style={styles.body}>{error || 'Offer not found.'}</Text>
          <TouchableOpacity style={styles.primary} onPress={load}>
            <Text style={styles.white}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
            <View style={styles.hero}>
              {!!offer.bannerUrl && (
                <Image
                  accessibilityLabel={`${offer.title} banner`}
                  source={{ uri: offer.bannerUrl }}
                  resizeMode="cover"
                  style={styles.heroImage}
                />
              )}
              <View style={styles.heroHeading}>
                {!!c.logoUrl ? (
                  <Image source={{ uri: c.logoUrl }} resizeMode="contain" style={styles.logo} />
                ) : (
                  <View style={[styles.logo, { alignItems: 'center', justifyContent: 'center' }]}>
                    <Coins size={28} color={THEME.colors.primary} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.heroTitle}>{offer.title}</Text>
                  <Text style={styles.heroSubtitle}>
                    Earn {offer.rewardPoints.toLocaleString()} PTS (${usdReward} USD)
                  </Text>
                </View>
              </View>

              {/* Prominent BankSathi Style Apply / Open Link Button */}
              {!!offer.completionConditions?.targetUrl && (
                <View style={styles.heroActionWrapper}>
                  <TouchableOpacity
                    style={styles.applyNowBtn}
                    activeOpacity={0.88}
                    onPress={() => open(offer.completionConditions.targetUrl!)}
                  >
                    <Text style={styles.applyNowText}>Apply / Open Application Link ↗</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.stats}>
                {[
                  ['Reward', `${offer.rewardPoints.toLocaleString()} PTS ($${usdReward})`],
                  ['Submissions', activity?.personalStats.totalLeads || 0],
                  ['Approved', activity?.personalStats.totalSales || 0],
                ].map(([label, value]) => (
                  <View key={label} style={styles.stat}>
                    <Text style={styles.statValue}>{value}</Text>
                    <Text style={styles.statLabel}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {availableTabs.length > 1 && (
              <View style={styles.tabs}>
                {availableTabs.map((t) => (
                  <TouchableOpacity
                    accessibilityRole="tab"
                    accessibilityState={{ selected: tab === t }}
                    key={t}
                    style={[styles.tab, tab === t && styles.tabActive]}
                    onPress={() => setTab(t)}
                  >
                    <Text style={[styles.tabText, tab === t && styles.red]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {tab === 'Details' && (
              <>
                {availableSections.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chips}
                  >
                    {availableSections.map((s) => (
                      <TouchableOpacity
                        key={s}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: section === s }}
                        style={[styles.chip, section === s && styles.chipActive]}
                        onPress={() => setSection(s)}
                      >
                        <Text style={section === s ? styles.white : styles.tabText}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}

                {section === 'Benefits' && (
                  <>
                    {!!offer.description && (
                      <View style={styles.card}>
                        <Text style={styles.heading}>About this offer</Text>
                        <Text style={styles.body}>{offer.description}</Text>
                      </View>
                    )}
                    {points('Benefits', c.benefits)}
                  </>
                )}

                {section === 'Whom to sell?' && (
                  <>
                    {points('Eligibility criteria', c.eligibility)}
                    {points('Documents required', c.documents)}
                  </>
                )}

                {section === 'How to perform?' && (
                  <View style={styles.card}>
                    <Text style={styles.heading}>Step-by-step process</Text>
                    {offer.instructions?.map((text, i) => (
                      <View key={i} style={styles.point}>
                        <Text style={styles.step}>{i + 1}.</Text>
                        <Text style={styles.body}>{text}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {section === 'T&C' && (
                  <>
                    {points('Rules to follow', c.terms)}
                    {!!offer.additionalNotes && (
                      <View style={styles.card}>
                        <Text style={styles.heading}>Additional Notes</Text>
                        <Text style={styles.body}>{offer.additionalNotes}</Text>
                      </View>
                    )}
                  </>
                )}

                {section === 'FAQs' && (
                  <>
                    {offer.faqs?.map((faq, i) => (
                      <TouchableOpacity
                        key={i}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: !!expanded[i] }}
                        style={styles.card}
                        onPress={() => setExpanded((p) => ({ ...p, [i]: !p[i] }))}
                      >
                        <Text style={styles.heading}>
                          {i + 1}. {faq.question} {expanded[i] ? '−' : '+'}
                        </Text>
                        {expanded[i] && <Text style={styles.body}>{faq.answer}</Text>}
                      </TouchableOpacity>
                    ))}
                  </>
                )}
              </>
            )}

            {tab === 'Marketing' && (
              <>
                <Text style={styles.empty}>Share these approved materials with your customers.</Text>
                {c.marketingBanners?.map((banner, i) => (
                  <View key={i} style={styles.card}>
                    <Image
                      source={{ uri: banner.imageUrl }}
                      accessibilityLabel={banner.title}
                      style={styles.marketingImage}
                      resizeMode="contain"
                    />
                    <Text style={styles.heading}>{banner.title}</Text>
                    <TouchableOpacity disabled={busy} onPress={() => share(banner)} style={styles.outline}>
                      <Text style={styles.red}>Share banner & offer link</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                {offer.images?.map((url, i) => (
                  <View style={styles.card} key={i}>
                    <Image source={{ uri: url }} style={styles.marketingImage} resizeMode="contain" />
                    <TouchableOpacity
                      style={styles.outline}
                      disabled={busy}
                      onPress={() => share({ title: offer.title, imageUrl: url })}
                    >
                      <Text style={styles.red}>Share image & offer link</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                {!!c.marketingMessage && (
                  <View style={styles.card}>
                    <Text style={styles.body}>{c.marketingMessage}</Text>
                  </View>
                )}
              </>
            )}

            {tab === 'Training' && (
              <>
                {offer.trainingLinks?.length ? (
                  offer.trainingLinks.map((link, i) => (
                    <TouchableOpacity
                      accessibilityRole="link"
                      key={i}
                      style={styles.card}
                      onPress={() => open(link.url)}
                    >
                      {!!link.thumbnailUrl && (
                        <Image source={{ uri: link.thumbnailUrl }} style={styles.marketingImage} resizeMode="cover" />
                      )}
                      <View style={styles.point}>
                        <Play size={22} color={THEME.colors.primary} />
                        <Text style={styles.heading}>{link.title}</Text>
                      </View>
                      {!!link.description && <Text style={styles.body}>{link.description}</Text>}
                      <Text style={styles.red}>Open training ↗</Text>
                    </TouchableOpacity>
                  ))
                ) : (
                  <Text style={styles.empty}>Training has not been published yet.</Text>
                )}
                {points('Tracking time', c.trackingNotes)}
                {points('Payout information', c.payoutNotes)}
              </>
            )}

            {/* Complete Offer & Manual Verification Box */}
            <View style={styles.card}>
              <Text style={styles.heading}>Verification & Completion</Text>
              <Text style={styles.body}>
                Opening or sharing a link does not award points. Follow the steps, take a screenshot of completion, and submit for verification. Points credit upon admin approval.
              </Text>
              {!!offer.completionConditions.conditionDescription && (
                <Text style={styles.body}>{offer.completionConditions.conditionDescription}</Text>
              )}
              {!!offer.completionConditions.targetUrl && (
                <TouchableOpacity style={styles.outline} onPress={() => open(offer.completionConditions.targetUrl!)}>
                  <Text style={styles.red}>Open partner link</Text>
                  <ExternalLink size={18} color={THEME.colors.primary} />
                </TouchableOpacity>
              )}

              {/* Status Banner */}
              {activity?.submission && (
                <View
                  style={[
                    styles.statusBox,
                    activity.submission.status === 'APPROVED'
                      ? styles.statusApproved
                      : activity.submission.status === 'REJECTED'
                      ? styles.statusRejected
                      : styles.statusPending,
                  ]}
                >
                  <View style={styles.statusHeaderRow}>
                    {activity.submission.status === 'APPROVED' ? (
                      <CheckCircle2 size={18} color={THEME.colors.emerald} />
                    ) : activity.submission.status === 'REJECTED' ? (
                      <AlertCircle size={18} color={THEME.colors.danger} />
                    ) : (
                      <ActivityIndicator size="small" color="#D97706" />
                    )}
                    <Text style={styles.statusTitle}>
                      {activity.submission.status === 'APPROVED'
                        ? 'Submission Approved'
                        : activity.submission.status === 'REJECTED'
                        ? 'Submission Rejected'
                        : 'Pending Admin Review'}
                    </Text>
                  </View>
                  <Text style={styles.statusNotes}>
                    {activity.submission.status === 'APPROVED'
                      ? `Your action was verified! +${offer.rewardPoints.toLocaleString()} PTS ($${usdReward} USD) credited to your balance.`
                      : activity.submission.status === 'REJECTED'
                      ? `Reason: ${activity.submission.reviewNotes || 'Verification criteria not satisfied.'} You may upload corrected proof below.`
                      : 'Your screenshot proof is in the admin review queue. No points have been credited yet.'}
                  </Text>
                </View>
              )}

              {/* Submission Toggle */}
              {(!activity?.submission || activity.submission.status === 'REJECTED') && (
                <TouchableOpacity
                  style={styles.outline}
                  onPress={() => setShowSubmission((v) => !v)}
                >
                  <Text style={styles.red}>
                    {showSubmission
                      ? 'Close Submission Form'
                      : activity?.submission?.status === 'REJECTED'
                      ? 'Resubmit Corrected Proof'
                      : 'Submit Completed Action'}
                  </Text>
                </TouchableOpacity>
              )}

              {showSubmission && (
                <View style={styles.submissionForm}>
                  <Text style={styles.inputLabel}>Completion Description</Text>
                  <TextInput
                    accessibilityLabel="Completion details"
                    placeholder="Describe what was completed (account ID, reference, date, etc.). Min 5 characters."
                    multiline
                    maxLength={2000}
                    value={notes}
                    onChangeText={setNotes}
                    style={styles.input}
                  />

                  {/* Real Image Picker & Uploader */}
                  <ProofImagePicker
                    label="Upload Screenshot Proof"
                    helperText={
                      offer.completionConditions.proofInstructions ||
                      'Attach screenshot proof of your completed action (PNG, JPG, WebP up to 5MB).'
                    }
                    onProofUploaded={(proof) => {
                      setProofFileId(proof?.fileId || '');
                      setProofUrl(proof?.url || '');
                    }}
                  />

                  {offer.completionConditions.completionCodeRequired && (
                    <View style={{ marginTop: 8 }}>
                      <Text style={styles.inputLabel}>Partner Reference Code</Text>
                      <TextInput
                        accessibilityLabel="Partner reference code"
                        placeholder="e.g. ORDER-94821 or TX-849102"
                        value={completionCode}
                        onChangeText={setCompletionCode}
                        style={styles.input}
                      />
                    </View>
                  )}

                  <TouchableOpacity
                    disabled={busy || notes.trim().length < 5 || (offer.completionConditions.requiresProof && !proofFileId && !proofUrl)}
                    style={[
                      styles.primary,
                      (busy || notes.trim().length < 5 || (offer.completionConditions.requiresProof && !proofFileId && !proofUrl)) && {
                        opacity: 0.5,
                      },
                    ]}
                    onPress={submit}
                  >
                    {busy ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <Text style={styles.white}>Submit for Admin Verification</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>

          {/* Sticky Footer */}
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.tabText}>Earn on approval</Text>
              <Text style={styles.reward}>{offer.rewardPoints.toLocaleString()} pts</Text>
              <Text style={styles.muted}>${usdReward} USD</Text>
            </View>
            <TouchableOpacity
              accessibilityLabel="Share offer to customer"
              disabled={busy}
              style={[styles.primary, { flex: 1.3 }]}
              onPress={() => share()}
            >
              {busy ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Text style={styles.white}>Share & Refer</Text>
                  <Share2 size={18} color="white" />
                </>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.colors.background },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', paddingHorizontal: 12 },
  touch: { padding: 12, minWidth: 48, minHeight: 48 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: THEME.colors.textPrimary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  scroll: { paddingBottom: 24 },
  hero: { margin: 16, backgroundColor: THEME.colors.primary, borderRadius: 26, overflow: 'hidden' },
  heroImage: { width: '100%', height: 145 },
  heroHeading: { padding: 20, flexDirection: 'row', gap: 14, alignItems: 'center' },
  logo: { width: 64, height: 64, backgroundColor: 'white', borderRadius: 12 },
  heroTitle: { fontSize: 20, fontWeight: '700', color: 'white' },
  heroSubtitle: { fontSize: 13, fontWeight: '600', color: '#FEF3C7', marginTop: 4 },
  heroActionWrapper: { paddingHorizontal: 20, paddingBottom: 16 },
  applyNowBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  applyNowText: {
    color: THEME.colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  stats: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#FFFFFF66', marginHorizontal: 20, paddingVertical: 20 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 17, fontWeight: '700', color: 'white' },
  statLabel: { fontSize: 12, color: 'white', marginTop: 5 },
  tabs: { flexDirection: 'row', backgroundColor: 'white' },
  tab: { flex: 1, paddingVertical: 16, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: THEME.colors.primary },
  tabText: { color: THEME.colors.textPrimary, fontWeight: '600', fontSize: 14 },
  red: { color: THEME.colors.primary, fontWeight: '600' },
  chips: { padding: 16, gap: 8 },
  chip: { paddingHorizontal: 16, minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: THEME.colors.border, borderRadius: 24, backgroundColor: 'white' },
  chipActive: { backgroundColor: THEME.colors.primary, borderColor: THEME.colors.primary },
  card: { marginHorizontal: 16, marginVertical: 8, padding: 18, backgroundColor: 'white', borderWidth: 1, borderColor: THEME.colors.border, borderRadius: 16, gap: 12 },
  heading: { color: THEME.colors.textPrimary, fontSize: 18, fontWeight: '700', flexShrink: 1 },
  body: { flexShrink: 1, color: THEME.colors.textSecondary, fontSize: 15, lineHeight: 24 },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  step: { fontSize: 16, fontWeight: '700', color: THEME.colors.primary },
  empty: { padding: 20, color: THEME.colors.textSecondary, lineHeight: 23 },
  marketingImage: { width: '100%', height: 200, borderRadius: 12 },
  outline: { minHeight: 48, padding: 12, borderWidth: 1, borderColor: THEME.colors.primary, borderRadius: 24, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  primary: { minHeight: 48, borderRadius: 25, backgroundColor: THEME.colors.primary, padding: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  white: { color: 'white', fontWeight: '700', fontSize: 14 },
  statusBox: { padding: 14, borderRadius: 12, gap: 6 },
  statusPending: { backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#F59E0B' },
  statusApproved: { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#10B981' },
  statusRejected: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#EF4444' },
  statusHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusTitle: { fontSize: 14, fontWeight: '700', color: THEME.colors.textPrimary },
  statusNotes: { fontSize: 13, color: THEME.colors.textSecondary, lineHeight: 19 },
  submissionForm: { gap: 12, marginTop: 8 },
  inputLabel: { fontSize: 13, fontWeight: '700', color: THEME.colors.textPrimary },
  input: { padding: 12, minHeight: 48, borderWidth: 1, borderColor: THEME.colors.border, borderRadius: 10, color: THEME.colors.textPrimary },
  footer: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: THEME.colors.border },
  reward: { fontSize: 20, fontWeight: '800', color: THEME.colors.primary },
  muted: { fontSize: 12, color: THEME.colors.textSecondary },
});

export default OfferDetailsScreen;
