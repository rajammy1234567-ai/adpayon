import React from 'react';
import { OfferContent } from '../../types';

export const OfferContentEditor = ({ value, onChange }: { value: OfferContent; onChange: (value: OfferContent) => void }) => {
  const input = 'w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-sm text-white';
  const lists: { key: 'benefits' | 'eligibility' | 'documents' | 'terms' | 'trackingNotes' | 'payoutNotes'; label: string }[] = [
    { key: 'benefits', label: 'Benefits' }, { key: 'eligibility', label: 'Whom to sell / Eligibility' },
    { key: 'documents', label: 'Documents required' }, { key: 'terms', label: 'Terms & Conditions' },
    { key: 'trackingNotes', label: 'Tracking timeline' }, { key: 'payoutNotes', label: 'Payout conditions & timeline' },
  ];
  return <section className="bg-obsidian-900 p-6 rounded-xl border border-obsidian-700 space-y-5">
    <h2 className="font-bold text-white">Product details, marketing & training</h2>
    <label className="block text-sm text-slate-300">Product logo URL<input type="url" className={input} value={value.logoUrl || ''} onChange={e => onChange({ ...value, logoUrl: e.target.value })} /></label>
    <p className="text-xs text-slate-400">Each item below becomes a separate point in the app. Empty sections are hidden. Use the arrows to change their order.</p>
    {lists.map(({ key, label }) => <fieldset key={key} className="space-y-2">
      <legend className="text-sm font-semibold text-slate-200">{label}</legend>
      {(value[key] || []).map((line, i) => <div className="flex gap-2" key={i}>
        <textarea aria-label={`${label} point ${i + 1}`} maxLength={2000} rows={2} className={input} value={line} onChange={e => onChange({ ...value, [key]: value[key]!.map((l, n) => n === i ? e.target.value : l) })} />
        <button type="button" aria-label={`Move ${label} point up`} disabled={i === 0} className="text-white disabled:opacity-30" onClick={() => { const rows = [...value[key]!]; [rows[i-1], rows[i]] = [rows[i], rows[i-1]]; onChange({ ...value, [key]: rows }); }}>↑</button>
        <button type="button" aria-label={`Move ${label} point down`} disabled={i === value[key]!.length - 1} className="text-white disabled:opacity-30" onClick={() => { const rows = [...value[key]!]; [rows[i+1], rows[i]] = [rows[i], rows[i+1]]; onChange({ ...value, [key]: rows }); }}>↓</button>
        <button type="button" className="text-red-400" aria-label={`Remove ${label} point ${i + 1}`} onClick={() => onChange({ ...value, [key]: value[key]!.filter((_, n) => n !== i) })}>Remove</button>
      </div>)}
      <button type="button" disabled={(value[key]?.length || 0) >= 50} className="text-red-400 text-sm" onClick={() => onChange({ ...value, [key]: [...(value[key] || []), ''] })}>+ Add point</button>
    </fieldset>)}
    <label className="block text-sm text-slate-300">Customer sharing message<textarea rows={3} maxLength={3000} className={input} value={value.marketingMessage || ''} onChange={e => onChange({ ...value, marketingMessage: e.target.value })} /></label>
    <fieldset className="space-y-2"><legend className="text-sm text-slate-200">Marketing banners</legend>
      {(value.marketingBanners || []).map((banner, i) => <div key={i} className="space-y-2 border border-obsidian-700 p-3 rounded-lg">
        <input aria-label={`Banner ${i+1} title`} required maxLength={200} className={input} value={banner.title} placeholder="Banner title" onChange={e => onChange({ ...value, marketingBanners: value.marketingBanners!.map((b, n) => n === i ? { ...b, title: e.target.value } : b) })} />
        <input aria-label={`Banner ${i+1} image URL`} required type="url" className={input} value={banner.imageUrl} placeholder="https://.../banner.jpg" onChange={e => onChange({ ...value, marketingBanners: value.marketingBanners!.map((b, n) => n === i ? { ...b, imageUrl: e.target.value } : b) })} />
        <button type="button" className="text-red-400 text-sm" onClick={() => onChange({ ...value, marketingBanners: value.marketingBanners!.filter((_, n) => n !== i) })}>Remove banner</button>
      </div>)}
      <button type="button" disabled={(value.marketingBanners?.length || 0) >= 20} className="text-red-400 text-sm" onClick={() => onChange({ ...value, marketingBanners: [...(value.marketingBanners || []), { title: '', imageUrl: '' }] })}>+ Add banner</button>
    </fieldset>
  </section>;
};
