import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Share, Alert, Linking, TextInput, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft, Share2, ExternalLink, Play, CheckCircle } from 'lucide-react-native';
import { Offer } from '@adpayon/shared';
import { THEME } from '../../constants/theme';
import { getOfferDetailsApi, getOfferActivityApi, generateOfferShareLinkApi, completeOfferApi } from '../../services/api/offer.api';
import { RootStackParamList } from '../../navigation/types';

type DetailSection = 'Benefits' | 'Whom to sell?' | 'T&C' | 'How to perform?' | 'FAQs';
export const OfferDetailsScreen = () => {
  const { params } = useRoute<RouteProp<RootStackParamList, 'OfferDetails'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [activity, setActivity] = useState<{ personalStats: NonNullable<Offer['personalStats']>; submission: Offer['submission'] | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'Details' | 'Marketing' | 'Training'>('Details');
  const [section, setSection] = useState<DetailSection>('Benefits');
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [showSubmission, setShowSubmission] = useState(false);
  const [notes, setNotes] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [completionCode, setCompletionCode] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const detail = await getOfferDetailsApi(params.offerId || params.slug || '');
      if (!detail.success || !detail.data?.id) throw new Error('Invalid offer response. Please retry.');
      const status = await getOfferActivityApi(detail.data.id);
      if (!status.success) throw new Error('Unable to load your offer activity.');
      setOffer(detail.data); setActivity(status.data);
    } catch (e: any) { setError(e.message || 'Unable to load offer.'); }
    finally { setLoading(false); }
  }, [params.offerId, params.slug]);
  useEffect(() => { load(); }, [load]);
  const open = async (url: string) => {
    try {
      if (!/^https?:\/\//i.test(url)) throw new Error('This link is unavailable.');
      await Linking.openURL(url);
    } catch (e: any) { Alert.alert('Cannot open link', e.message || 'Please try again.'); }
  };
  const share = async (banner?: { title: string; imageUrl: string }) => {
    if (!offer || busy) return;
    setBusy(true);
    try {
      const response = await generateOfferShareLinkApi(offer.id);
      if (!response.success || !response.data.shareUrl) throw new Error('Could not generate share link.');
      const message = [offer.content?.marketingMessage || offer.title, banner?.title, banner?.imageUrl, response.data.shareUrl].filter(Boolean).join('\n\n');
      if (Platform.OS === 'web') await Linking.openURL(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`);
      else await Share.share({ title: offer.title, message });
    } catch (e: any) { Alert.alert('Share unavailable', e.message || 'Please retry.'); }
    finally { setBusy(false); }
  };
  const submit = async () => {
    if (!offer || busy) return;
    if (notes.trim().length < 5) { Alert.alert('Completion details', 'Describe the completed action (at least 5 characters).'); return; }
    setBusy(true);
    try {
      await completeOfferApi(offer.id, { notes: notes.trim(), proofUrl: proofUrl.trim() || undefined, completionCode: completionCode.trim() || undefined });
      setShowSubmission(false); await load();
      Alert.alert('Submitted for review', 'Points are credited after your completion is verified.');
    } catch (e: any) { Alert.alert('Submission failed', e.message || 'Please retry.'); }
    finally { setBusy(false); }
  };
  const points = (title: string, items?: string[]) => items?.length ? <View style={styles.card}>
    <Text style={styles.heading}>{title}</Text>
    {items.map((text, i) => <View key={i} style={styles.point}><CheckCircle size={18} color={THEME.colors.primary} /><Text style={styles.body}>{text}</Text></View>)}
  </View> : null;
  const c = offer?.content || {};
  const sections: DetailSection[] = ['Benefits', 'Whom to sell?', 'T&C', 'How to perform?', 'FAQs'];
  return <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
    <View style={styles.header}><TouchableOpacity accessibilityLabel="Go back" style={styles.touch} onPress={() => navigation.goBack()}><ArrowLeft size={24} color={THEME.colors.textPrimary} /></TouchableOpacity><Text style={styles.headerTitle}>Offer Details</Text></View>
    {loading ? <View style={styles.center}><ActivityIndicator color={THEME.colors.primary} /><Text>Loading offer...</Text></View> : error || !offer ? <View style={styles.center}><Text style={styles.body}>{error || 'Offer not found.'}</Text><TouchableOpacity style={styles.primary} onPress={load}><Text style={styles.white}>Try Again</Text></TouchableOpacity></View> : <>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          {!!offer.bannerUrl && <Image accessibilityLabel={`${offer.title} banner`} source={{ uri: offer.bannerUrl }} resizeMode="cover" style={styles.heroImage} />}
          <View style={styles.heroHeading}>{!!c.logoUrl && <Image source={{ uri: c.logoUrl }} resizeMode="contain" style={styles.logo} />}<Text style={styles.heroTitle}>{offer.title}</Text></View>
          <View style={styles.stats}>{[['Earnings', `₹${((activity?.personalStats.earningsPaise || 0) / 100).toFixed(2)}`], ['Submissions', activity?.personalStats.totalLeads || 0], ['Approved', activity?.personalStats.totalSales || 0]].map(([label, value]) => <View key={label} style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>)}</View>
        </View>
        <View style={styles.tabs}>{(['Details', 'Marketing', 'Training'] as const).map(t => <TouchableOpacity accessibilityRole="tab" accessibilityState={{ selected: tab === t }} key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}><Text style={[styles.tabText, tab === t && styles.red]}>{t}</Text></TouchableOpacity>)}</View>
        {tab === 'Details' && <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{sections.map(s => <TouchableOpacity key={s} accessibilityRole="tab" accessibilityState={{ selected: section === s }} style={[styles.chip, section === s && styles.chipActive]} onPress={() => setSection(s)}><Text style={section === s ? styles.white : styles.tabText}>{s}</Text></TouchableOpacity>)}</ScrollView>
          {section === 'Benefits' && <><View style={styles.card}><Text style={styles.heading}>About this offer</Text><Text style={styles.body}>{offer.description}</Text></View>{points('Benefits', c.benefits)}</>}
          {section === 'Whom to sell?' && <>{points('Eligibility criteria', c.eligibility)}{points('Documents required', c.documents)}{!c.eligibility?.length && !c.documents?.length && <Text style={styles.empty}>No eligibility information has been published yet.</Text>}</>}
          {section === 'T&C' && <>{points('Rules to follow', c.terms)}{!!offer.additionalNotes && <View style={styles.card}><Text style={styles.body}>{offer.additionalNotes}</Text></View>}{!c.terms?.length && !offer.additionalNotes && <Text style={styles.empty}>No terms have been published yet.</Text>}</>}
          {section === 'How to perform?' && <View style={styles.card}><Text style={styles.heading}>Step-by-step process</Text>{offer.instructions?.length ? offer.instructions.map((text, i) => <View key={i} style={styles.point}><Text style={styles.step}>{i+1}.</Text><Text style={styles.body}>{text}</Text></View>) : <Text style={styles.body}>Instructions have not been published yet.</Text>}</View>}
          {section === 'FAQs' && <>{offer.faqs?.length ? offer.faqs.map((faq, i) => <TouchableOpacity key={i} accessibilityRole="button" accessibilityState={{ expanded: !!expanded[i] }} style={styles.card} onPress={() => setExpanded(p => ({ ...p, [i]: !p[i] }))}><Text style={styles.heading}>{i+1}. {faq.question} {expanded[i] ? '−' : '+'}</Text>{expanded[i] && <Text style={styles.body}>{faq.answer}</Text>}</TouchableOpacity>) : <Text style={styles.empty}>No FAQs have been published yet.</Text>}</>}
        </>}
        {tab === 'Marketing' && <><Text style={styles.empty}>Share these approved materials with your customers.</Text>{c.marketingBanners?.map((banner, i) => <View key={i} style={styles.card}><Image source={{ uri: banner.imageUrl }} accessibilityLabel={banner.title} style={styles.marketingImage} resizeMode="contain" /><Text style={styles.heading}>{banner.title}</Text><TouchableOpacity disabled={busy} onPress={() => share(banner)} style={styles.outline}><Text style={styles.red}>Share banner & offer link</Text></TouchableOpacity></View>)}{offer.images?.map((url, i) => <View style={styles.card} key={i}><Image source={{ uri: url }} style={styles.marketingImage} resizeMode="contain" /><TouchableOpacity style={styles.outline} disabled={busy} onPress={() => share({ title: offer.title, imageUrl: url })}><Text style={styles.red}>Share image & offer link</Text></TouchableOpacity></View>)}{!!c.marketingMessage && <View style={styles.card}><Text style={styles.body}>{c.marketingMessage}</Text></View>}{!c.marketingBanners?.length && !offer.images?.length && !c.marketingMessage && <Text style={styles.empty}>Marketing materials have not been published yet.</Text>}</>}
        {tab === 'Training' && <>{offer.trainingLinks?.length ? offer.trainingLinks.map((link, i) => <TouchableOpacity accessibilityRole="link" key={i} style={styles.card} onPress={() => open(link.url)}>{!!link.thumbnailUrl && <Image source={{ uri: link.thumbnailUrl }} style={styles.marketingImage} resizeMode="cover" />}<View style={styles.point}><Play size={22} color={THEME.colors.primary} /><Text style={styles.heading}>{link.title}</Text></View>{!!link.description && <Text style={styles.body}>{link.description}</Text>}<Text style={styles.red}>Open training ↗</Text></TouchableOpacity>) : <Text style={styles.empty}>Training has not been published yet.</Text>}{points('Tracking time', c.trackingNotes)}{points('Payout information', c.payoutNotes)}</>}
        <View style={styles.card}><Text style={styles.heading}>Complete this offer</Text><Text style={styles.body}>Opening or sharing a link does not earn points. Follow the conditions and submit your completion for verification.</Text>
          {!!offer.completionConditions.conditionDescription && <Text style={styles.body}>{offer.completionConditions.conditionDescription}</Text>}
          {!!offer.completionConditions.targetUrl && <TouchableOpacity style={styles.outline} onPress={() => open(offer.completionConditions.targetUrl!)}><Text style={styles.red}>Open partner link</Text><ExternalLink size={18} color={THEME.colors.primary} /></TouchableOpacity>}
          {activity?.submission && <Text style={styles.status}>Status: {activity.submission.status.replace(/_/g, ' ')}{activity.submission.reviewNotes ? `\n${activity.submission.reviewNotes}` : ''}</Text>}
          {(!activity?.submission || activity.submission.status === 'REJECTED') && <TouchableOpacity style={styles.outline} onPress={() => setShowSubmission(v => !v)}><Text style={styles.red}>{showSubmission ? 'Close submission' : 'Submit completed action'}</Text></TouchableOpacity>}
          {showSubmission && <><TextInput accessibilityLabel="Completion details" placeholder="What did you complete? Include your reference details." multiline maxLength={2000} value={notes} onChangeText={setNotes} style={styles.input} />
            {offer.completionConditions.requiresProof && <><Text style={styles.body}>{offer.completionConditions.proofInstructions || 'Add a link to your completion proof.'}</Text><TextInput accessibilityLabel="Proof URL" autoCapitalize="none" placeholder="https://..." value={proofUrl} onChangeText={setProofUrl} style={styles.input} /></>}
            {offer.completionConditions.completionCodeRequired && <TextInput accessibilityLabel="Partner reference code" placeholder="Partner reference code" value={completionCode} onChangeText={setCompletionCode} style={styles.input} />}
            <TouchableOpacity disabled={busy} style={styles.primary} onPress={submit}><Text style={styles.white}>{busy ? 'Submitting...' : 'Submit for verification'}</Text></TouchableOpacity></>}
        </View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}><View style={{ flex: 1 }}><Text style={styles.tabText}>Earn on approval</Text><Text style={styles.reward}>{offer.rewardPoints.toLocaleString()} pts</Text><Text style={styles.muted}>₹{(offer.rewardPoints / 10).toFixed(2)}</Text></View><TouchableOpacity accessibilityLabel="Share offer to customer" disabled={busy} style={[styles.primary, { flex: 1.3 }]} onPress={() => share()}>{busy ? <ActivityIndicator color="white" /> : <><Text style={styles.white}>Share to Customer</Text><Share2 size={18} color="white" /></>}</TouchableOpacity></View>
    </>}
  </SafeAreaView>;
};
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.colors.background }, header: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', paddingHorizontal: 12 }, touch: { padding: 12, minWidth: 48, minHeight: 48 }, headerTitle: { fontSize: 20, fontWeight: '700', color: THEME.colors.textPrimary }, center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 }, scroll: { paddingBottom: 24 },
  hero: { margin: 16, backgroundColor: THEME.colors.primary, borderRadius: 26, overflow: 'hidden' }, heroImage: { width: '100%', height: 145 }, heroHeading: { padding: 20, flexDirection: 'row', gap: 14, alignItems: 'center' }, logo: { width: 64, height: 64, backgroundColor: 'white', borderRadius: 12 }, heroTitle: { flex: 1, fontSize: 23, fontWeight: '700', color: 'white' }, stats: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#FFFFFF66', marginHorizontal: 20, paddingVertical: 20 }, stat: { flex: 1, alignItems: 'center' }, statValue: { fontSize: 19, fontWeight: '700', color: 'white' }, statLabel: { fontSize: 12, color: 'white', marginTop: 5 },
  tabs: { flexDirection: 'row', backgroundColor: 'white' }, tab: { flex: 1, paddingVertical: 16, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' }, tabActive: { borderBottomColor: THEME.colors.primary }, tabText: { color: THEME.colors.textPrimary, fontWeight: '600', fontSize: 14 }, red: { color: THEME.colors.primary, fontWeight: '600' }, chips: { padding: 16, gap: 8 }, chip: { paddingHorizontal: 16, minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: THEME.colors.border, borderRadius: 24, backgroundColor: 'white' }, chipActive: { backgroundColor: THEME.colors.primary, borderColor: THEME.colors.primary },
  card: { marginHorizontal: 16, marginVertical: 8, padding: 18, backgroundColor: 'white', borderWidth: 1, borderColor: THEME.colors.border, borderRadius: 16, gap: 12 }, heading: { color: THEME.colors.textPrimary, fontSize: 18, fontWeight: '700', flexShrink: 1 }, body: { flexShrink: 1, color: THEME.colors.textSecondary, fontSize: 15, lineHeight: 24 }, point: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, step: { fontSize: 16, fontWeight: '700', color: THEME.colors.primary }, empty: { padding: 20, color: THEME.colors.textSecondary, lineHeight: 23 }, marketingImage: { width: '100%', height: 200, borderRadius: 12 }, outline: { minHeight: 48, padding: 12, borderWidth: 1, borderColor: THEME.colors.primary, borderRadius: 24, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }, primary: { minHeight: 48, borderRadius: 25, backgroundColor: THEME.colors.primary, padding: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }, white: { color: 'white', fontWeight: '700', fontSize: 14 }, status: { padding: 12, backgroundColor: '#FEF2F2', color: THEME.colors.primary, lineHeight: 22 }, input: { padding: 12, minHeight: 48, borderWidth: 1, borderColor: THEME.colors.border, borderRadius: 10, color: THEME.colors.textPrimary }, footer: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: THEME.colors.border }, reward: { fontSize: 20, fontWeight: '800', color: THEME.colors.primary }, muted: { fontSize: 12, color: THEME.colors.textSecondary },
});
export default OfferDetailsScreen;
