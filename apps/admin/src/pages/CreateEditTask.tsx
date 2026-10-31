import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Loader2,
  AlertCircle,
  ShieldCheck,
  Sparkles,
  Clock,
  FlaskConical,
  BookOpen,
  HelpCircle,
  Smartphone,
  Eye,
  CheckCircle2,
  Calendar,
  Layers,
  FileText,
  Video,
  Play,
  MessageSquare,
  Star,
  Download,
  Users,
  Target,
} from 'lucide-react';
import { api, ApiError } from '../services/api';
import { Campaign, TaskCategory, VerificationMethod } from '../types';

export const CreateEditTask: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const [searchParams] = useSearchParams();
  const initialCampaignId = searchParams.get('campaignId') || '';
  const navigate = useNavigate();

  // Basic task fields
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState(initialCampaignId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TaskCategory>('ARTICLE_READ');
  const [verificationMethod, setVerificationMethod] = useState<VerificationMethod>('FIRST_PARTY_ACTION');
  const [rewardPoints, setRewardPoints] = useState<number>(200);
  const [totalCap, setTotalCap] = useState<number>(1000);
  const [dailyCapPerUser, setDailyCapPerUser] = useState<number>(1);
  const [dwellTimeSeconds, setDwellTimeSeconds] = useState<number>(30);
  const [minAncestryDepth, setMinAncestryDepth] = useState<number>(0);
  const [kycRequired, setKycRequired] = useState<boolean>(false);
  const [externalActionUrl, setExternalActionUrl] = useState('');
  const [instructions, setInstructions] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  // Article Read Config
  const [articleTitle, setArticleTitle] = useState('');
  const [articleContent, setArticleContent] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [minReadDurationSeconds, setMinReadDurationSeconds] = useState<number>(30);
  const [minScrollPercentage, setMinScrollPercentage] = useState<number>(80);

  // Article Comprehension Quiz Config
  const [enableQuiz, setEnableQuiz] = useState(true);
  const [quizQuestion, setQuizQuestion] = useState('');
  const [quizOptions, setQuizOptions] = useState<string[]>([
    'Only when sending money or checking bank balance',
    'Whenever someone sends you money to receive it',
    'When an unknown caller asks for verification',
    'To claim a lottery cashback reward',
  ]);
  const [quizCorrectOptionIndex, setQuizCorrectOptionIndex] = useState<number>(0);

  // Video Watch Config
  const [videoUrl, setVideoUrl] = useState('');
  const [videoDuration, setVideoDuration] = useState<number>(60);
  const [requiredWatchSeconds, setRequiredWatchSeconds] = useState<number>(30);
  const [videoCompletionPolicy, setVideoCompletionPolicy] = useState<'MINIMUM_DURATION' | 'FULL_VIDEO'>('MINIMUM_DURATION');
  const [enableVideoQuiz, setEnableVideoQuiz] = useState(true);
  const [videoQuizQuestion, setVideoQuizQuestion] = useState('');
  const [videoQuizOptions, setVideoQuizOptions] = useState<string[]>([
    'Verify merchant display name and security badge',
    'Enter PIN without looking at the payee',
    'Share OTP with the vendor',
    'Pay twice to ensure confirmation',
  ]);
  const [videoQuizCorrectOptionIndex, setVideoQuizCorrectOptionIndex] = useState<number>(0);

  // App Install / Testing & Feedback Config
  const [appName, setAppName] = useState('');
  const [packageName, setPackageName] = useState('');
  const [storeUrl, setStoreUrl] = useState('');
  const [testingSteps, setTestingSteps] = useState('');
  const [feedbackQuestion, setFeedbackQuestion] = useState('');
  const [appAttributionMethod, setAppAttributionMethod] = useState<'IN_APP_FEEDBACK' | 'MANUAL_REVIEW' | 'CLIENT_PACKAGE_PRESENCE'>('CLIENT_PACKAGE_PRESENCE');
  const [conversionEvent, setConversionEvent] = useState<'INSTALL_ONLY' | 'FIRST_OPEN' | 'INSTALL' | 'REGISTER' | 'IN_APP_PURCHASE'>('INSTALL_ONLY');
  const [requiredTestingSeconds, setRequiredTestingSeconds] = useState<number>(60);
  const [completionCode, setCompletionCode] = useState('');

  // YouTube Video Learning Config
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeSessionDuration, setYoutubeSessionDuration] = useState<number>(60);
  const [enableYouTubeQuiz, setEnableYouTubeQuiz] = useState(true);
  const [youtubeQuizQuestion, setYoutubeQuizQuestion] = useState('');
  const [youtubeQuizOptions, setYoutubeQuizOptions] = useState<string[]>([
    'Never share the OTP with anyone under any circumstances',
    'Share the OTP only if the caller claims to be official bank staff',
    'Email the OTP to the caller',
    'Share only the last 2 digits of the OTP',
  ]);
  const [youtubeQuizCorrectOptionIndex, setYoutubeQuizCorrectOptionIndex] = useState<number>(0);

  // Task Targeting & Assignment Config
  const [assignedUserIdsText, setAssignedUserIdsText] = useState('');
  const [userGroupsText, setUserGroupsText] = useState('');

  // View state
  const [activeTab, setActiveTab] = useState<'FORM' | 'PREVIEW'>('FORM');
  const [previewSubTab, setPreviewSubTab] = useState<'FEED_CARD' | 'TASK_SCREEN'>('FEED_CARD');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const selectedCampaign = campaigns.find((c) => c.id === campaignId);
  const isSandboxCampaign = !!selectedCampaign?.isSandbox;

  // Sample defaults helper for quick article task setup
  const fillSampleArticleDefaults = () => {
    setTitle('Understanding UPI & Digital Payment Safety');
    setDescription('Learn how UPI 2-factor authentication protects daily transactions in India.');
    setInstructions(
      '1. Read through the article carefully for at least 30 seconds.\n2. Scroll through the full content.\n3. Answer the single verification question to claim promotional points.'
    );
    setCategory('ARTICLE_READ');
    setVerificationMethod('FIRST_PARTY_ACTION');
    setRewardPoints(200);
    setTotalCap(1000);
    setDailyCapPerUser(1);
    setDwellTimeSeconds(30);
    setArticleTitle('How UPI & 2-Factor Authentication Secure Your Money');
    setArticleContent(
      `Unified Payments Interface (UPI) developed by the National Payments Corporation of India (NPCI) has revolutionized instant digital payments across India. Built on immediate mobile authentication, UPI connects directly to your bank account using virtual payment addresses.\n\n` +
      `A critical security rule of UPI is that your UPI PIN is ONLY required when money is being deducted from your account — such as when sending money or checking your bank balance. You NEVER need to enter your UPI PIN, password, or scan a QR code to receive money into your account.\n\n` +
      `Always verify the verified merchant badge and recipient display name on your payment app before entering your 4-digit or 6-digit UPI PIN. Never share OTPs or download remote screen-sharing tools requested by unknown callers.`
    );
    setMinReadDurationSeconds(30);
    setMinScrollPercentage(80);
    setEnableQuiz(true);
    setQuizQuestion('When should you enter your UPI PIN on your phone?');
    setQuizOptions([
      'Only when sending money or checking bank balance',
      'Whenever someone sends you money to receive it',
      'When an unknown caller asks for verification',
      'To claim an unexpected cashback lottery reward',
    ]);
    setQuizCorrectOptionIndex(0);
    setKycRequired(false);
    setMinAncestryDepth(0);
    setExternalActionUrl('');
  };

  const fillSandboxDefaults = () => {
    setTitle('[SANDBOX] Explore ADPAYON Features');
    setDescription('Explore ADPAYON platform features in the physical Android sandbox environment.');
    setInstructions(
      '1. Open the ADPAYON application.\n2. Navigate through the available tabs and features.\n3. Remain active for at least 30 seconds.\n4. Complete the task to verify non-withdrawable promotional points (10 PTS).'
    );
    setCategory('IN_APP_ACTION');
    setVerificationMethod('FIRST_PARTY_ACTION');
    setRewardPoints(10);
    setDwellTimeSeconds(30);
    setTotalCap(10);
    setDailyCapPerUser(1);
    setMinAncestryDepth(0);
    setKycRequired(false);
    setExternalActionUrl('');
  };

  const fillSampleVideoDefaults = () => {
    setTitle('Digital Security: Verifying QR Codes & Payment Safety');
    setDescription('Watch this educational video on verifying digital merchant QR codes safely.');
    setInstructions(
      '1. Watch the video to learn how to check merchant credentials.\n2. Answer the quick verification question.\n3. Claim promotional reward points.'
    );
    setCategory('VIDEO_WATCH');
    setVerificationMethod('FIRST_PARTY_ACTION');
    setRewardPoints(150);
    setTotalCap(1000);
    setDailyCapPerUser(1);
    setDwellTimeSeconds(30);
    setVideoUrl('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
    setVideoDuration(60);
    setRequiredWatchSeconds(30);
    setVideoCompletionPolicy('MINIMUM_DURATION');
    setEnableVideoQuiz(true);
    setVideoQuizQuestion('What must you verify before confirming a digital QR code payment?');
    setVideoQuizOptions([
      'Display merchant name and verified payment checkmark',
      'Always ignore the name and pay instantly',
      'Share your OTP with bystanders',
      'Scan the same QR code twice',
    ]);
    setVideoQuizCorrectOptionIndex(0);
    setKycRequired(false);
    setMinAncestryDepth(0);
    setExternalActionUrl('');
  };

  const fillSampleAppFeedbackDefaults = () => {
    setTitle('Test BudgetPlanner Mobile & Share Feedback');
    setDescription('Explore the new personal budgeting tool on Google Play and submit honest UX feedback.');
    setInstructions(
      '1. Open Google Play link and explore the app dashboard.\n2. Note any navigation or text legibility issues.\n3. Return to ADPAYON and submit your feedback to claim points.'
    );
    setCategory('APP_INSTALL');
    setVerificationMethod('FIRST_PARTY_ACTION');
    setRewardPoints(250);
    setTotalCap(500);
    setDailyCapPerUser(1);
    setDwellTimeSeconds(30);
    setAppName('BudgetPlanner');
    setPackageName('com.budget.planner.safe');
    setStoreUrl('https://play.google.com/store/apps/details?id=com.budget.planner.safe');
    setTestingSteps('1. Open app and explore dashboard.\n2. Check income vs expense chart readability.\n3. Verify response time on your phone.');
    setFeedbackQuestion('How easy was it to navigate the main budget overview?');
    setRequiredTestingSeconds(60);
    setAppAttributionMethod('CLIENT_PACKAGE_PRESENCE');
    setConversionEvent('INSTALL_ONLY');
    setCompletionCode('');
    setKycRequired(false);
    setMinAncestryDepth(0);
    setExternalActionUrl('');
  };

  const fillSampleYouTubeDefaults = () => {
    setTitle('Financial Education: Mobile Banking & Fraud Awareness');
    setDescription('Learn how digital payment authentication protects your account from unauthorized access.');
    setInstructions(
      '1. Watch the authorized educational learning video for at least 45 seconds.\n2. Review fraud protection best practices.\n3. Answer the comprehension quiz question to claim promotional reward points.'
    );
    setCategory('YOUTUBE_LEARNING');
    setVerificationMethod('FIRST_PARTY_ACTION');
    setRewardPoints(250);
    setTotalCap(1000);
    setDailyCapPerUser(1);
    setDwellTimeSeconds(45);
    setYoutubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    setYoutubeSessionDuration(45);
    setEnableYouTubeQuiz(true);
    setYoutubeQuizQuestion('What should you do when receiving an unexpected OTP verification request?');
    setYoutubeQuizOptions([
      'Never share the OTP with anyone under any circumstances',
      'Share the OTP only if the caller claims to be official bank security',
      'Share the OTP to claim an unexpected cash prize',
      'Enter the OTP on any link received via SMS',
    ]);
    setYoutubeQuizCorrectOptionIndex(0);
    setKycRequired(false);
    setMinAncestryDepth(0);
    setExternalActionUrl('');
  };

  const extractYouTubeId = (url: string) => {
    if (!url) return '';
    const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/i;
    const match = url.match(regExp);
    return match && match[1] ? match[1] : '';
  };

  const handleStoreUrlChange = (val: string) => {
    setStoreUrl(val);
    // Auto-detect Android package identifier from Google Play URL
    const playMatch = val.match(/(?:play\.google\.com\/store\/apps\/details\?.*?id=)([a-zA-Z0-9._]+)/i);
    if (playMatch && playMatch[1]) {
      setPackageName(playMatch[1]);
      clearFieldError('packageName');
    }
    // Auto-detect Apple App Store identifier from iOS App Store URL
    const iosMatch = val.match(/apps\.apple\.com\/(?:[a-zA-Z-]+\/)?app\/(?:[^\/]+\/)?id(\d+)/i);
    if (iosMatch && iosMatch[1] && !packageName) {
      setPackageName(`ios.app.${iosMatch[1]}`);
      clearFieldError('packageName');
    }
  };

  useEffect(() => {
    async function loadInitialData() {
      setIsLoading(true);
      try {
        const campaignsRes = await api.listCampaigns({ limit: 100 });
        if (campaignsRes.success) {
          setCampaigns(campaignsRes.data.campaigns);
          if (!campaignId && campaignsRes.data.campaigns.length > 0) {
            setCampaignId(campaignsRes.data.campaigns[0].id);
          }
        }

        if (isEdit && id) {
          const taskRes = await api.getTask(id!);
          if (taskRes.success && taskRes.data.task) {
            const t = taskRes.data.task;
            setCampaignId(t.campaignId);
            setTitle(t.title);
            setDescription(t.description || '');
            setCategory(t.category);
            setVerificationMethod(t.verificationMethod);
            setRewardPoints(t.rewardPoints);
            setTotalCap(t.totalCap);
            setDailyCapPerUser(t.dailyCapPerUser);
            setDwellTimeSeconds(t.dwellTimeSeconds);
            if (t.targeting) {
              setMinAncestryDepth(t.targeting.minAncestryDepth || 0);
              setKycRequired(!!t.targeting.kycRequired);
              if (t.targeting.assignedUserIds) {
                setAssignedUserIdsText(t.targeting.assignedUserIds.join(', '));
              }
              if (t.targeting.userGroups) {
                setUserGroupsText(t.targeting.userGroups.join(', '));
              }
            }
            setExternalActionUrl(t.externalActionUrl || '');
            setInstructions(t.instructions || '');
            if (t.expiresAt) {
              const dt = new Date(t.expiresAt);
              setExpiresAt(dt.toISOString().slice(0, 16));
            }

            if (t.articleReadConfig) {
              setArticleTitle(t.articleReadConfig.articleTitle || '');
              setArticleContent(t.articleReadConfig.articleContent || '');
              setSourceUrl(t.articleReadConfig.sourceUrl || '');
              setMinReadDurationSeconds(t.articleReadConfig.minReadDurationSeconds || 30);
              setMinScrollPercentage(t.articleReadConfig.minScrollPercentage || 80);

              if (t.articleReadConfig.comprehensionQuiz) {
                setEnableQuiz(true);
                setQuizQuestion(t.articleReadConfig.comprehensionQuiz.question || '');
                setQuizOptions(t.articleReadConfig.comprehensionQuiz.options || ['', '', '', '']);
                setQuizCorrectOptionIndex(t.articleReadConfig.comprehensionQuiz.correctOptionIndex || 0);
              } else {
                setEnableQuiz(false);
              }
            }

            if (t.videoWatchConfig) {
              setVideoUrl(t.videoWatchConfig.videoUrl || '');
              setVideoDuration(t.videoWatchConfig.videoDurationSeconds || t.videoWatchConfig.videoDuration || 60);
              setRequiredWatchSeconds(t.videoWatchConfig.requiredWatchSeconds || 30);
              setVideoCompletionPolicy(t.videoWatchConfig.completionPolicy || 'MINIMUM_DURATION');
              if (t.videoWatchConfig.comprehensionQuiz) {
                setEnableVideoQuiz(true);
                setVideoQuizQuestion(t.videoWatchConfig.comprehensionQuiz.question || '');
                setVideoQuizOptions(t.videoWatchConfig.comprehensionQuiz.options || ['', '', '', '']);
                setVideoQuizCorrectOptionIndex(t.videoWatchConfig.comprehensionQuiz.correctOptionIndex || 0);
              } else {
                setEnableVideoQuiz(false);
              }
            }

            if (t.youtubeLearningConfig) {
              setYoutubeUrl(t.youtubeLearningConfig.youtubeUrl || '');
              setYoutubeSessionDuration(
                t.youtubeLearningConfig.requiredDurationSeconds ||
                  t.youtubeLearningConfig.sessionDurationSeconds ||
                  60
              );
              if (t.youtubeLearningConfig.comprehensionQuiz) {
                setEnableYouTubeQuiz(true);
                setYoutubeQuizQuestion(t.youtubeLearningConfig.comprehensionQuiz.question || '');
                setYoutubeQuizOptions(t.youtubeLearningConfig.comprehensionQuiz.options || ['', '', '', '']);
                setYoutubeQuizCorrectOptionIndex(t.youtubeLearningConfig.comprehensionQuiz.correctOptionIndex || 0);
              } else {
                setEnableYouTubeQuiz(false);
              }
            }

            if (t.appInstallConfig) {
              setAppName(t.appInstallConfig.appName || '');
              setPackageName(t.appInstallConfig.packageName || '');
              setStoreUrl(t.appInstallConfig.storeUrl || '');
              setTestingSteps(t.appInstallConfig.testingSteps || '');
              setFeedbackQuestion(t.appInstallConfig.feedbackQuestion || '');
              setCompletionCode(t.appInstallConfig.completionCode || '');
              setRequiredTestingSeconds(t.appInstallConfig.requiredTestingSeconds || 60);
              if (t.appInstallConfig.attributionMethod) {
                setAppAttributionMethod(t.appInstallConfig.attributionMethod as any);
              }
              if (t.appInstallConfig.conversionEvent) {
                setConversionEvent(t.appInstallConfig.conversionEvent as any);
              }
            }
          }
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load task setup data');
      } finally {
        setIsLoading(false);
      }
    }
    loadInitialData();
  }, [id, isEdit]);

  const clearFieldError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleOptionChange = (index: number, val: string) => {
    setQuizOptions((prev) => {
      const copy = [...prev];
      copy[index] = val;
      return copy;
    });
    clearFieldError('quizOptions');
  };

  const handleVideoOptionChange = (index: number, val: string) => {
    setVideoQuizOptions((prev) => {
      const copy = [...prev];
      copy[index] = val;
      return copy;
    });
    clearFieldError('videoQuizOptions');
  };

  const handleYouTubeOptionChange = (index: number, val: string) => {
    setYoutubeQuizOptions((prev) => {
      const copy = [...prev];
      copy[index] = val;
      return copy;
    });
    clearFieldError('youtubeQuizOptions');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    // Inline validation checks
    const errs: Record<string, string> = {};
    if (!title.trim() || title.trim().length < 3) {
      errs.title = 'Title must contain at least 3 characters';
    }

    if (category === 'ARTICLE_READ') {
      const effArticleTitle = articleTitle.trim() || title.trim();
      if (!effArticleTitle || effArticleTitle.length < 3) {
        errs.articleTitle = 'Article title must be at least 3 characters';
      }
      if (!articleContent.trim() || articleContent.trim().length < 30) {
        errs.articleContent = 'Article content must contain at least 30 characters';
      }
      if (minReadDurationSeconds < 5) {
        errs.minReadDurationSeconds = 'Minimum read duration must be at least 5 seconds';
      }
      if (enableQuiz) {
        if (!quizQuestion.trim() || quizQuestion.trim().length < 5) {
          errs.quizQuestion = 'Quiz question must contain at least 5 characters';
        }
        const validOpts = quizOptions.map((o) => o.trim()).filter((o) => o.length > 0);
        if (validOpts.length < 2) {
          errs.quizOptions = 'At least 2 non-empty quiz options are required';
        }
        if (quizCorrectOptionIndex >= validOpts.length) {
          errs.quizCorrectOptionIndex = 'Correct answer must point to an active option';
        }
      }
    } else if (category === 'VIDEO_WATCH') {
      if (!videoUrl.trim() || !/^https?:\/\//i.test(videoUrl.trim())) {
        errs.videoUrl = 'Valid HTTP/HTTPS video URL is required';
      }
      if (videoDuration < 5) {
        errs.videoDuration = 'Video duration must be at least 5 seconds';
      }
      if (requiredWatchSeconds < 5 || requiredWatchSeconds > videoDuration) {
        errs.requiredWatchSeconds = 'Required watch time must be between 5s and the total duration';
      }
      if (enableVideoQuiz) {
        if (!videoQuizQuestion.trim() || videoQuizQuestion.trim().length < 5) {
          errs.videoQuizQuestion = 'Verification question must contain at least 5 characters';
        }
        const validOpts = videoQuizOptions.map((o) => o.trim()).filter((o) => o.length > 0);
        if (validOpts.length < 2) {
          errs.videoQuizOptions = 'At least 2 non-empty quiz options are required';
        }
        if (videoQuizCorrectOptionIndex >= validOpts.length) {
          errs.videoQuizCorrectOptionIndex = 'Correct answer must point to an active option';
        }
      }
    } else if (category === 'YOUTUBE_LEARNING') {
      if (!youtubeUrl.trim() || !extractYouTubeId(youtubeUrl.trim())) {
        errs.youtubeUrl = 'Valid YouTube video URL is required (e.g., https://www.youtube.com/watch?v=VIDEO_ID)';
      }
      if (youtubeSessionDuration < 5) {
        errs.youtubeSessionDuration = 'Session duration must be at least 5 seconds';
      }
      if (enableYouTubeQuiz) {
        if (!youtubeQuizQuestion.trim() || youtubeQuizQuestion.trim().length < 5) {
          errs.youtubeQuizQuestion = 'Comprehension quiz question must contain at least 5 characters';
        }
        const validOpts = youtubeQuizOptions.map((o) => o.trim()).filter((o) => o.length > 0);
        if (validOpts.length < 2) {
          errs.youtubeQuizOptions = 'At least 2 non-empty quiz options are required';
        }
        if (youtubeQuizCorrectOptionIndex >= validOpts.length) {
          errs.youtubeQuizCorrectOptionIndex = 'Correct answer must point to an active option';
        }
      }
    } else if (category === 'APP_INSTALL' || category === 'APP_TESTING') {
      if (!packageName.trim() || packageName.trim().length < 3) {
        errs.packageName = 'Application package name is required (e.g., com.example.app)';
      }
    }

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setError('Please resolve validation errors before saving');
      return;
    }

    setIsSaving(true);

    const resolvedDescription = description.trim() || instructions.trim() || title.trim();

    let articleReadConfig: any = undefined;
    if (category === 'ARTICLE_READ') {
      const validOptions = quizOptions.map((o) => o.trim()).filter((o) => o.length > 0);
      articleReadConfig = {
        articleTitle: articleTitle.trim() || title.trim(),
        articleContent: articleContent.trim(),
        sourceUrl: sourceUrl.trim() || undefined,
        minReadDurationSeconds: Number(minReadDurationSeconds) || 30,
        minScrollPercentage: Number(minScrollPercentage) || 80,
        comprehensionQuiz:
          enableQuiz && quizQuestion.trim() && validOptions.length >= 2
            ? {
                question: quizQuestion.trim(),
                options: validOptions,
                correctOptionIndex: Math.min(quizCorrectOptionIndex, validOptions.length - 1),
              }
            : undefined,
      };
    }

    let videoWatchConfig: any = undefined;
    if (category === 'VIDEO_WATCH') {
      const validOpts = videoQuizOptions.map((o) => o.trim()).filter((o) => o.length > 0);
      videoWatchConfig = {
        videoUrl: videoUrl.trim(),
        videoDuration: Number(videoDuration) || 60,
        videoDurationSeconds: Number(videoDuration) || 60,
        requiredWatchSeconds: Number(requiredWatchSeconds) || 30,
        completionPolicy: videoCompletionPolicy,
        allowSeeking: false,
        comprehensionQuiz:
          enableVideoQuiz && videoQuizQuestion.trim() && validOpts.length >= 2
            ? {
                question: videoQuizQuestion.trim(),
                options: validOpts,
                correctOptionIndex: Math.min(videoQuizCorrectOptionIndex, validOpts.length - 1),
              }
            : undefined,
      };
    }

    let youtubeLearningConfig: any = undefined;
    if (category === 'YOUTUBE_LEARNING') {
      const validOpts = youtubeQuizOptions.map((o) => o.trim()).filter((o) => o.length > 0);
      const ytId = extractYouTubeId(youtubeUrl.trim());
      youtubeLearningConfig = {
        youtubeUrl: youtubeUrl.trim(),
        videoId: ytId,
        videoTitle: title.trim(),
        requiredDurationSeconds: Number(youtubeSessionDuration) || 60,
        sessionDurationSeconds: Number(youtubeSessionDuration) || 60,
        instructions: instructions.trim() || undefined,
        educationalNotice:
          'Educational video learning. Rewards are granted exclusively for verified comprehension quiz completion, not YouTube view counts or platform metrics.',
        comprehensionQuiz:
          enableYouTubeQuiz && youtubeQuizQuestion.trim() && validOpts.length >= 2
            ? {
                question: youtubeQuizQuestion.trim(),
                options: validOpts,
                correctOptionIndex: Math.min(youtubeQuizCorrectOptionIndex, validOpts.length - 1),
              }
            : undefined,
      };
    }

    let appInstallConfig: any = undefined;
    if (category === 'APP_INSTALL' || category === 'APP_TESTING') {
      const isInstallOnly = conversionEvent === 'INSTALL_ONLY' || appAttributionMethod === 'CLIENT_PACKAGE_PRESENCE';
      appInstallConfig = {
        appName: appName.trim() || title.trim(),
        packageName: packageName.trim() || 'com.example.app',
        storeUrl: storeUrl.trim() || undefined,
        platform: 'ANDROID',
        attributionMethod: appAttributionMethod,
        conversionEvent: conversionEvent,
        testingSteps: isInstallOnly ? undefined : (testingSteps.trim() || undefined),
        feedbackQuestion: isInstallOnly ? undefined : (feedbackQuestion.trim() || undefined),
        requiredTestingSeconds: isInstallOnly ? 0 : (Number(requiredTestingSeconds) || 60),
        completionCode: isInstallOnly ? undefined : (completionCode.trim() || undefined),
      };
    }

    const isFirstParty =
      category === 'ARTICLE_READ' ||
      category === 'VIDEO_WATCH' ||
      category === 'YOUTUBE_LEARNING' ||
      (category === 'APP_INSTALL' && (appAttributionMethod === 'IN_APP_FEEDBACK' || appAttributionMethod === 'CLIENT_PACKAGE_PRESENCE' || conversionEvent === 'INSTALL_ONLY')) ||
      (category === 'APP_TESTING' && (appAttributionMethod === 'IN_APP_FEEDBACK' || appAttributionMethod === 'CLIENT_PACKAGE_PRESENCE' || conversionEvent === 'INSTALL_ONLY'));

    const assignedUserIds = assignedUserIdsText
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const userGroups = userGroupsText
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const payload: any = {
      campaignId,
      title: title.trim(),
      description: resolvedDescription,
      category,
      verificationMethod:
        category === 'APP_INSTALL' && appAttributionMethod === 'MANUAL_REVIEW'
          ? 'MANUAL_REVIEW'
          : category === 'APP_TESTING' && appAttributionMethod === 'MANUAL_REVIEW'
          ? 'MANUAL_REVIEW'
          : isFirstParty
          ? 'FIRST_PARTY_ACTION'
          : verificationMethod,
      rewardPoints: Number(rewardPoints),
      totalCap: Number(totalCap),
      dailyCapPerUser: Number(dailyCapPerUser),
      dwellTimeSeconds:
        category === 'ARTICLE_READ'
          ? Number(minReadDurationSeconds)
          : category === 'VIDEO_WATCH'
          ? Number(requiredWatchSeconds)
          : category === 'YOUTUBE_LEARNING'
          ? Number(youtubeSessionDuration)
          : Number(dwellTimeSeconds),
      targeting: {
        minAncestryDepth: minAncestryDepth > 0 ? minAncestryDepth : undefined,
        kycRequired,
        assignedUserIds: assignedUserIds.length > 0 ? assignedUserIds : undefined,
        userGroups: userGroups.length > 0 ? userGroups : undefined,
      },
      externalActionUrl: externalActionUrl.trim() || undefined,
      instructions: instructions.trim() || undefined,
      articleReadConfig,
      videoWatchConfig,
      youtubeLearningConfig,
      appInstallConfig,
      expiresAt: expiresAt.trim() ? new Date(expiresAt).toISOString() : undefined,
    };

    try {
      if (isEdit && id) {
        await api.updateTask(id!, payload);
      } else {
        await api.createTask(payload);
      }
      navigate('/tasks');
    } catch (err: any) {
      setError(err.message || 'Failed to save task configuration');
      if (err instanceof ApiError && err.fieldErrors) {
        setFieldErrors(err.fieldErrors);
      } else if (err.fieldErrors) {
        setFieldErrors(err.fieldErrors);
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  const effectiveArticleTitle = articleTitle.trim() || title.trim() || 'Untitled Article';
  const effectiveDuration = category === 'ARTICLE_READ' ? minReadDurationSeconds : dwellTimeSeconds;
  const approxMinutes = Math.max(1, Math.ceil(effectiveDuration / 60));
  const articleParagraphs = articleContent.trim()
    ? articleContent.split(/\n\s*\n/).filter((p) => p.trim().length > 0)
    : [
        'Article content will appear here formatted into clear paragraphs for mobile earners.',
        'Earners read through the text while the server securely measures dwell time and scroll progress.',
      ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            to="/tasks"
            className="p-2 rounded-xl bg-obsidian-800 border border-obsidian-700 text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              {isEdit ? 'Edit Task Specification' : 'Create Task Specification'}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Configure rewards, article reading content, single-question quiz verification, and expiry limits.
            </p>
          </div>
        </div>

        {/* Tab switch: Form vs Mobile Preview */}
        <div className="flex rounded-xl bg-obsidian-800 p-1 border border-obsidian-700">
          <button
            type="button"
            onClick={() => setActiveTab('FORM')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'FORM'
                ? 'bg-emerald-500 text-obsidian-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Task Form</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('PREVIEW')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'PREVIEW'
                ? 'bg-emerald-500 text-obsidian-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Mobile Preview</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-950/40 p-4 text-xs text-rose-300">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold block">{error}</span>
            {Object.keys(fieldErrors).length > 0 && (
              <ul className="list-disc list-inside space-y-0.5 text-rose-400/90 pl-1">
                {Object.entries(fieldErrors).map(([field, msg]) => (
                  <li key={field}>
                    <strong className="capitalize">{field}</strong>: {msg}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* QUICK PRESET BAR */}
      {!isEdit && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl border border-obsidian-700 bg-obsidian-900/60 glass-panel">
          <span className="text-xs font-semibold text-slate-300 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            Quick Setup Presets:
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={fillSampleArticleDefaults}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition flex items-center gap-1.5 ${
                category === 'ARTICLE_READ'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 ring-1 ring-emerald-500/30'
                  : 'bg-obsidian-800 hover:bg-obsidian-700 text-slate-300 border-obsidian-700'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
              Educational Article
            </button>
            <button
              type="button"
              onClick={fillSampleVideoDefaults}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition flex items-center gap-1.5 ${
                category === 'VIDEO_WATCH'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 ring-1 ring-amber-500/30'
                  : 'bg-obsidian-800 hover:bg-obsidian-700 text-slate-300 border-obsidian-700'
              }`}
            >
              <Video className="w-3.5 h-3.5 text-amber-400" />
              Direct Video
            </button>
            <button
              type="button"
              onClick={fillSampleYouTubeDefaults}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition flex items-center gap-1.5 ${
                category === 'YOUTUBE_LEARNING'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 ring-1 ring-rose-500/30'
                  : 'bg-obsidian-800 hover:bg-obsidian-700 text-slate-300 border-obsidian-700'
              }`}
            >
              <Play className="w-3.5 h-3.5 text-rose-400" />
              YouTube Learning
            </button>
            <button
              type="button"
              onClick={fillSampleAppFeedbackDefaults}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition flex items-center gap-1.5 ${
                category === 'APP_INSTALL'
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 ring-1 ring-cyan-500/30'
                  : 'bg-obsidian-800 hover:bg-obsidian-700 text-slate-300 border-obsidian-700'
              }`}
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              App Testing
            </button>
            {isSandboxCampaign && (
              <button
                type="button"
                onClick={fillSandboxDefaults}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-xs font-semibold transition flex items-center gap-1.5"
              >
                <FlaskConical className="w-3.5 h-3.5" />
                QA Sandbox
              </button>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: FORM VIEW */}
      {activeTab === 'FORM' && (
        <form onSubmit={handleSubmit} className="rounded-2xl border border-obsidian-700 bg-obsidian-900 p-6 md:p-8 space-y-7 glass-panel">
          {/* SECTION 1: CORE METADATA */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-obsidian-750 pb-2.5">
              <Layers className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                1. Campaign & Task Type
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Parent Advertiser Campaign *
                </label>
                <select
                  required
                  value={campaignId}
                  onChange={(e) => {
                    setCampaignId(e.target.value);
                    clearFieldError('campaignId');
                  }}
                  disabled={isEdit}
                  className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none transition disabled:opacity-50"
                >
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.isSandbox ? `[SANDBOX] ${c.name} — ${c.advertiserName}` : `${c.name} — ${c.advertiserName}`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Visual Task Type Selector */}
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Task Type *
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setCategory('ARTICLE_READ');
                      setVerificationMethod('FIRST_PARTY_ACTION');
                      clearFieldError('category');
                    }}
                    className={`p-3.5 rounded-xl border text-left transition flex items-start gap-3 ${
                      category === 'ARTICLE_READ'
                        ? 'border-emerald-500 bg-emerald-950/30 ring-1 ring-emerald-500/50'
                        : 'border-obsidian-700 bg-obsidian-850 hover:border-obsidian-600'
                    }`}
                  >
                    <BookOpen className={`w-5 h-5 shrink-0 mt-0.5 ${category === 'ARTICLE_READ' ? 'text-emerald-400' : 'text-slate-400'}`} />
                    <div>
                      <div className="text-xs font-bold text-white">Educational Article</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">In-app reading with dwell time & verification quiz.</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCategory('VIDEO_WATCH');
                      setVerificationMethod('FIRST_PARTY_ACTION');
                      clearFieldError('category');
                    }}
                    className={`p-3.5 rounded-xl border text-left transition flex items-start gap-3 ${
                      category === 'VIDEO_WATCH'
                        ? 'border-amber-500 bg-amber-950/30 ring-1 ring-amber-500/50'
                        : 'border-obsidian-700 bg-obsidian-850 hover:border-obsidian-600'
                    }`}
                  >
                    <Video className={`w-5 h-5 shrink-0 mt-0.5 ${category === 'VIDEO_WATCH' ? 'text-amber-400' : 'text-slate-400'}`} />
                    <div>
                      <div className="text-xs font-bold text-white">Direct Video</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">MP4/HLS video with player telemetry & quiz.</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCategory('YOUTUBE_LEARNING');
                      setVerificationMethod('FIRST_PARTY_ACTION');
                      clearFieldError('category');
                    }}
                    className={`p-3.5 rounded-xl border text-left transition flex items-start gap-3 ${
                      category === 'YOUTUBE_LEARNING'
                        ? 'border-rose-500 bg-rose-950/30 ring-1 ring-rose-500/50'
                        : 'border-obsidian-700 bg-obsidian-850 hover:border-obsidian-600'
                    }`}
                  >
                    <Play className={`w-5 h-5 shrink-0 mt-0.5 ${category === 'YOUTUBE_LEARNING' ? 'text-rose-400' : 'text-slate-400'}`} />
                    <div>
                      <div className="text-xs font-bold text-white">YouTube Learning</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">Authorized player with session timer & quiz.</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCategory('APP_INSTALL');
                      setVerificationMethod('FIRST_PARTY_ACTION');
                      clearFieldError('category');
                    }}
                    className={`p-3.5 rounded-xl border text-left transition flex items-start gap-3 ${
                      category === 'APP_INSTALL'
                        ? 'border-cyan-500 bg-cyan-950/30 ring-1 ring-cyan-500/50'
                        : 'border-obsidian-700 bg-obsidian-850 hover:border-obsidian-600'
                    }`}
                  >
                    <Download className={`w-5 h-5 shrink-0 mt-0.5 ${category === 'APP_INSTALL' ? 'text-cyan-400' : 'text-slate-400'}`} />
                    <div>
                      <div className="text-xs font-bold text-white">App Testing & Feedback</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">Voluntary Play Store test & in-app feedback submission.</div>
                    </div>
                  </button>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Task Card Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Understanding UPI & Safe Digital Payments"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    clearFieldError('title');
                  }}
                  className={`w-full rounded-xl border ${
                    fieldErrors.title ? 'border-rose-500' : 'border-obsidian-600'
                  } bg-obsidian-800/80 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition`}
                />
                {fieldErrors.title && <p className="mt-1 text-xs text-rose-400 font-medium">{fieldErrors.title}</p>}
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Short Description (Shown on Mobile Task Cards)
                </label>
                <textarea
                  rows={2}
                  placeholder="Brief 1-2 sentence overview shown on task cards..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Earner Step-by-Step Instructions
                </label>
                <textarea
                  rows={2}
                  placeholder="1. Read the article for 30s. 2. Scroll to bottom. 3. Answer comprehension question..."
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition"
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: ARTICLE READING SPECIFICATION (when category === 'ARTICLE_READ') */}
          {category === 'ARTICLE_READ' && (
            <div className="space-y-4 pt-4 border-t border-obsidian-750">
              <div className="flex items-center justify-between border-b border-obsidian-750 pb-2.5">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-cyan-400" />
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                    2. Article Content & Reading Verification
                  </h2>
                </div>
                <span className="text-xs text-cyan-400 font-mono">Server-Verified Dwell & Scroll</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Article Headline / Title
                  </label>
                  <input
                    type="text"
                    placeholder="Defaults to task title if omitted..."
                    value={articleTitle}
                    onChange={(e) => {
                      setArticleTitle(e.target.value);
                      clearFieldError('articleTitle');
                    }}
                    className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition"
                  />
                  {fieldErrors.articleTitle && <p className="mt-1 text-xs text-rose-400 font-medium">{fieldErrors.articleTitle}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Minimum Reading Duration (Seconds) *
                  </label>
                  <div className="space-y-2">
                    <input
                      type="number"
                      required
                      min={5}
                      max={1800}
                      value={minReadDurationSeconds}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 5;
                        setMinReadDurationSeconds(val);
                        setDwellTimeSeconds(val);
                        clearFieldError('minReadDurationSeconds');
                      }}
                      className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none transition"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">Presets:</span>
                      {[15, 30, 45, 60, 120].map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => {
                            setMinReadDurationSeconds(sec);
                            setDwellTimeSeconds(sec);
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition ${
                            minReadDurationSeconds === sec
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-obsidian-800 text-slate-400 border-obsidian-700 hover:text-white'
                          }`}
                        >
                          {sec}s
                        </button>
                      ))}
                    </div>
                  </div>
                  {fieldErrors.minReadDurationSeconds && (
                    <p className="mt-1 text-xs text-rose-400 font-medium">{fieldErrors.minReadDurationSeconds}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Minimum Scroll Depth (%) *
                  </label>
                  <div className="space-y-2">
                    <input
                      type="number"
                      required
                      min={1}
                      max={100}
                      value={minScrollPercentage}
                      onChange={(e) => setMinScrollPercentage(parseInt(e.target.value, 10) || 80)}
                      className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none transition"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">Presets:</span>
                      {[50, 75, 80, 90, 100].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setMinScrollPercentage(pct)}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition ${
                            minScrollPercentage === pct
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-obsidian-800 text-slate-400 border-obsidian-700 hover:text-white'
                          }`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Article Full Content *
                    </label>
                    <span className="text-[11px] font-mono text-slate-400">
                      {articleContent.length.toLocaleString()} characters · ~{articleContent.trim() ? articleContent.trim().split(/\s+/).length : 0} words
                    </span>
                  </div>
                  <textarea
                    rows={8}
                    required
                    placeholder="Enter the full article body text. Separate paragraphs with double line breaks..."
                    value={articleContent}
                    onChange={(e) => {
                      setArticleContent(e.target.value);
                      clearFieldError('articleContent');
                    }}
                    className={`w-full rounded-xl border ${
                      fieldErrors.articleContent ? 'border-rose-500' : 'border-obsidian-600'
                    } bg-obsidian-800/80 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition font-sans leading-relaxed`}
                  />
                  {fieldErrors.articleContent && (
                    <p className="mt-1 text-xs text-rose-400 font-medium">{fieldErrors.articleContent}</p>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    External Source Reference URL (Optional)
                  </label>
                  <input
                    type="url"
                    placeholder="https://example.com/source-reference (optional citation)"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition"
                  />
                </div>
              </div>

              {/* COMPREHENSION QUIZ CARD */}
              <div className="mt-4 p-5 rounded-xl border border-obsidian-700 bg-obsidian-800/50 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <HelpCircle className="w-4 h-4 text-amber-400" />
                    <div>
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                        Comprehension Verification Quiz
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Single multiple-choice question to confirm genuine reading before reward claim.
                      </p>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-300">
                    <input
                      type="checkbox"
                      checked={enableQuiz}
                      onChange={(e) => setEnableQuiz(e.target.checked)}
                      className="w-4 h-4 rounded border-obsidian-600 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span>Require Quiz</span>
                  </label>
                </div>

                {enableQuiz && (
                  <div className="space-y-4 pt-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Question *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. When should you enter your UPI PIN on your phone?"
                        value={quizQuestion}
                        onChange={(e) => {
                          setQuizQuestion(e.target.value);
                          clearFieldError('quizQuestion');
                        }}
                        className={`w-full rounded-xl border ${
                          fieldErrors.quizQuestion ? 'border-rose-500' : 'border-obsidian-600'
                        } bg-obsidian-900 px-4 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none transition`}
                      />
                      {fieldErrors.quizQuestion && (
                        <p className="mt-1 text-xs text-rose-400 font-medium">{fieldErrors.quizQuestion}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Answer Options (Select the single radio button next to the correct answer) *
                      </label>
                      <div className="space-y-2">
                        {quizOptions.map((opt, idx) => (
                          <div
                            key={idx}
                            className={`flex items-center gap-3 p-2.5 rounded-xl border transition ${
                              quizCorrectOptionIndex === idx
                                ? 'border-emerald-500/50 bg-emerald-950/20'
                                : 'border-obsidian-700 bg-obsidian-900'
                            }`}
                          >
                            <input
                              type="radio"
                              name="correctOption"
                              checked={quizCorrectOptionIndex === idx}
                              onChange={() => {
                                setQuizCorrectOptionIndex(idx);
                                clearFieldError('quizCorrectOptionIndex');
                              }}
                              className="w-4 h-4 text-emerald-500 focus:ring-emerald-500"
                              title="Mark as correct option"
                            />
                            <span className="text-xs font-bold text-slate-400 w-5">
                              {String.fromCharCode(65 + idx)}:
                            </span>
                            <input
                              type="text"
                              value={opt}
                              onChange={(e) => handleOptionChange(idx, e.target.value)}
                              placeholder={`Option ${String.fromCharCode(65 + idx)} text...`}
                              className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
                            />
                            {quizCorrectOptionIndex === idx && (
                              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                                Correct Answer
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                      {fieldErrors.quizOptions && (
                        <p className="mt-1 text-xs text-rose-400 font-medium">{fieldErrors.quizOptions}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECTION 2: VIDEO LEARNING SPECIFICATION (when category === 'VIDEO_WATCH') */}
          {category === 'VIDEO_WATCH' && (
            <div className="space-y-4 pt-4 border-t border-obsidian-750">
              <div className="flex items-center justify-between border-b border-obsidian-750 pb-2.5">
                <div className="flex items-center gap-2">
                  <Video className="w-4 h-4 text-amber-400" />
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                    2. Video Learning & Verification
                  </h2>
                </div>
                <span className="text-xs text-amber-400 font-mono">Server-Verified Playback</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Direct Video Stream URL (MP4 / HLS / WebM) *
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://example.com/videos/educational-lesson.mp4"
                    value={videoUrl}
                    onChange={(e) => {
                      setVideoUrl(e.target.value);
                      clearFieldError('videoUrl');
                    }}
                    className={`w-full rounded-xl border ${
                      fieldErrors.videoUrl ? 'border-rose-500' : 'border-obsidian-600'
                    } bg-obsidian-800/80 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition`}
                  />
                  {fieldErrors.videoUrl && (
                    <p className="mt-1 text-xs text-rose-400 font-medium">{fieldErrors.videoUrl}</p>
                  )}
                  <p className="mt-1 text-[11px] text-slate-400">
                    Direct video media file. Anti-skipping and foreground playback tracking are enforced by the server.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Video Total Duration (Seconds) *
                  </label>
                  <input
                    type="number"
                    required
                    min={5}
                    value={videoDuration}
                    onChange={(e) => {
                      const dur = parseInt(e.target.value, 10) || 30;
                      setVideoDuration(dur);
                      clearFieldError('videoDuration');
                    }}
                    className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none transition"
                  />
                  {fieldErrors.videoDuration && (
                    <p className="mt-1 text-xs text-rose-400 font-medium">{fieldErrors.videoDuration}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Required Watch Duration (Seconds) *
                  </label>
                  <input
                    type="number"
                    required
                    min={5}
                    max={videoDuration}
                    value={requiredWatchSeconds}
                    onChange={(e) => {
                      const req = parseInt(e.target.value, 10) || 15;
                      setRequiredWatchSeconds(req);
                      setDwellTimeSeconds(req);
                      clearFieldError('requiredWatchSeconds');
                    }}
                    className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none transition"
                  />
                  {fieldErrors.requiredWatchSeconds && (
                    <p className="mt-1 text-xs text-rose-400 font-medium">{fieldErrors.requiredWatchSeconds}</p>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Completion Policy
                  </label>
                  <select
                    value={videoCompletionPolicy}
                    onChange={(e) => setVideoCompletionPolicy(e.target.value as any)}
                    className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none transition"
                  >
                    <option value="MINIMUM_DURATION">
                      MINIMUM_DURATION — Earner must watch at least {requiredWatchSeconds}s
                    </option>
                    <option value="FULL_VIDEO">
                      FULL_VIDEO — Earner must watch the full video to the natural end
                    </option>
                  </select>
                </div>
              </div>

              {/* VIDEO QUIZ CARD */}
              <div className="mt-4 p-5 rounded-xl border border-obsidian-700 bg-obsidian-800/50 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <HelpCircle className="w-4 h-4 text-amber-400" />
                    <div>
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                        Learning Verification Question
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Single simple multiple-choice question to confirm genuine viewing before reward claim.
                      </p>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-300">
                    <input
                      type="checkbox"
                      checked={enableVideoQuiz}
                      onChange={(e) => setEnableVideoQuiz(e.target.checked)}
                      className="w-4 h-4 rounded border-obsidian-600 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span>Require Question</span>
                  </label>
                </div>

                {enableVideoQuiz && (
                  <div className="space-y-4 pt-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Question *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. What should you verify before confirming a digital payment?"
                        value={videoQuizQuestion}
                        onChange={(e) => {
                          setVideoQuizQuestion(e.target.value);
                          clearFieldError('videoQuizQuestion');
                        }}
                        className={`w-full rounded-xl border ${
                          fieldErrors.videoQuizQuestion ? 'border-rose-500' : 'border-obsidian-600'
                        } bg-obsidian-900 px-4 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none transition`}
                      />
                      {fieldErrors.videoQuizQuestion && (
                        <p className="mt-1 text-xs text-rose-400 font-medium">{fieldErrors.videoQuizQuestion}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Answer Options (Select the single radio button next to the correct answer) *
                      </label>
                      <div className="space-y-2">
                        {videoQuizOptions.map((opt, idx) => (
                          <div
                            key={idx}
                            className={`flex items-center gap-3 p-2.5 rounded-xl border transition ${
                              videoQuizCorrectOptionIndex === idx
                                ? 'border-amber-500/50 bg-amber-950/20'
                                : 'border-obsidian-700 bg-obsidian-900'
                            }`}
                          >
                            <input
                              type="radio"
                              name="videoCorrectOption"
                              checked={videoQuizCorrectOptionIndex === idx}
                              onChange={() => {
                                setVideoQuizCorrectOptionIndex(idx);
                                clearFieldError('videoQuizCorrectOptionIndex');
                              }}
                              className="w-4 h-4 text-amber-500 focus:ring-amber-500"
                              title="Mark as correct option"
                            />
                            <span className="text-xs font-bold text-slate-400 w-5">
                              {String.fromCharCode(65 + idx)}:
                            </span>
                            <input
                              type="text"
                              value={opt}
                              onChange={(e) => handleVideoOptionChange(idx, e.target.value)}
                              placeholder={`Option ${String.fromCharCode(65 + idx)} text...`}
                              className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
                            />
                            {videoQuizCorrectOptionIndex === idx && (
                              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                                Correct Answer
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                      {fieldErrors.videoQuizOptions && (
                        <p className="mt-1 text-xs text-rose-400 font-medium">{fieldErrors.videoQuizOptions}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECTION 2: YOUTUBE LEARNING SPECIFICATION (when category === 'YOUTUBE_LEARNING') */}
          {category === 'YOUTUBE_LEARNING' && (
            <div className="space-y-4 pt-4 border-t border-obsidian-750">
              <div className="flex items-center justify-between border-b border-obsidian-750 pb-2.5">
                <div className="flex items-center gap-2">
                  <Play className="w-4 h-4 text-rose-400" />
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                    2. YouTube Video Learning & Verification
                  </h2>
                </div>
                <span className="text-xs text-rose-400 font-mono">Authorized Embed · Quiz Verified</span>
              </div>

              {/* YouTube Compliance Notice */}
              <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-3.5 text-xs text-rose-200 flex items-start gap-3">
                <ShieldCheck className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <div className="leading-relaxed">
                  <strong>Policy Compliance & Integrity:</strong> In strict compliance with Google Play and YouTube Terms of Service, rewards are granted exclusively for educational session participation and server-verified comprehension quiz answers. ADPAYON does <strong>NOT</strong> award rewards for inflating YouTube view counts, watch time, likes, or subscriptions.
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      YouTube Video URL *
                    </label>
                    {youtubeUrl.trim() && (
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        {extractYouTubeId(youtubeUrl.trim())
                          ? `Extracted Video ID: ${extractYouTubeId(youtubeUrl.trim())}`
                          : 'Invalid YouTube URL'}
                      </span>
                    )}
                  </div>
                  <input
                    type="url"
                    required
                    placeholder="https://www.youtube.com/watch?v=VIDEO_ID or https://youtu.be/VIDEO_ID"
                    value={youtubeUrl}
                    onChange={(e) => {
                      setYoutubeUrl(e.target.value);
                      clearFieldError('youtubeUrl');
                    }}
                    className={`w-full rounded-xl border ${
                      fieldErrors.youtubeUrl ? 'border-rose-500' : 'border-obsidian-600'
                    } bg-obsidian-800/80 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition`}
                  />
                  {fieldErrors.youtubeUrl && (
                    <p className="mt-1 text-xs text-rose-400 font-medium">{fieldErrors.youtubeUrl}</p>
                  )}
                  <p className="mt-1 text-[11px] text-slate-400">
                    Enter any valid standard YouTube URL or shortened link. The 11-character video ID is automatically extracted.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Educational Session Duration (Seconds) *
                  </label>
                  <div className="space-y-2">
                    <input
                      type="number"
                      required
                      min={10}
                      max={1800}
                      value={youtubeSessionDuration}
                      onChange={(e) => {
                        const dur = parseInt(e.target.value, 10) || 60;
                        setYoutubeSessionDuration(dur);
                        setDwellTimeSeconds(dur);
                        clearFieldError('youtubeSessionDuration');
                      }}
                      className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none transition"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">Presets:</span>
                      {[30, 45, 60, 90, 120].map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => {
                            setYoutubeSessionDuration(sec);
                            setDwellTimeSeconds(sec);
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition ${
                            youtubeSessionDuration === sec
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                              : 'bg-obsidian-800 text-slate-400 border-obsidian-700 hover:text-white'
                          }`}
                        >
                          {sec}s
                        </button>
                      ))}
                    </div>
                  </div>
                  {fieldErrors.youtubeSessionDuration && (
                    <p className="mt-1 text-xs text-rose-400 font-medium">{fieldErrors.youtubeSessionDuration}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Verification Method
                  </label>
                  <div className="p-3 rounded-xl border border-obsidian-700 bg-obsidian-800/60 text-xs text-slate-300">
                    <div className="font-semibold text-white">Authorized Embed + Quiz Mastery</div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Learners view content via official player and must answer the comprehension question correctly.
                    </div>
                  </div>
                </div>
              </div>

              {/* YOUTUBE COMPREHENSION QUIZ */}
              <div className="mt-4 p-5 rounded-xl border border-obsidian-700 bg-obsidian-800/50 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <HelpCircle className="w-4 h-4 text-rose-400" />
                    <div>
                      <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                        Learning Comprehension Question
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Single verification question evaluated by the backend to confirm active learning before rewards are credited.
                      </p>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-300">
                    <input
                      type="checkbox"
                      checked={enableYouTubeQuiz}
                      onChange={(e) => setEnableYouTubeQuiz(e.target.checked)}
                      className="w-4 h-4 rounded border-obsidian-600 text-rose-500 focus:ring-rose-500"
                    />
                    <span>Require Quiz</span>
                  </label>
                </div>

                {enableYouTubeQuiz && (
                  <div className="space-y-4 pt-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Question *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. What is the safest action when an unknown caller asks for your OTP?"
                        value={youtubeQuizQuestion}
                        onChange={(e) => {
                          setYoutubeQuizQuestion(e.target.value);
                          clearFieldError('youtubeQuizQuestion');
                        }}
                        className={`w-full rounded-xl border ${
                          fieldErrors.youtubeQuizQuestion ? 'border-rose-500' : 'border-obsidian-600'
                        } bg-obsidian-900 px-4 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none transition`}
                      />
                      {fieldErrors.youtubeQuizQuestion && (
                        <p className="mt-1 text-xs text-rose-400 font-medium">{fieldErrors.youtubeQuizQuestion}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Answer Options (Select the single radio button next to the correct answer) *
                      </label>
                      <div className="space-y-2">
                        {youtubeQuizOptions.map((opt, idx) => (
                          <div
                            key={idx}
                            className={`flex items-center gap-3 p-2.5 rounded-xl border transition ${
                              youtubeQuizCorrectOptionIndex === idx
                                ? 'border-rose-500/50 bg-rose-950/20'
                                : 'border-obsidian-700 bg-obsidian-900'
                            }`}
                          >
                            <input
                              type="radio"
                              name="ytCorrectOption"
                              checked={youtubeQuizCorrectOptionIndex === idx}
                              onChange={() => {
                                setYoutubeQuizCorrectOptionIndex(idx);
                                clearFieldError('youtubeQuizCorrectOptionIndex');
                              }}
                              className="w-4 h-4 text-rose-500 focus:ring-rose-500"
                              title="Mark as correct option"
                            />
                            <span className="text-xs font-bold text-slate-400 w-5">
                              {String.fromCharCode(65 + idx)}:
                            </span>
                            <input
                              type="text"
                              value={opt}
                              onChange={(e) => handleYouTubeOptionChange(idx, e.target.value)}
                              placeholder={`Option ${String.fromCharCode(65 + idx)} text...`}
                              className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
                            />
                            {youtubeQuizCorrectOptionIndex === idx && (
                              <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/30">
                                Correct Answer
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                      {fieldErrors.youtubeQuizOptions && (
                        <p className="mt-1 text-xs text-rose-400 font-medium">{fieldErrors.youtubeQuizOptions}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECTION 2: APP TESTING & FEEDBACK SPECIFICATION (when category === 'APP_INSTALL' or 'APP_TESTING') */}
          {(category === 'APP_INSTALL' || category === 'APP_TESTING') && (
            <div className="space-y-4 pt-4 border-t border-obsidian-750">
              <div className="flex items-center justify-between border-b border-obsidian-750 pb-2.5">
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-cyan-400" />
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                    2. App Testing & In-App Feedback
                  </h2>
                </div>
                <span className="text-xs text-cyan-400 font-mono">Voluntary Testing & Feedback</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    App Display Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. BudgetPlanner Mobile"
                    value={appName}
                    onChange={(e) => setAppName(e.target.value)}
                    className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Android Package Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="com.example.app"
                    value={packageName}
                    onChange={(e) => {
                      setPackageName(e.target.value);
                      clearFieldError('packageName');
                    }}
                    className={`w-full rounded-xl border ${
                      fieldErrors.packageName ? 'border-rose-500' : 'border-obsidian-600'
                    } bg-obsidian-800/80 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition`}
                  />
                  {fieldErrors.packageName && (
                    <p className="mt-1 text-xs text-rose-400 font-medium">{fieldErrors.packageName}</p>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Google Play Store URL (Optional)
                  </label>
                  <input
                    type="url"
                    placeholder="https://play.google.com/store/apps/details?id=com.example.app"
                    value={storeUrl}
                    onChange={(e) => handleStoreUrlChange(e.target.value)}
                    className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    Earners tap a clear button to open the store page and voluntarily try the app.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Conversion Mode *
                  </label>
                  <select
                    value={conversionEvent}
                    onChange={(e) => {
                      const val = e.target.value as any;
                      setConversionEvent(val);
                      if (val === 'INSTALL_ONLY') {
                        setAppAttributionMethod('CLIENT_PACKAGE_PRESENCE');
                      }
                    }}
                    className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none transition"
                  >
                    <option value="INSTALL_ONLY">
                      INSTALL_ONLY — Store visit &amp; return package check (No partner callback)
                    </option>
                    <option value="FIRST_OPEN">
                      FIRST_OPEN — Launch &amp; voluntary testing with feedback
                    </option>
                    <option value="INSTALL">
                      INSTALL — General app install
                    </option>
                    <option value="REGISTER">
                      REGISTER — Registration in partner app
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Attribution &amp; Verification Method *
                  </label>
                  <select
                    value={appAttributionMethod}
                    onChange={(e) => setAppAttributionMethod(e.target.value as any)}
                    className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none transition"
                  >
                    <option value="CLIENT_PACKAGE_PRESENCE">
                      CLIENT_PACKAGE_PRESENCE — Automatic presence verification on return
                    </option>
                    <option value="IN_APP_FEEDBACK">
                      IN_APP_FEEDBACK — Immediate verification upon in-app UX feedback
                    </option>
                    <option value="MANUAL_REVIEW">
                      MANUAL_REVIEW — Requires Admin approval queue review before points release
                    </option>
                  </select>
                </div>

                {conversionEvent === 'INSTALL_ONLY' || appAttributionMethod === 'CLIENT_PACKAGE_PRESENCE' ? (
                  <div className="md:col-span-2 rounded-xl bg-cyan-950/40 border border-cyan-800/50 p-4 text-xs text-cyan-200">
                    <p className="font-semibold text-cyan-300 mb-1">
                      ✓ INSTALL_ONLY &amp; CLIENT_PACKAGE_PRESENCE Mode Active
                    </p>
                    <p className="text-slate-300">
                      Users tap the Play Store button to install the app. Upon returning to ADPAYON, installation is verified automatically via native package presence check. No partner postback, dwell testing timer, or feedback questions are required.
                    </p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                        Required Testing Duration (Seconds) *
                      </label>
                      <div className="space-y-2">
                        <input
                          type="number"
                          required
                          min={10}
                          max={1800}
                          value={requiredTestingSeconds}
                          onChange={(e) => {
                            const s = parseInt(e.target.value, 10) || 60;
                            setRequiredTestingSeconds(s);
                            setDwellTimeSeconds(s);
                          }}
                          className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none transition"
                        />
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400">Presets:</span>
                          {[30, 60, 120, 300].map((sec) => (
                            <button
                              key={sec}
                              type="button"
                              onClick={() => {
                                setRequiredTestingSeconds(sec);
                                setDwellTimeSeconds(sec);
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition ${
                                requiredTestingSeconds === sec
                                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                                  : 'bg-obsidian-800 text-slate-400 border-obsidian-700 hover:text-white'
                              }`}
                            >
                              {sec}s
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                        Partner / Test Completion Code (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. PARTNER-BETA-2026 (Optional code generated inside partner app)"
                        value={completionCode}
                        onChange={(e) => setCompletionCode(e.target.value)}
                        className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition font-mono text-xs"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                        Simple Testing Steps for Earners
                      </label>
                      <textarea
                        rows={3}
                        placeholder="1. Open app and explore the main dashboard.&#10;2. Check text legibility and response speed.&#10;3. Return to ADPAYON to submit feedback."
                        value={testingSteps}
                        onChange={(e) => setTestingSteps(e.target.value)}
                        className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                        Feedback Prompt Question
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. How easy was it to navigate the main budget overview?"
                        value={feedbackQuestion}
                        onChange={(e) => setFeedbackQuestion(e.target.value)}
                        className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none transition"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* SECTION 3: REWARDS, CAPS & EXPIRATION */}
          <div className="space-y-4 pt-4 border-t border-obsidian-750">
            <div className="flex items-center gap-2 border-b border-obsidian-750 pb-2.5">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                3. Rewards, Limits & Expiry
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Promotional Reward Points *
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-amber-400">
                    <Sparkles className="w-4 h-4" />
                  </span>
                  <input
                    type="number"
                    required
                    min={1}
                    value={rewardPoints}
                    onChange={(e) => setRewardPoints(parseInt(e.target.value, 10) || 1)}
                    className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 pl-9 pr-4 py-2.5 text-sm font-bold text-amber-300 focus:border-emerald-500 focus:outline-none transition"
                  />
                </div>
                <p className="mt-1 text-[10px] text-slate-400">Non-withdrawable promotional credit.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Global Completion Cap *
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={totalCap}
                  onChange={(e) => setTotalCap(parseInt(e.target.value, 10) || 1)}
                  className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none transition"
                />
                <p className="mt-1 text-[10px] text-slate-400">Total verified claims allowed globally.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Task Expiration Date & Time (Optional)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400">
                    <Calendar className="w-4 h-4" />
                  </span>
                  <input
                    type="datetime-local"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 pl-9 pr-4 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none transition"
                  />
                </div>
                <p className="mt-1 text-[10px] text-slate-400">
                  When passed, automatically halts and rejects attempts.
                </p>
              </div>
            </div>
          </div>

          {/* SECTION 4: ADVANCED SETTINGS & TARGETING (OPTIONAL COLLAPSIBLE) */}
          <details className="group rounded-xl border border-obsidian-750 bg-obsidian-850/40 p-5 transition">
            <summary className="flex items-center justify-between cursor-pointer list-none text-xs font-bold text-slate-300 uppercase tracking-wider select-none">
              <div className="flex items-center gap-2.5">
                <Target className="w-4 h-4 text-purple-400" />
                <span>4. Advanced Targeting & Caps (Optional)</span>
              </div>
              <span className="text-slate-400 text-xs font-mono group-open:rotate-180 transition-transform">▼</span>
            </summary>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 mt-4 border-t border-obsidian-750">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Daily Cap Per User
                </label>
                <input
                  type="number"
                  min={1}
                  value={dailyCapPerUser}
                  onChange={(e) => setDailyCapPerUser(parseInt(e.target.value, 10) || 1)}
                  className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2 text-sm text-white focus:border-purple-500 focus:outline-none transition"
                />
                <p className="mt-1 text-[11px] text-slate-400">Maximum times an individual earner can complete daily.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Assigned Specific User IDs
                </label>
                <input
                  type="text"
                  placeholder="e.g. 64aef..., 64bf2... (comma-separated)"
                  value={assignedUserIdsText}
                  onChange={(e) => setAssignedUserIdsText(e.target.value)}
                  className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2 text-sm text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none transition font-mono text-xs"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Leave blank for all users. When set, restricts task to designated user IDs.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Eligible User Groups
                </label>
                <input
                  type="text"
                  placeholder="e.g. BETA_TESTERS, VERIFIED_EARNERS"
                  value={userGroupsText}
                  onChange={(e) => setUserGroupsText(e.target.value)}
                  className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2 text-sm text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none transition text-xs"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  Cohort restriction for specialized test campaigns.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Minimum Referral Depth
                </label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={minAncestryDepth}
                  onChange={(e) => setMinAncestryDepth(parseInt(e.target.value, 10) || 0)}
                  className="w-full rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2 text-sm text-white focus:border-purple-500 focus:outline-none transition text-xs"
                />
                <p className="mt-1 text-[11px] text-slate-400">0 = No network restriction.</p>
              </div>

              <div className="md:col-span-2 flex items-center gap-3 p-3.5 rounded-xl border border-obsidian-700 bg-obsidian-800/50">
                <input
                  type="checkbox"
                  id="kycReq"
                  checked={kycRequired}
                  onChange={(e) => setKycRequired(e.target.checked)}
                  className="w-4 h-4 rounded border-obsidian-600 text-purple-500 focus:ring-purple-500"
                />
                <label htmlFor="kycReq" className="text-xs text-slate-300 cursor-pointer">
                  <span className="font-bold text-white block">Require Strict KYC Verification</span>
                  <span>Earner must have completed official KYC verification before starting this task.</span>
                </label>
              </div>
            </div>
          </details>

          {/* DRAFT SAFETY NOTE */}
          <div className="rounded-xl border border-obsidian-700 bg-obsidian-800/50 p-4 text-xs text-slate-300 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
            <div className="leading-relaxed">
              <strong>Draft Lifecycle Safety:</strong> Tasks are created in <strong>DRAFT</strong> status. Incomplete tasks
              cannot be published. You can preview the mobile experience, edit anytime, and publish when ready.
            </div>
          </div>

          {/* BUTTONS */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-obsidian-750">
            <Link
              to="/tasks"
              className="rounded-xl border border-obsidian-600 bg-obsidian-800 px-5 py-2.5 text-xs font-semibold text-slate-300 hover:bg-obsidian-700 transition"
            >
              Cancel
            </Link>
            <button
              type="button"
              onClick={() => setActiveTab('PREVIEW')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-obsidian-600 bg-obsidian-800/80 px-4 py-2.5 text-xs font-semibold text-cyan-300 hover:bg-obsidian-700 transition"
            >
              <Eye className="w-4 h-4" />
              <span>Preview Mobile UX</span>
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-950/60 hover:from-emerald-500 hover:to-teal-400 disabled:opacity-50 transition"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{isEdit ? 'Save Changes' : 'Create Task in Draft'}</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB CONTENT: MOBILE EARNER PREVIEW VIEW */}
      {activeTab === 'PREVIEW' && (
        <div className="space-y-6">
          {/* Sub-tab switcher for preview: Feed Card vs In-App Reader */}
          <div className="flex items-center justify-between p-4 rounded-2xl border border-obsidian-700 bg-obsidian-900 glass-panel">
            <div>
              <h2 className="text-sm font-bold text-white">Interactive Mobile Experience Simulator</h2>
              <p className="text-xs text-slate-400">
                Preview how earners view this task on their Android devices before publishing.
              </p>
            </div>
            <div className="flex rounded-xl bg-obsidian-800 p-1 border border-obsidian-700">
              <button
                type="button"
                onClick={() => setPreviewSubTab('FEED_CARD')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  previewSubTab === 'FEED_CARD'
                    ? 'bg-emerald-500 text-obsidian-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Feed Card Preview
              </button>
              <button
                type="button"
                onClick={() => setPreviewSubTab('TASK_SCREEN')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  previewSubTab === 'TASK_SCREEN'
                    ? 'bg-emerald-500 text-obsidian-950 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {category === 'VIDEO_WATCH'
                  ? 'Video Player Screen'
                  : category === 'YOUTUBE_LEARNING'
                  ? 'YouTube Player Screen'
                  : category === 'APP_INSTALL' || category === 'APP_TESTING'
                  ? 'App Testing Screen'
                  : 'Article Reader Screen'}
              </button>
            </div>
          </div>

          {/* SIMULATED DEVICE FRAME */}
          <div className="max-w-sm mx-auto rounded-[36px] border-[6px] border-obsidian-700 bg-obsidian-950 p-4 shadow-2xl relative overflow-hidden text-slate-100">
            {/* Phone Speaker Notch */}
            <div className="w-24 h-4 bg-obsidian-800 rounded-full mx-auto mb-3" />

            {previewSubTab === 'FEED_CARD' ? (
              // 1. MOBILE FEED CARD PREVIEW
              <div className="space-y-4 py-2">
                <div className="text-center pb-2 border-b border-obsidian-800">
                  <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">
                    Earn Hub · Live Feed
                  </span>
                </div>

                <div className="rounded-2xl border border-obsidian-700 bg-obsidian-900/90 p-4 space-y-3 shadow-md">
                  {/* Card Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {category === 'VIDEO_WATCH' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Video Learning 🎥
                        </span>
                      ) : category === 'YOUTUBE_LEARNING' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          YouTube Learning 🎓
                        </span>
                      ) : category === 'APP_INSTALL' || category === 'APP_TESTING' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                          App Testing 📱
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Article Read 📰
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono text-slate-300 bg-obsidian-800 border border-obsidian-700">
                        {category === 'VIDEO_WATCH'
                          ? 'Watch & Learn'
                          : category === 'YOUTUBE_LEARNING'
                          ? 'Video Lesson'
                          : category === 'APP_INSTALL' || category === 'APP_TESTING'
                          ? 'Test & Feedback'
                          : 'Dwell Time'}
                      </span>
                    </div>
                    <div className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-bold">
                      +{rewardPoints} PTS
                    </div>
                  </div>

                  {/* Campaign Name & Title */}
                  <div>
                    <span className="text-[11px] font-medium text-slate-400 block">
                      {selectedCampaign ? selectedCampaign.name : 'Advertiser Campaign'}
                    </span>
                    <h3 className="text-sm font-bold text-white tracking-tight mt-0.5">
                      {title || 'Task Title'}
                    </h3>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-slate-300 line-clamp-2">
                    {description || instructions || 'Task overview displayed to mobile earners.'}
                  </p>

                  {/* Meta details */}
                  <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400 border-t border-obsidian-800">
                    <span className="flex items-center gap-1 text-slate-300 font-medium">
                      {category === 'VIDEO_WATCH'
                        ? `⏱ Watch ${requiredWatchSeconds}s`
                        : category === 'YOUTUBE_LEARNING'
                        ? `🎓 ${youtubeSessionDuration}s Learning Session`
                        : category === 'APP_INSTALL' || category === 'APP_TESTING'
                        ? `⭐ Rate & Feedback (${requiredTestingSeconds}s)`
                        : `📖 Read & Quiz (~${approxMinutes} min)`}
                    </span>
                    <span>🎯 0/{dailyCapPerUser} daily</span>
                  </div>

                  {/* Action Button */}
                  <button
                    type="button"
                    onClick={() => setPreviewSubTab('TASK_SCREEN')}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-bold text-xs shadow hover:from-emerald-500 hover:to-teal-400 transition"
                  >
                    {category === 'VIDEO_WATCH'
                      ? 'Watch Video ▶'
                      : category === 'YOUTUBE_LEARNING'
                      ? 'Start YouTube Lesson 🎓'
                      : category === 'APP_INSTALL' || category === 'APP_TESTING'
                      ? 'Test & Feedback 📱'
                      : 'Start Reading 📖'}
                  </button>
                </div>
              </div>
            ) : category === 'VIDEO_WATCH' ? (
              // 2. VIDEO WATCH TASK SIMULATOR
              <div className="space-y-3 py-1 max-h-[500px] overflow-y-auto pr-1">
                <div className="flex items-center justify-between pb-2 border-b border-obsidian-800">
                  <span className="text-xs text-slate-400 font-semibold">← Exit</span>
                  <span className="text-xs font-bold text-white truncate max-w-[160px]">
                    {title || 'Video Learning'}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                    {requiredWatchSeconds}s LEFT
                  </span>
                </div>

                {/* Simulated Video Player */}
                <div className="w-full aspect-video bg-black rounded-xl border border-obsidian-750 flex flex-col items-center justify-center relative overflow-hidden">
                  <Play className="w-10 h-10 text-white/80" />
                  <span className="text-[10px] text-slate-400 mt-2">Anti-seeking linear playback</span>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Watch Progress: 0s / {requiredWatchSeconds}s</span>
                    <span>100%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-obsidian-800 overflow-hidden">
                    <div className="h-full bg-amber-500 w-1/2" />
                  </div>
                </div>

                {/* Verification Question Card */}
                {enableVideoQuiz && (
                  <div className="p-3 rounded-xl border border-obsidian-700 bg-obsidian-900/95 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">
                      Verification Question
                    </span>
                    <p className="text-xs font-semibold text-white">
                      {videoQuizQuestion || 'Verification question here...'}
                    </p>
                    <div className="space-y-1">
                      {videoQuizOptions.map((opt, idx) => (
                        <div
                          key={idx}
                          className={`p-2 rounded-lg border text-[11px] flex items-center gap-2 ${
                            videoQuizCorrectOptionIndex === idx
                              ? 'border-amber-500/50 bg-amber-950/20 text-amber-300 font-medium'
                              : 'border-obsidian-800 bg-obsidian-950 text-slate-300'
                          }`}
                        >
                          <span className="w-4 font-bold text-slate-400">{String.fromCharCode(65 + idx)}.</span>
                          <span className="flex-1">{opt}</span>
                          {videoQuizCorrectOptionIndex === idx && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  disabled
                  className="w-full py-2.5 rounded-xl bg-emerald-600/50 text-white font-bold text-xs"
                >
                  Claim {rewardPoints} PTS
                </button>
              </div>
            ) : category === 'YOUTUBE_LEARNING' ? (
              // 2B. YOUTUBE LEARNING TASK SIMULATOR
              <div className="space-y-3 py-1 max-h-[500px] overflow-y-auto pr-1">
                <div className="flex items-center justify-between pb-2 border-b border-obsidian-800">
                  <span className="text-xs text-slate-400 font-semibold">← Exit</span>
                  <span className="text-xs font-bold text-white truncate max-w-[160px]">
                    {title || 'YouTube Video Learning'}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 font-mono">
                    {youtubeSessionDuration}s SESSION
                  </span>
                </div>

                {/* Simulated YouTube Embed Player */}
                <div className="w-full aspect-video bg-obsidian-950 rounded-xl border border-rose-500/30 flex flex-col items-center justify-center relative overflow-hidden p-3 text-center">
                  <div className="w-12 h-12 rounded-full bg-rose-600/20 border border-rose-500/40 flex items-center justify-center mb-2">
                    <Play className="w-6 h-6 text-rose-400 fill-rose-400/30 ml-0.5" />
                  </div>
                  <span className="text-xs font-bold text-white truncate max-w-[240px]">
                    {title || 'Educational Video'}
                  </span>
                  <span className="text-[10px] text-rose-300 font-mono mt-1">
                    YouTube ID: {extractYouTubeId(youtubeUrl.trim()) || 'dQw4w9WgXcQ'}
                  </span>
                </div>

                {/* Policy Notice */}
                <div className="p-2.5 rounded-lg border border-obsidian-750 bg-obsidian-900 text-[10px] text-slate-400 leading-relaxed">
                  <strong className="text-slate-300">Learning Notice:</strong> Watch and learn at your own pace. Rewards are credited solely for completing the educational quiz below.
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Session Timer: 0s / {youtubeSessionDuration}s</span>
                    <span>100%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-obsidian-800 overflow-hidden">
                    <div className="h-full bg-rose-500 w-1/2" />
                  </div>
                </div>

                {/* Verification Question Card */}
                {enableYouTubeQuiz && (
                  <div className="p-3 rounded-xl border border-obsidian-700 bg-obsidian-900/95 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 block">
                      Comprehension Quiz
                    </span>
                    <p className="text-xs font-semibold text-white">
                      {youtubeQuizQuestion || 'Comprehension question here...'}
                    </p>
                    <div className="space-y-1">
                      {youtubeQuizOptions.map((opt, idx) => (
                        <div
                          key={idx}
                          className={`p-2 rounded-lg border text-[11px] flex items-center gap-2 ${
                            youtubeQuizCorrectOptionIndex === idx
                              ? 'border-rose-500/50 bg-rose-950/20 text-rose-300 font-medium'
                              : 'border-obsidian-800 bg-obsidian-950 text-slate-300'
                          }`}
                        >
                          <span className="w-4 font-bold text-slate-400">{String.fromCharCode(65 + idx)}.</span>
                          <span className="flex-1">{opt}</span>
                          {youtubeQuizCorrectOptionIndex === idx && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  disabled
                  className="w-full py-2.5 rounded-xl bg-emerald-600/50 text-white font-bold text-xs"
                >
                  Submit Quiz & Claim {rewardPoints} PTS
                </button>
              </div>
            ) : (category === 'APP_INSTALL' || category === 'APP_TESTING') ? (
              // 3. APP TESTING & FEEDBACK SIMULATOR
              <div className="space-y-3 py-1 max-h-[500px] overflow-y-auto pr-1">
                <div className="flex items-center justify-between pb-2 border-b border-obsidian-800">
                  <span className="text-xs text-slate-400 font-semibold">← Exit</span>
                  <span className="text-xs font-bold text-white truncate max-w-[160px]">
                    {appName || title || 'App Testing'}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                    TESTING
                  </span>
                </div>

                {/* App Card */}
                <div className="p-3.5 rounded-xl border border-obsidian-750 bg-obsidian-900 space-y-2">
                  <h4 className="text-xs font-bold text-white">{appName || 'App Name'}</h4>
                  <p className="text-[11px] text-slate-400 font-mono">{packageName || 'com.example.app'}</p>
                  <button
                    type="button"
                    className="w-full py-2 rounded-lg bg-obsidian-800 border border-obsidian-700 text-cyan-300 text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <span>Open in Google Play</span>
                  </button>
                </div>

                {/* Testing Steps */}
                <div className="p-3.5 rounded-xl border border-obsidian-750 bg-obsidian-900 space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Testing Steps
                  </span>
                  <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed">
                    {testingSteps || '1. Try main screens.\n2. Note usability.\n3. Return to submit feedback.'}
                  </p>
                </div>

                {/* Feedback Submission Card */}
                <div className="p-3.5 rounded-xl border border-obsidian-700 bg-obsidian-900 space-y-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 block">
                    Your Testing Feedback
                  </span>
                  <p className="text-xs font-semibold text-white">
                    {feedbackQuestion || 'How was your experience testing the app?'}
                  </p>
                  <div className="flex items-center gap-2 justify-center py-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star key={star} className="w-5 h-5 text-amber-400 fill-amber-400" />
                    ))}
                  </div>
                  <textarea
                    rows={2}
                    readOnly
                    placeholder="Earner enters honest feedback here..."
                    className="w-full rounded-lg border border-obsidian-800 bg-obsidian-950 p-2 text-xs text-slate-400"
                  />
                  <button
                    type="button"
                    disabled
                    className="w-full py-2 rounded-lg bg-emerald-600/50 text-white font-bold text-xs"
                  >
                    Submit Feedback & Claim {rewardPoints} PTS
                  </button>
                </div>
              </div>
            ) : (
              // 4. IN-APP ARTICLE READER PREVIEW
              <div className="space-y-3 py-1 max-h-[500px] overflow-y-auto pr-1">
                {/* Header */}
                <div className="flex items-center justify-between pb-2 border-b border-obsidian-800">
                  <span className="text-xs text-slate-400 font-semibold">← Exit</span>
                  <span className="text-xs font-bold text-white truncate max-w-[160px]">
                    {effectiveArticleTitle}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                    {effectiveDuration}s LEFT
                  </span>
                </div>

                {/* Progress bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Time: 0s / {effectiveDuration}s</span>
                    <span>Scroll: 0% / {minScrollPercentage}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-obsidian-800 overflow-hidden">
                    <div className="h-full bg-emerald-500 w-1/3" />
                  </div>
                </div>

                {/* Article Headline */}
                <h2 className="text-base font-bold text-white leading-snug pt-1">
                  {effectiveArticleTitle}
                </h2>

                {/* Paragraphs */}
                <div className="space-y-2 text-xs text-slate-300 leading-relaxed font-sans">
                  {articleParagraphs.map((p, idx) => (
                    <p key={idx}>{p}</p>
                  ))}
                </div>

                {/* Quiz card */}
                {enableQuiz && (
                  <div className="p-3.5 rounded-xl border border-obsidian-700 bg-obsidian-900/95 space-y-2.5 mt-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">
                      Comprehension Verification Question
                    </span>
                    <p className="text-xs font-semibold text-white">
                      {quizQuestion || 'Question will appear here...'}
                    </p>
                    <div className="space-y-1.5">
                      {quizOptions.map((opt, idx) => (
                        <div
                          key={idx}
                          className={`p-2 rounded-lg border text-[11px] flex items-center gap-2 ${
                            quizCorrectOptionIndex === idx
                              ? 'border-emerald-500/50 bg-emerald-950/20 text-emerald-300 font-medium'
                              : 'border-obsidian-800 bg-obsidian-950 text-slate-300'
                          }`}
                        >
                          <span className="w-4 font-bold text-slate-400">
                            {String.fromCharCode(65 + idx)}.
                          </span>
                          <span className="flex-1">{opt || `Option ${String.fromCharCode(65 + idx)}`}</span>
                          {quizCorrectOptionIndex === idx && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      disabled
                      className="w-full py-2 rounded-lg bg-emerald-600/50 text-white font-bold text-xs mt-2"
                    >
                      Submit Answer & Claim {rewardPoints} PTS
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setActiveTab('FORM')}
              className="px-5 py-2 rounded-xl bg-obsidian-800 hover:bg-obsidian-700 text-xs font-semibold text-white border border-obsidian-700 transition"
            >
              Return to Form Editor
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
