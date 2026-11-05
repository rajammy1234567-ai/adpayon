import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Offer } from '@adpayon/shared';
import { getOffersApi } from '../../services/api/offer.api';
import { RootStackParamList } from '../../navigation/types';
import { THEME } from '../../constants/theme';
export const HomeOffersSection = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [offers, setOffers] = useState<Offer[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true; setLoading(true); setError('');
    getOffersApi().then(r => { if (!r.success || !Array.isArray(r.data)) throw new Error('Invalid offers response.'); if (active) setOffers(r.data.slice(0, 6)); }).catch((e: any) => { if (active) { setOffers([]); setError(e.message || 'Could not load offers.'); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]));
  return <View style={styles.section}><Text style={styles.heading}>Featured Offers</Text>
    {loading ? <ActivityIndicator color={THEME.colors.primary} /> : error ? <TouchableOpacity onPress={() => setRetry(r => r + 1)}><Text style={styles.red}>{error} · Try Again</Text></TouchableOpacity> : !offers.length ? <Text style={styles.body}>No published offers right now.</Text> : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
      {offers.map(offer => <TouchableOpacity accessibilityRole="button" accessibilityLabel={`View ${offer.title}`} key={offer.id} style={styles.card} onPress={() => navigation.navigate('OfferDetails', { offerId: offer.id })}>
        {!!offer.bannerUrl && <Image source={{ uri: offer.bannerUrl }} style={styles.banner} resizeMode="cover" />}
        <View style={styles.content}><Text style={styles.red}>{offer.rewardPoints.toLocaleString()} points · ₹{(offer.rewardPoints / 10).toFixed(2)}</Text><Text style={styles.title}>{offer.title}</Text>{offer.content?.benefits?.slice(0, 2).map((text, i) => <Text key={i} numberOfLines={2} style={styles.body}>✓ {text}</Text>)}<Text style={styles.red}>View Details →</Text></View>
      </TouchableOpacity>)}
    </ScrollView>}
  </View>;
};
const styles = StyleSheet.create({ section: { marginBottom: 24, gap: 12 }, heading: { fontSize: 18, fontWeight: '700', color: THEME.colors.textPrimary }, card: { width: 260, borderRadius: 18, borderWidth: 1, borderColor: THEME.colors.border, backgroundColor: 'white', overflow: 'hidden' }, banner: { width: '100%', height: 120 }, content: { padding: 16, gap: 10 }, title: { fontSize: 17, fontWeight: '700', color: THEME.colors.textPrimary }, body: { color: THEME.colors.textSecondary, lineHeight: 21 }, red: { color: THEME.colors.primary, fontWeight: '600' } });
