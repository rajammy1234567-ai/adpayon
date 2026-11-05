import { OfferContentEditor } from '../components/common/OfferContentEditor';
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Gift,
  ArrowLeft,
  Save,
  Eye,
  Plus,
  Trash2,
  ExternalLink,
  Coins,
  Loader2,
  AlertCircle,
  HelpCircle,
  Clock,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { api } from '../services/api';
import { Offer, OfferStatus, Category, OfferTrainingLink, OfferFaq, OfferContent } from '../types';
import { Modal } from '../components/common/Modal';

export const CreateEditOffer: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;

  const [isLoading, setIsLoading] = useState(isEditing);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  // Form Fields
  const [content, setContent] = useState<OfferContent>({});
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [rewardPoints, setRewardPoints] = useState<number>(1000);
  const [status, setStatus] = useState<OfferStatus>('PUBLISHED');
  const [displayOrder, setDisplayOrder] = useState<number>(0);
  const [expiresAt, setExpiresAt] = useState<string>('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [newImageUrl, setNewImageUrl] = useState('');

  // Instructions
  const [instructions, setInstructions] = useState<string[]>([
    'Click on the link to visit the partner page.',
    'Complete the required registration/task steps.',
  ]);
  const [newInstruction, setNewInstruction] = useState('');

  // Additional Notes
  const [additionalNotes, setAdditionalNotes] = useState('');

  // Training Links
  const [trainingLinks, setTrainingLinks] = useState<OfferTrainingLink[]>([]);
  const [tlTitle, setTlTitle] = useState('');
  const [tlUrl, setTlUrl] = useState('');
  const [tlThumbnail, setTlThumbnail] = useState('');
  const [tlDesc, setTlDesc] = useState('');

  // FAQs
  const [faqs, setFaqs] = useState<OfferFaq[]>([]);
  const [faqQuestion, setFaqQuestion] = useState('');
  const [faqAnswer, setFaqAnswer] = useState('');

  // Completion Conditions
  const [actionType, setActionType] = useState<
    'LINK_VISIT' | 'SIGNUP_SUBMIT' | 'FORM_FILL' | 'PURCHASE' | 'CUSTOM'
  >('SIGNUP_SUBMIT');
  const [targetUrl, setTargetUrl] = useState('');
  const [requiresProof, setRequiresProof] = useState(false);
  const [proofInstructions, setProofInstructions] = useState('');
  const [completionCodeRequired, setCompletionCodeRequired] = useState(false);

  // Live Preview Modal
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const catRes = await api.listCategories();
        if (!catRes || !catRes.success || !Array.isArray(catRes.data)) {
          throw new Error('Unexpected response format while loading categories from server.');
        }
        const cats = catRes.data;
        setCategories(cats);

        if (!categoryId && cats.length > 0) {
          setCategoryId(cats[0].id);
        }

        if (isEditing && id) {
          const offerRes = await api.getOffer(id);
          if (!offerRes || !offerRes.success || !offerRes.data) {
            throw new Error('Unexpected response format while loading offer details.');
          }
          const o = offerRes.data;
          if (o) {
            setContent(o.content || {});
            setTitle(o.title);
            setSlug(o.slug);
            setCategoryId(o.categoryId);
            setDescription(o.description);
            setRewardPoints(o.rewardPoints);
            setStatus(o.status);
            setDisplayOrder(o.displayOrder ?? 0);
            setExpiresAt(o.expiresAt ? new Date(o.expiresAt).toISOString().slice(0, 16) : '');
            setBannerUrl(o.bannerUrl || '');
            setImages(o.images || []);
            setInstructions(o.instructions || []);
            setAdditionalNotes(o.additionalNotes || '');
            setTrainingLinks(o.trainingLinks || []);
            setFaqs(o.faqs || []);
            if (o.completionConditions) {
              setActionType(o.completionConditions.actionType || 'SIGNUP_SUBMIT');
              setTargetUrl(o.completionConditions.targetUrl || '');
              setRequiresProof(!!o.completionConditions.requiresProof);
              setProofInstructions(o.completionConditions.proofInstructions || '');
              setCompletionCodeRequired(!!o.completionConditions.completionCodeRequired);
            }
          }
        }
      } catch (err: any) {
        setError(err.message || 'Failed to initialize offer form');
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [id, isEditing]);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!isEditing) {
      setSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)+/g, '')
      );
    }
  };

  const addInstruction = () => {
    if (!newInstruction.trim()) return;
    setInstructions([...instructions, newInstruction.trim()]);
    setNewInstruction('');
  };

  const removeInstruction = (idx: number) => {
    setInstructions(instructions.filter((_, i) => i !== idx));
  };

  const addImage = () => {
    if (!newImageUrl.trim()) return;
    setImages([...images, newImageUrl.trim()]);
    setNewImageUrl('');
  };

  const removeImage = (idx: number) => {
    setImages(images.filter((_, i) => i !== idx));
  };

  const addTrainingLink = () => {
    if (!tlTitle.trim() || !tlUrl.trim()) return;
    setTrainingLinks([
      ...trainingLinks,
      { title: tlTitle.trim(), url: tlUrl.trim(), description: tlDesc.trim() || undefined, thumbnailUrl: tlThumbnail.trim() || undefined },
    ]);
    setTlTitle('');
    setTlUrl('');
    setTlDesc('');
    setTlThumbnail('');
  };

  const removeTrainingLink = (idx: number) => {
    setTrainingLinks(trainingLinks.filter((_, i) => i !== idx));
  };

  const addFaq = () => {
    if (!faqQuestion.trim() || !faqAnswer.trim()) return;
    setFaqs([...faqs, { question: faqQuestion.trim(), answer: faqAnswer.trim() }]);
    setFaqQuestion('');
    setFaqAnswer('');
  };

  const removeFaq = (idx: number) => {
    setFaqs(faqs.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e?: React.FormEvent, overrideStatus?: OfferStatus) => {
    if (e) e.preventDefault();

    if (!title.trim()) {
      setError('Offer title is required.');
      return;
    }
    if (!categoryId) {
      setError('Please select a category.');
      return;
    }
    if (!description.trim()) {
      setError('Offer description is required.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const cleanContent = Object.fromEntries(Object.entries(content).map(([key, value]) => [key, Array.isArray(value) && key !== "marketingBanners" ? value.map((line: string) => line.trim()).filter(Boolean) : value]));
      const payload = {
        content: cleanContent as OfferContent,
        title: title.trim(),
        slug: slug.trim() || undefined,
        categoryId,
        description: description.trim(),
        rewardPoints: Math.max(0, Math.floor(Number(rewardPoints) || 0)),
        status: overrideStatus || status,
        displayOrder: Number(displayOrder) || 0,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        bannerUrl: bannerUrl.trim() || undefined,
        images: images.filter((img) => img.trim() !== ''),
        instructions: instructions.filter((inst) => inst.trim() !== ''),
        additionalNotes: additionalNotes.trim() || undefined,
        trainingLinks,
        faqs,
        completionConditions: {
          actionType,
          targetUrl: targetUrl.trim() || undefined,
          requiresProof,
          proofInstructions: proofInstructions.trim() || undefined,
          completionCodeRequired,
        },
      };

      if (isEditing && id) {
        await api.updateOffer(id, payload);
      } else {
        await api.createOffer(payload);
      }

      navigate('/offers');
    } catch (err: any) {
      setError(err.message || 'Failed to save offer');
    } finally {
      setIsSubmitting(false);
    }
  };

  const rupeeEquivalent = ((rewardPoints * 10) / 100).toFixed(2);
  const currentCategoryName =
    categories.find((c) => c.id === categoryId)?.name || 'Category';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-red-500">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-obsidian-800 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/offers')}
            className="p-2 rounded-lg bg-obsidian-800 text-slate-300 hover:text-white transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-black text-white tracking-wide">
              {isEditing ? 'Edit Offer' : 'Create New Offer'}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Configure partner offer details, completion steps, training material, and reward points.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsPreviewOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-obsidian-800 border border-obsidian-700 text-slate-200 hover:text-white text-sm font-semibold transition"
          >
            <Eye className="w-4 h-4" />
            Live Preview
          </button>
          <button
            type="button"
            onClick={(e) => handleSubmit(e, 'DRAFT')}
            disabled={isSubmitting}
            className="px-3.5 py-2 rounded-lg bg-obsidian-800 text-slate-300 hover:text-white text-sm font-semibold transition"
          >
            Save Draft
          </button>
          <button
            type="button"
            onClick={(e) => handleSubmit(e, 'PUBLISHED')}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition shadow-lg shadow-red-900/40"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Publish Offer
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/30 hover:bg-red-600/50 text-red-200 text-xs font-semibold transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      <form onSubmit={(e) => handleSubmit(e)} className="space-y-6">
        {/* Section 1: Basic Information */}
        <div className="bg-obsidian-900 p-6 rounded-xl border border-obsidian-700 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Gift className="w-4 h-4 text-red-500" />
            Basic Offer Details
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                Offer Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="e.g. Open Free Angel One Demat Account"
                className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                Slug (URL Identifier)
              </label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="e.g. angel-one-demat"
                className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-300 focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                Category *
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as OfferStatus)}
                className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
              >
                <option value="PUBLISHED">Published</option>
                <option value="DRAFT">Draft</option>
                <option value="PAUSED">Paused</option>
                <option value="EXPIRED">Expired</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                Display Order
              </label>
              <input
                type="number"
                min={0}
                value={displayOrder}
                onChange={(e) => setDisplayOrder(parseInt(e.target.value, 10) || 0)}
                className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                Reward Points *
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  step={10}
                  required
                  value={rewardPoints}
                  onChange={(e) => setRewardPoints(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg pl-3 pr-20 py-2 text-sm text-white focus:outline-none focus:border-red-500 font-bold"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-amber-400 font-semibold pointer-events-none">
                  <Coins className="w-3.5 h-3.5" />
                  <span>Points</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs mt-1.5 px-1">
                <span className="text-slate-400">Integer accounting conversion:</span>
                <span className="text-emerald-400 font-bold">
                  {rewardPoints.toLocaleString()} pts = ₹{rupeeEquivalent}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                Offer Expiry (Optional)
              </label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">Leave empty for no expiry.</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
              Description *
            </label>
            <textarea
              rows={3}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explain the offer, benefits, and key points to users..."
              className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 leading-relaxed"
            />
          </div>
        </div>

        {/* Section 2: Banner and Images */}
        <div className="bg-obsidian-900 p-6 rounded-xl border border-obsidian-700 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
            Banner & Gallery Images
          </h2>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
              Banner URL (Main Card Image)
            </label>
            <input
              type="url"
              value={bannerUrl}
              onChange={(e) => setBannerUrl(e.target.value)}
              placeholder="https://images.unsplash.com/... or CDN link"
              className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
              Additional Image URLs (Gallery / Proof Samples)
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="url"
                value={newImageUrl}
                onChange={(e) => setNewImageUrl(e.target.value)}
                placeholder="https://... image link"
                className="flex-1 bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
              />
              <button
                type="button"
                onClick={addImage}
                className="px-3.5 py-2 rounded-lg bg-obsidian-800 border border-obsidian-700 text-slate-200 hover:text-white text-xs font-semibold transition"
              >
                Add Image
              </button>
            </div>
            {images.length > 0 && (
              <div className="space-y-1.5 mt-2">
                {images.map((img, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg bg-obsidian-950 border border-obsidian-800 text-xs text-slate-300"
                  >
                    <span className="truncate max-w-md font-mono">{img}</span>
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="text-red-400 hover:text-red-300 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <OfferContentEditor value={content} onChange={setContent} />

        {/* Section 3: Step-by-Step Instructions */}
        <div className="bg-obsidian-900 p-6 rounded-xl border border-obsidian-700 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              Step-by-Step Instructions
            </h2>
            <span className="text-xs text-slate-500">Rendered in order for mobile users</span>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newInstruction}
              onChange={(e) => setNewInstruction(e.target.value)}
              placeholder="e.g. Complete Aadhaar OTP verification on partner portal"
              className="flex-1 bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addInstruction();
                }
              }}
            />
            <button
              type="button"
              onClick={addInstruction}
              className="px-3.5 py-2 rounded-lg bg-obsidian-800 border border-obsidian-700 text-slate-200 hover:text-white text-xs font-semibold transition"
            >
              Add Step
            </button>
          </div>

          {instructions.length > 0 ? (
            <div className="space-y-2">
              {instructions.map((step, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-obsidian-950 border border-obsidian-800 text-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-red-600/20 text-red-400 text-xs font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="text-slate-200">{step}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeInstruction(idx)}
                    className="text-red-400 hover:text-red-300 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">
              No instructions added yet. Optional — omitted from user view if empty.
            </p>
          )}
        </div>

        {/* Section 4: Completion Conditions & Attribution */}
        <div className="bg-obsidian-900 p-6 rounded-xl border border-obsidian-700 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            Completion Conditions & Tracking
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                Action Type
              </label>
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value as any)}
                className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
              >
                <option value="LINK_VISIT">LINK_VISIT (Direct landing page)</option>
                <option value="SIGNUP_SUBMIT">SIGNUP_SUBMIT (Registration flow)</option>
                <option value="FORM_FILL">FORM_FILL (Lead inquiry)</option>
                <option value="PURCHASE">PURCHASE (Transaction / Deposit)</option>
                <option value="CUSTOM">CUSTOM (Admin verified)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                Target / Destination URL
              </label>
              <input
                type="url"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://partner.com/campaign-landing"
                className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={requiresProof}
                onChange={(e) => setRequiresProof(e.target.checked)}
                className="w-4 h-4 rounded text-red-600 focus:ring-0 bg-obsidian-950 border-obsidian-700"
              />
              <span className="text-sm text-slate-300 font-medium">
                Requires User Proof (Screenshot / Reference ID)
              </span>
            </label>

            {requiresProof && (
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
                  Proof Submission Instructions
                </label>
                <input
                  type="text"
                  value={proofInstructions}
                  onChange={(e) => setProofInstructions(e.target.value)}
                  placeholder="e.g. Upload a screenshot showing your Client ID after login."
                  className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                />
              </div>
            )}

            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={completionCodeRequired}
                onChange={(e) => setCompletionCodeRequired(e.target.checked)}
                className="w-4 h-4 rounded text-red-600 focus:ring-0 bg-obsidian-950 border-obsidian-700"
              />
              <span className="text-sm text-slate-300 font-medium">
                Requires Partner Completion Code / Token
              </span>
            </label>
          </div>
        </div>

        {/* Section 5: Training Links (Optional) */}
        <div className="bg-obsidian-900 p-6 rounded-xl border border-obsidian-700 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              Training Links & Resources (Optional)
            </h2>
            <span className="text-xs text-slate-500">Omitted cleanly if none added</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input
              type="text"
              value={tlTitle}
              onChange={(e) => setTlTitle(e.target.value)}
              placeholder="Title (e.g. How to complete KYC)"
              className="bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
            />
            <input
              type="url"
              value={tlUrl}
              onChange={(e) => setTlUrl(e.target.value)}
              placeholder="https://youtube.com/... or guide"
              className="bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={tlDesc}
                onChange={(e) => setTlDesc(e.target.value)}
                placeholder="Description (Optional)"
                className="flex-1 bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
              />
              <button
                type="button"
                onClick={addTrainingLink}
                className="px-3.5 py-2 rounded-lg bg-obsidian-800 border border-obsidian-700 text-slate-200 hover:text-white text-xs font-semibold transition"
              >
                Add
              </button>
            </div>
          </div>

          <input type="url" aria-label="Training thumbnail URL" value={tlThumbnail} onChange={e => setTlThumbnail(e.target.value)} placeholder="Optional video thumbnail URL (set before Add)" className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-white" />
          {trainingLinks.length > 0 && (
            <div className="space-y-2">
              {trainingLinks.map((tl, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-obsidian-950 border border-obsidian-800 text-sm"
                >
                  <div>
                    <div className="font-semibold text-white">{tl.title}</div>
                    <div className="text-xs font-mono text-slate-400">{tl.url}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeTrainingLink(idx)}
                    className="text-red-400 hover:text-red-300 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 6: FAQs (Optional) */}
        <div className="bg-obsidian-900 p-6 rounded-xl border border-obsidian-700 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              Frequently Asked Questions (Optional)
            </h2>
            <span className="text-xs text-slate-500">Omitted cleanly if none added</span>
          </div>

          <div className="space-y-2">
            <input
              type="text"
              value={faqQuestion}
              onChange={(e) => setFaqQuestion(e.target.value)}
              placeholder="Question (e.g. When will points be credited?)"
              className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
            />
            <div className="flex gap-2">
              <textarea
                rows={2}
                value={faqAnswer}
                onChange={(e) => setFaqAnswer(e.target.value)}
                placeholder="Answer (e.g. Within 24-48 hours after verified registration)"
                className="flex-1 bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
              />
              <button
                type="button"
                onClick={addFaq}
                className="self-end px-3.5 py-2 rounded-lg bg-obsidian-800 border border-obsidian-700 text-slate-200 hover:text-white text-xs font-semibold transition"
              >
                Add FAQ
              </button>
            </div>
          </div>

          {faqs.length > 0 && (
            <div className="space-y-2">
              {faqs.map((faq, idx) => (
                <div
                  key={idx}
                  className="flex items-start justify-between p-3 rounded-lg bg-obsidian-950 border border-obsidian-800 text-sm"
                >
                  <div className="space-y-1">
                    <div className="font-semibold text-slate-200">{faq.question}</div>
                    <div className="text-xs text-slate-400">{faq.answer}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFaq(idx)}
                    className="text-red-400 hover:text-red-300 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 7: Additional Notes */}
        <div className="bg-obsidian-900 p-6 rounded-xl border border-obsidian-700 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
            Additional Notes & Terms (Optional)
          </h2>
          <textarea
            rows={2}
            value={additionalNotes}
            onChange={(e) => setAdditionalNotes(e.target.value)}
            placeholder="Important disclaimers, compliance terms, or special criteria..."
            className="w-full bg-obsidian-950 border border-obsidian-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
          />
        </div>

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-obsidian-800">
          <button
            type="button"
            onClick={() => navigate('/offers')}
            className="px-4 py-2.5 rounded-lg bg-obsidian-800 text-slate-300 hover:text-white text-sm font-medium transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setIsPreviewOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-obsidian-800 border border-obsidian-700 text-slate-200 hover:text-white text-sm font-semibold transition"
          >
            <Eye className="w-4 h-4" />
            Live Preview
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition shadow-lg shadow-red-900/40"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {isEditing ? 'Update Offer' : 'Create & Publish Offer'}
          </button>
        </div>
      </form>

      {/* Live Preview Modal */}
      <Modal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        title={`Live Preview: ${title || 'Untitled Offer'}`}
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {bannerUrl && (
            <div className="rounded-xl overflow-hidden border border-obsidian-700 bg-obsidian-950 max-h-48">
              <img src={bannerUrl} alt={title} className="w-full h-full object-cover" />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-semibold">
                {currentCategoryName}
              </span>
              <div className="flex items-center gap-1.5 text-amber-400 font-bold text-sm">
                <Coins className="w-4 h-4" />
                <span>{rewardPoints.toLocaleString()} Points</span>
                <span className="text-emerald-400 text-xs font-normal">(₹{rupeeEquivalent})</span>
              </div>
            </div>
            <h2 className="text-xl font-bold text-white mt-2">{title || 'Offer Title'}</h2>
            <p className="text-sm text-slate-300 mt-2 leading-relaxed">
              {description || 'Offer description goes here.'}
            </p>
          </div>

          {Object.entries(content).map(([key, value]) => Array.isArray(value) && key !== 'marketingBanners' && value.length > 0 ? <section key={key} className="text-slate-200"><h3 className="font-bold capitalize">{key.replace(/([A-Z])/g, ' $1')}</h3><ul className="list-disc pl-5">{value.map((line: string, i: number) => <li key={i}>{line}</li>)}</ul></section> : null)}
          {content.marketingMessage && <p className="text-slate-200">{content.marketingMessage}</p>}
          {content.marketingBanners?.map((b, i) => <figure key={i}><img className="w-full rounded-xl" src={b.imageUrl} alt={b.title} /><figcaption>{b.title}</figcaption></figure>)}
          {/* Instructions (omitted if empty) */}
          {instructions.length > 0 && (
            <div className="bg-obsidian-950 p-4 rounded-xl border border-obsidian-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                Step-by-Step Instructions
              </h3>
              <ol className="space-y-2 list-decimal list-inside text-sm text-slate-300">
                {instructions.map((step, idx) => (
                  <li key={idx} className="leading-snug">
                    <span className="text-slate-200">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Training Links (omitted if empty) */}
          {trainingLinks.length > 0 && (
            <div className="bg-obsidian-950 p-4 rounded-xl border border-obsidian-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                Helpful Training Links
              </h3>
              <div className="space-y-2">
                {trainingLinks.map((tl, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-lg bg-obsidian-900 border border-obsidian-800 text-sm"
                  >
                    <div className="font-semibold text-slate-200">{tl.title}</div>
                    <div className="text-xs font-mono text-slate-400 mt-0.5">{tl.url}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* FAQs (omitted if empty) */}
          {faqs.length > 0 && (
            <div className="bg-obsidian-950 p-4 rounded-xl border border-obsidian-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                Frequently Asked Questions
              </h3>
              <div className="space-y-2">
                {faqs.map((faq, idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-obsidian-900 border border-obsidian-800">
                    <div className="text-sm font-semibold text-slate-200">{faq.question}</div>
                    <div className="text-xs text-slate-400 mt-1 leading-relaxed">{faq.answer}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Additional Notes (omitted if empty) */}
          {additionalNotes && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
              <span className="font-semibold">Important Notes: </span>
              {additionalNotes}
            </div>
          )}

          <div className="p-3 rounded-lg bg-obsidian-950 border border-obsidian-800 text-xs text-slate-400">
            <span className="font-semibold text-white">Attribution Notice: </span>
            Signed share links will be generated for users as `?ref=[referralCode]&sig=[hmac]`. Sharing alone does not award points.
          </div>
        </div>
      </Modal>
    </div>
  );
};
export default CreateEditOffer;

