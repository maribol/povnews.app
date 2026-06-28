import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { DigestItem, ItemRating, PillarAccent, ProfileDraft, ReaderTechnicalDepth, SetupQuestion, UserPOV } from "../types/pov";
import { AgentActivityFeed } from "../components/AgentActivityFeed";
import {
  STORAGE_KEYS,
  getFromStorage,
  setInStorage,
} from "../storage/schema";
import { useStorage } from "../newtab/hooks/useStorage";
import {
  ThumbsDown,
  ThumbsUp,
  X,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Check,
  Square,
  ChevronDown,
  Upload,
  Download,
  Cpu,
} from "lucide-react";
import {
  DEFAULT_CLOUD_MODEL,
  PRICING_URL,
  cloudModelInfo,
  type CloudModelInfo,
} from "../types/cloudModels";
import { recordFeedback } from "../storage/feedback";
import { sendToWorker } from "../utils/messaging";
import {
  downloadProfileJson,
  parseProfileImportJson,
} from "../utils/profileImportExport";
import {
  defaultSetupQuestions,
  inferReaderPreferences,
  initialSetupAnswers,
  readerPreferencesFromSetup,
} from "../utils/readerPreferences";

const MIN_ABOUT_LENGTH = 10;

const STEPS = [
  { id: "api", title: "API key" },
  { id: "about", title: "About you" },
  { id: "profile", title: "Your profile" },
  { id: "calibrate", title: "Calibrate" },
] as const;

const ACCENTS: PillarAccent[] = ["slate", "emerald", "amber", "rose", "violet", "cyan"];

const POLL_INTERVAL_MS = 10_000;

type Props = { onComplete: () => void; onClose?: () => void };

function WizardCard({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div
      className={`bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800/80 rounded-xl px-8 py-8 ${wide ? "max-w-2xl" : "max-w-md"} w-full mx-auto`}
    >
      {children}
    </div>
  );
}

function Dots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`w-2 h-2 rounded-full transition-all duration-300 ${
            i === current
              ? "bg-indigo-500 dark:bg-indigo-400 w-6"
              : i < current
                ? "bg-indigo-300 dark:bg-indigo-600"
                : "bg-stone-300 dark:bg-stone-600"
          }`}
        />
      ))}
    </div>
  );
}

function NavButton({
  onClick,
  disabled,
  variant,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  variant: "primary" | "secondary";
  children: ReactNode;
}) {
  const base =
    variant === "primary"
      ? "bg-indigo-500 hover:bg-indigo-600 text-white"
      : "bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl transition-colors ${base} ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      {children}
    </button>
  );
}

function extractUrls(text: string): string[] {
  const re = /https?:\/\/[^\s,)]+/g;
  return [...new Set(text.match(re) ?? [])];
}

function generateCalibrationFromPillars(
  pillars: UserPOV["pillars"],
  about: string,
): DigestItem[] {
  if (!pillars.length) return [];

  const templates = [
    { prefix: "How", verb: "is reshaping", suffix: "for operators" },
    { prefix: "Why", verb: "matters more than ever in", suffix: "" },
    { prefix: "The hidden cost of ignoring", verb: "trends in", suffix: "" },
    { prefix: "What top teams get right about", verb: "in", suffix: "today" },
    { prefix: "A practical guide to", verb: "optimization for", suffix: "" },
    { prefix: "Breaking down the latest shift in", verb: "", suffix: "strategy" },
    { prefix: "Lessons from scaling", verb: "", suffix: "at high volume" },
    { prefix: "The operator's playbook for", verb: "", suffix: "in 2026" },
  ];

  const items: DigestItem[] = [];
  for (const p of pillars) {
    const t1 = templates[items.length % templates.length]!;
    const t2 = templates[(items.length + 1) % templates.length]!;
    items.push({
      id: `cal-${p.slug}-1`,
      url: "",
      title: `${t1.prefix} ${p.name.toLowerCase()} ${t1.verb} ${t1.suffix}`.trim(),
      published: new Date().toISOString(),
      source: "Calibration",
      summary: p.description,
      whyItMatters: `If ${p.name.toLowerCase()} is central to your work, this kind of shift is worth watching before it shows up in your metrics.`,
      quotableSnippet: "",
      pillarSlug: p.slug,
      pillarName: p.name,
      score: 80,
      scoreBreakdown: { pillarFit: 80, audienceFit: 80, founderVoiceMatch: 80, recency: 80, conversationPotential: 80 },
      audienceFit: "founder",
    });
    if (items.length < 8) {
      items.push({
        id: `cal-${p.slug}-2`,
        url: "",
        title: `${t2.prefix} ${p.name.toLowerCase()} ${t2.verb} ${t2.suffix}`.trim(),
        published: new Date().toISOString(),
        source: "Calibration",
        summary: p.description,
        whyItMatters: `You'd care about this if ${p.description.slice(0, 80).toLowerCase()}`,
        quotableSnippet: "",
        pillarSlug: p.slug,
        pillarName: p.name,
        score: 75,
        scoreBreakdown: { pillarFit: 75, audienceFit: 75, founderVoiceMatch: 75, recency: 75, conversationPotential: 75 },
        audienceFit: "operator",
      });
    }
  }
  return items.slice(0, 8);
}

const TECH_DEPTH_OPTIONS: { value: ReaderTechnicalDepth; label: string; detail: string }[] = [
  { value: "business", label: "Business", detail: "Policy, markets, operator moves — not API docs" },
  { value: "mixed", label: "Mixed", detail: "Tools + strategy; skip raw changelogs unless big" },
  { value: "technical", label: "Technical", detail: "APIs, changelogs, and implementation detail OK" },
];

function DigestTuneSection({
  technicalDepth,
  onTechnicalDepthChange,
  setupQuestions,
  setupAnswers,
  onSetupAnswerChange,
}: {
  technicalDepth: ReaderTechnicalDepth;
  onTechnicalDepthChange: (depth: ReaderTechnicalDepth) => void;
  setupQuestions: SetupQuestion[];
  setupAnswers: Record<string, boolean>;
  onSetupAnswerChange: (id: string, value: boolean) => void;
}) {
  return (
    <div className="mb-6 rounded-lg border border-indigo-200/80 dark:border-indigo-800/60 bg-indigo-50/30 dark:bg-indigo-950/20 px-4 py-4 space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">
          Tune your digest
        </p>
        <p className="text-sm text-stone-600 dark:text-stone-400 mt-1">
          We inferred this from your profile — adjust so the feed matches how you work.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {TECH_DEPTH_OPTIONS.map((opt) => {
          const selected = technicalDepth === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onTechnicalDepthChange(opt.value)}
              className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
                selected
                  ? "border-indigo-400 bg-white dark:bg-stone-900 ring-1 ring-indigo-400/40"
                  : "border-stone-200 dark:border-stone-700 bg-white/60 dark:bg-stone-900/40 hover:border-stone-300"
              }`}
            >
              <span className="text-sm font-medium text-stone-900 dark:text-stone-100 block">
                {opt.label}
              </span>
              <span className="text-[11px] text-stone-500 dark:text-stone-400 leading-snug block mt-0.5">
                {opt.detail}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-3 pt-1 border-t border-indigo-100 dark:border-indigo-900/40">
        {setupQuestions.map((q) => (
          <div key={q.id} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-stone-800 dark:text-stone-200">{q.question}</p>
              {q.hint && (
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">{q.hint}</p>
              )}
            </div>
            <div className="flex shrink-0 rounded-lg border border-stone-200 dark:border-stone-700 overflow-hidden text-xs font-medium">
              <button
                type="button"
                onClick={() => onSetupAnswerChange(q.id, true)}
                className={`px-2.5 py-1.5 ${
                  setupAnswers[q.id] === true
                    ? "bg-indigo-500 text-white"
                    : "bg-white dark:bg-stone-900 text-stone-500"
                }`}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => onSetupAnswerChange(q.id, false)}
                className={`px-2.5 py-1.5 border-l border-stone-200 dark:border-stone-700 ${
                  setupAnswers[q.id] === false
                    ? "bg-indigo-500 text-white"
                    : "bg-white dark:bg-stone-900 text-stone-500"
                }`}
              >
                No
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Wizard({ onComplete, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [apiKey, setApiKey] = useState("");
  const [apiError, setApiError] = useState<string | null>(null);
  const [validatingKey, setValidatingKey] = useState(false);
  const [cloudModel, setCloudModel] = useState<string>(DEFAULT_CLOUD_MODEL);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const modelsFetchedForKey = useRef<string | null>(null);
  const [about, setAbout] = useState("");
  const [urls, setUrls] = useState<string[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [agentRunning, setAgentRunning] = useState(false);
  const [resultText, setResultText] = useState<string | null>(null);
  const [pillars, setPillars] = useState<UserPOV["pillars"]>([]);
  const [audiences, setAudiences] = useState<string[]>([]);
  const [sources, setSources] = useState<UserPOV["sources"]>([]);
  const [sourceUrlInput, setSourceUrlInput] = useState("");
  const [autoDiscover, setAutoDiscover] = useState(true);
  const [technicalDepth, setTechnicalDepth] = useState<ReaderTechnicalDepth>("mixed");
  const [includeDeveloperSources, setIncludeDeveloperSources] = useState(true);
  const [setupQuestions, setSetupQuestions] = useState<SetupQuestion[]>([]);
  const [setupAnswers, setSetupAnswers] = useState<Record<string, boolean>>({});
  const [cancelling, setCancelling] = useState(false);
  const [calibrationItems, setCalibrationItems] = useState<DigestItem[]>([]);
  const [calRatings, setCalRatings] = useState<Record<string, ItemRating>>({});
  const [runState] = useStorage(STORAGE_KEYS.runState);
  const [profileDraft] = useStorage(STORAGE_KEYS.profileDraft);
  const [storedKey] = useStorage(STORAGE_KEYS.apiKey);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (storedKey) setApiKey(storedKey);
  }, [storedKey]);

  // Allow closing the wizard with Escape when it's being used to edit an
  // existing POV (onClose is only provided in that case).
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Restore wizard state on mount
  useEffect(() => {
    void (async () => {
      const saved = await getFromStorage(STORAGE_KEYS.wizardState);
      if (saved) {
        if (saved.step > 0) setStep(saved.step);
        if (saved.about) setAbout(saved.about);
        if (saved.urls?.length) setUrls(saved.urls);
      }
      const rs = await getFromStorage(STORAGE_KEYS.runState);
      if (rs?.kind === "profile" && rs.status === "running") {
        setStep(2);
        setAgentRunning(true);
        setProfileLoading(true);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist step/about/urls on change
  useEffect(() => {
    void setInStorage(STORAGE_KEYS.wizardState, { step, about, urls });
  }, [step, about, urls]);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(() => {
      void sendToWorker({ type: "POLL_ACTIVE_RUN" }).catch(() => {});
    }, POLL_INTERVAL_MS);
    void sendToWorker({ type: "POLL_ACTIVE_RUN" }).catch(() => {});
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  useEffect(() => {
    if (step !== 2) return;
    if (profileDraft) applyDraft(profileDraft);
    if (runState?.kind !== "profile") return;
    if (runState.status === "running") {
      setAgentRunning(true);
      setProfileLoading(true);
      setProfileError(null);
      startPolling();
    }
    if (runState.status === "succeeded") {
      setAgentRunning(false);
      setProfileLoading(false);
      setProfileError(null);
      if (runState.resultText) setResultText(runState.resultText);
      stopPolling();
    }
    if (runState.status === "failed") {
      setAgentRunning(false);
      setProfileLoading(false);
      setProfileError(runState.error ?? "Profile generation failed");
      if (runState.resultText) setResultText(runState.resultText);
      stopPolling();
    }
  }, [profileDraft, runState, step, startPolling, stopPolling]);

  useEffect(() => {
    if (step !== 2 || agentRunning || pillars.length === 0 || setupQuestions.length > 0) return;
    const inferred = inferReaderPreferences(about, audiences);
    const questions = defaultSetupQuestions(inferred);
    setSetupQuestions(questions);
    setSetupAnswers(initialSetupAnswers(questions));
    setTechnicalDepth(inferred.technicalDepth);
    setIncludeDeveloperSources(inferred.includeDeveloperSources);
  }, [step, agentRunning, pillars.length, setupQuestions.length, about, audiences]);

  function applyReaderSetup(draft: ProfileDraft, audienceList: string[], aboutText: string): void {
    const inferred = draft.readerPreferences ?? inferReaderPreferences(aboutText, audienceList);
    const questions =
      draft.setupQuestions?.length ? draft.setupQuestions : defaultSetupQuestions(inferred);
    setTechnicalDepth(inferred.technicalDepth);
    setIncludeDeveloperSources(inferred.includeDeveloperSources);
    setSetupQuestions(questions);
    setSetupAnswers(
      draft.readerPreferences?.setupAnswers ?? initialSetupAnswers(questions),
    );
  }

  function applyDraft(draft: ProfileDraft): void {
    if (draft.about) setAbout(draft.about);
    if (draft.pillars?.length) setPillars(draft.pillars);
    const audienceList = draft.audiences?.length ? draft.audiences : audiences;
    if (draft.audiences?.length) setAudiences(draft.audiences);
    setSources(draft.sources ?? []);
    applyReaderSetup(draft, audienceList, draft.about ?? about);
  }

  function handleTechnicalDepthChange(depth: ReaderTechnicalDepth): void {
    setTechnicalDepth(depth);
    if (depth === "business") {
      setIncludeDeveloperSources(false);
      setSetupAnswers((prev) => ({
        ...prev,
        "developer-sources": false,
        "business-framing": true,
      }));
    } else if (depth === "technical") {
      setIncludeDeveloperSources(true);
      setSetupAnswers((prev) => ({
        ...prev,
        "developer-sources": true,
        "business-framing": false,
      }));
    }
  }

  function handleSetupAnswerChange(id: string, value: boolean): void {
    setSetupAnswers((prev) => {
      const next = { ...prev, [id]: value };
      if (id === "developer-sources") setIncludeDeveloperSources(value);
      return next;
    });
  }

  function importProfileJson(text: string): void {
    const result = parseProfileImportJson(text, MIN_ABOUT_LENGTH);
    if (!result.ok) {
      setProfileError(result.errors.join(" · "));
      return;
    }
    setProfileError(null);
    setProfileLoading(false);
    setAgentRunning(false);
    setResultText(null);
    applyDraft(result.draft);
    setStep(2);
  }

  function handleProfileFileImport(file: File): void {
    void file.text().then(importProfileJson).catch(() => {
      setProfileError("Could not read the selected file");
    });
  }

  function exportCurrentProfile(): void {
    if (!about.trim() || pillars.length === 0) return;
    const slug = pillars[0]?.slug ?? "profile";
    downloadProfileJson(`pov-news-profile-${slug}.json`, {
      about,
      pillars,
      audiences,
      sources,
      readerPreferences: readerPreferencesFromSetup(
        technicalDepth,
        includeDeveloperSources,
        setupAnswers,
      ),
    });
  }

  // Load the persisted model choice once on mount.
  useEffect(() => {
    void getFromStorage(STORAGE_KEYS.cloudModel).then((m) =>
      setCloudModel(m || DEFAULT_CLOUD_MODEL),
    );
  }, []);

  // Fetch the available model list once a plausible key is present (guarded so
  // it fires at most once per distinct key).
  useEffect(() => {
    const key = apiKey.trim();
    if (key.length < 10 || modelsFetchedForKey.current === key) return;
    modelsFetchedForKey.current = key;
    void sendToWorker<{ ok: boolean; models?: string[] }>({
      type: "LIST_MODELS",
      apiKey: key,
    })
      .then((res) => {
        if (res.ok && Array.isArray(res.models)) {
          setAvailableModels(res.models.filter((m): m is string => typeof m === "string"));
        }
      })
      .catch(() => {});
  }, [apiKey]);

  async function selectModel(id: string): Promise<void> {
    setCloudModel(id);
    await setInStorage(STORAGE_KEYS.cloudModel, id);
  }

  const modelOptions: CloudModelInfo[] = (() => {
    const ids = [
      DEFAULT_CLOUD_MODEL,
      ...availableModels.filter((m) => m !== DEFAULT_CLOUD_MODEL),
    ];
    if (cloudModel && !ids.includes(cloudModel)) ids.push(cloudModel);
    return ids.map(cloudModelInfo);
  })();

  async function validateKey(): Promise<void> {
    setApiError(null);
    setValidatingKey(true);
    try {
      const res = await sendToWorker<{ ok: boolean; email?: string; error?: string }>({
        type: "VALIDATE_API_KEY",
        apiKey: apiKey.trim(),
      });
      if (!res.ok) {
        setApiError(res.error ?? "Invalid API key");
        return;
      }
      setStep(1);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : String(err));
    } finally {
      setValidatingKey(false);
    }
  }

  function addUrl(): void {
    const u = urlInput.trim();
    if (!u) return;
    const normalized = u.startsWith("http") ? u : `https://${u}`;
    if (!urls.includes(normalized)) setUrls((prev) => [...prev, normalized]);
    setUrlInput("");
  }

  function removeUrl(url: string): void {
    setUrls((prev) => prev.filter((u) => u !== url));
  }

  async function generateProfile(): Promise<void> {
    setProfileLoading(true);
    setProfileError(null);
    setAgentRunning(false);
    const allUrls = [...new Set([...urls, ...extractUrls(about)])];
    try {
      const res = await sendToWorker<{ ok: boolean; draft?: ProfileDraft; error?: string }>({
        type: "GENERATE_PROFILE",
        about: about.trim(),
        urls: allUrls,
      });
      if (!res.ok) {
        setProfileError(res.error ?? "Could not start profile generation");
        setProfileLoading(false);
        return;
      }
      if (res.draft) applyDraft(res.draft);
      setProfileLoading(false);
      setAgentRunning(true);
      setStep(2);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : String(err));
      setProfileLoading(false);
    }
  }

  async function cancelAgent(): Promise<void> {
    setCancelling(true);
    try {
      await sendToWorker({ type: "CANCEL_AGENT_RUN" });
    } catch {
      // ignore
    }
    stopPolling();
    setAgentRunning(false);
    setProfileLoading(false);
    setCancelling(false);
  }

  async function retryProfileAgent(): Promise<void> {
    await setInStorage(STORAGE_KEYS.runState, { status: "idle", kind: "profile" });
    setProfileError(null);
    await generateProfile();
  }

  async function saveWizardPov(): Promise<UserPOV> {
    const readerPreferences = readerPreferencesFromSetup(
      technicalDepth,
      includeDeveloperSources,
      setupAnswers,
    );
    const pov: UserPOV = {
      about,
      pillars,
      audiences,
      sources,
      scoringRubric: { recencyDays: 30, minScore: 9 },
      antiPatterns: [],
      proExamples: [],
      voiceSamples: [],
      readerPreferences,
    };
    await setInStorage(STORAGE_KEYS.userPov, pov);
    await setInStorage(STORAGE_KEYS.autoDiscoverSources, autoDiscover);
    return pov;
  }

  async function goToCalibration(): Promise<void> {
    try {
      await saveWizardPov();
      const startRes = await sendToWorker<{ ok: boolean; error?: string }>({
        type: "START_INITIAL_DIGEST",
      });
      if (!startRes.ok) {
        setProfileError(startRes.error ?? "Could not start your first digest");
        return;
      }

      const res = (await sendToWorker({ type: "GET_CALIBRATION_SAMPLES" })) as {
        items?: DigestItem[];
      };
      const fromDigest = res.items ?? [];
      if (fromDigest.length >= 3) {
        setCalibrationItems(fromDigest);
      } else {
        setCalibrationItems(generateCalibrationFromPillars(pillars, about));
      }
      setStep(3);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : String(err));
    }
  }

  function addSourceUrl(): void {
    const url = sourceUrlInput.trim();
    if (!url || !pillars[0]) return;
    const normalized = url.startsWith("http") ? url : `https://${url}`;
    setSources((s) => [...s, { url: normalized, pillarSlug: pillars[0].slug, weight: 1 }]);
    setSourceUrlInput("");
  }

  function removeSource(url: string): void {
    setSources((prev) => prev.filter((s) => s.url !== url));
  }

  async function finishWizard(): Promise<void> {
    await saveWizardPov();
    for (const item of calibrationItems) {
      const rating = calRatings[item.id];
      if (!rating) continue;
      await recordFeedback(item, rating);
    }
    await sendToWorker({ type: "START_INITIAL_DIGEST" });
    await setInStorage(STORAGE_KEYS.onboardingComplete, true);
    await chrome.storage.local.remove(STORAGE_KEYS.wizardState);
    onComplete();
  }

  return (
    <div className="h-full flex flex-col bg-stone-50 dark:bg-stone-950">
    <header className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-stone-200/80 dark:border-stone-800/80 bg-white/80 dark:bg-stone-900/80 backdrop-blur-sm">
      <h1 className="text-sm font-bold text-stone-900 dark:text-stone-100 tracking-tight">
        POV News
      </h1>
      <span className="text-xs text-stone-400 dark:text-stone-500">Setup</span>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close setup"
          className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
        >
          <X className="w-4 h-4" /> Close
        </button>
      )}
    </header>
    <div className="flex-1 overflow-y-auto">
    <input
      ref={importInputRef}
      type="file"
      accept="application/json,.json"
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) handleProfileFileImport(file);
        e.target.value = "";
      }}
    />
    <div className="flex flex-col items-center justify-center min-h-full py-12 px-4">
      {/* Top progress breadcrumb */}
      <div className="flex items-center gap-3 mb-4 text-xs text-stone-500 dark:text-stone-400">
        {STEPS.map((s, i) => (
          <span key={s.id} className="flex items-center gap-2">
            {i > 0 && <span className="text-stone-300 dark:text-stone-600">&gt;</span>}
            <span
              className={`flex items-center gap-1.5 ${
                i < step
                  ? "text-indigo-500 dark:text-indigo-400"
                  : i === step
                    ? "text-stone-800 dark:text-stone-200 font-medium"
                    : ""
              }`}
            >
              {i < step && (
                <span className="w-4 h-4 rounded-full bg-indigo-500 text-white flex items-center justify-center">
                  <Check className="w-2.5 h-2.5" />
                </span>
              )}
              {i === step && (
                <span className="w-4 h-4 rounded-full border-2 border-indigo-500 bg-transparent" />
              )}
              {i > step && (
                <span className="w-4 h-4 rounded-full border-2 border-stone-300 dark:border-stone-600 bg-transparent" />
              )}
              {s.title}
            </span>
          </span>
        ))}
      </div>

      {/* --- Step 0: API key --- */}
      {step === 0 && (
        <WizardCard>
          <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100 text-center">
            Connect your Cursor API key
          </h2>
          <p className="text-sm text-stone-500 dark:text-stone-400 text-center mt-2 mb-6">
            We use Cloud Agents to generate your profile and daily digest. Your key stays
            in this browser only.
          </p>

          <label className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400 mb-1 block">
            API key
          </label>
          <input
            type="password"
            autoComplete="off"
            placeholder="crsr_…"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setApiError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && apiKey.trim().length >= 10 && !validatingKey)
                void validateKey();
            }}
            className="w-full px-4 py-3 text-sm rounded-lg bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-xs text-stone-400 mt-2">
            Generate a key at{" "}
            <a
              href="https://cursor.com/dashboard/integrations"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-500 hover:text-indigo-600 underline"
            >
              cursor.com/dashboard/integrations
            </a>{" "}
            &rarr; User API Keys &rarr; Add
          </p>

          {apiError && (
            <p className="text-sm mt-3 px-3 py-2.5 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
              {apiError}
            </p>
          )}

          <div className="mt-6">
            <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400 mb-2">
              <Cpu className="w-3.5 h-3.5" /> Cloud model
            </label>
            <div className="relative">
              <select
                value={cloudModel}
                onChange={(e) => void selectModel(e.target.value)}
                className="w-full appearance-none pl-3 pr-9 py-2.5 text-sm rounded-lg bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                {modelOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                    {m.recommended ? " (default)" : ""} — {m.cost}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
            </div>
            <p className="text-xs text-stone-400 mt-2">
              You can change this later in settings ·{" "}
              <a
                href={PRICING_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-500 hover:text-indigo-600 underline"
              >
                see pricing
              </a>
            </p>
          </div>

          <div className="flex items-center justify-between mt-8">
            <Dots total={STEPS.length} current={step} />
            <NavButton
              variant="primary"
              disabled={apiKey.trim().length < 10 || validatingKey}
              onClick={() => void validateKey()}
            >
              {validatingKey ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Checking…
                </>
              ) : (
                <>
                  Next <ArrowRight className="w-4 h-4" />
                </>
              )}
            </NavButton>
          </div>
        </WizardCard>
      )}

      {/* --- Step 1: About you --- */}
      {step === 1 && (
        <WizardCard>
          <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100 text-center">
            Tell us about yourself
          </h2>
          <p className="text-sm text-stone-500 dark:text-stone-400 text-center mt-2 mb-6">
            Brief role + what news helps you decide. AI builds pillars and sources — or import JSON to skip.
          </p>

          <textarea
            className="w-full min-h-32 px-4 py-3 text-sm rounded-lg bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            placeholder="e.g. Founder of a checkout SaaS for DR teams. I care about paid-media policy, attribution, and conversion news — not generic AI hype."
            value={about}
            onChange={(e) => {
              setAbout(e.target.value);
              setProfileError(null);
            }}
          />
          <p className="text-xs text-stone-400 mt-1">
            {about.trim().length < MIN_ABOUT_LENGTH
              ? `${about.trim().length}/${MIN_ABOUT_LENGTH} characters minimum`
              : about.trim().length > 400
                ? `${about.trim().length} chars — shorter input often yields cleaner pillars`
                : "2–3 sentences is enough. URLs add detail."}
          </p>

          <div className="mt-4">
            <label className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400 mb-1 block">
              Your URLs (agent will research these)
            </label>
            <div className="flex gap-2">
              <input
                placeholder="your-site.com"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addUrl();
                  }
                }}
                className="flex-1 px-4 py-2.5 text-sm rounded-lg bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <NavButton variant="secondary" onClick={addUrl} disabled={!urlInput.trim()}>
                Add
              </NavButton>
            </div>
            {urls.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {urls.map((u) => (
                  <span
                    key={u}
                    className="inline-flex items-center gap-1.5 px-3 py-1 text-xs bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg border border-indigo-200 dark:border-indigo-800"
                  >
                    {u.replace(/^https?:\/\//, "")}
                    <button
                      type="button"
                      onClick={() => removeUrl(u)}
                      className="hover:text-indigo-800 dark:hover:text-indigo-200"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-stone-200 dark:border-stone-700" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 text-xs uppercase tracking-wide text-stone-400 bg-stone-100 dark:bg-stone-800 rounded-full">
                or import
              </span>
            </div>
          </div>

          <NavButton
            variant="secondary"
            onClick={() => importInputRef.current?.click()}
            disabled={profileLoading}
          >
            <Upload className="w-4 h-4" /> Import profile JSON
          </NavButton>
          <p className="text-xs text-stone-400 text-center mt-2">
            Skips AI generation — validates pillars, sources, and audiences.
          </p>

          {profileError && (
            <p className="text-sm mt-3 px-3 py-2.5 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
              {profileError}
            </p>
          )}

          <div className="flex items-center justify-between mt-8">
            <NavButton variant="secondary" onClick={() => setStep(0)} disabled={profileLoading}>
              <ArrowLeft className="w-4 h-4" /> Back
            </NavButton>
            <Dots total={STEPS.length} current={step} />
            <NavButton
              variant="primary"
              disabled={about.trim().length < MIN_ABOUT_LENGTH || profileLoading}
              onClick={() => void generateProfile()}
            >
              {profileLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Starting…
                </>
              ) : (
                <>
                  Generate profile <ArrowRight className="w-4 h-4" />
                </>
              )}
            </NavButton>
          </div>
        </WizardCard>
      )}

      {/* --- Step 2: Profile review --- */}
      {step === 2 && (
        <WizardCard wide>
          <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100 text-center">
            {agentRunning ? "Building your profile…" : "Your profile"}
          </h2>
          <div className="flex items-center justify-between mt-2 mb-6">
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {agentRunning
                ? "Agent is researching your sites and discovering sources. Edit anytime."
                : "Review and customize your pillars and sources."}
            </p>
            {!agentRunning && pillars.length > 0 && (
              <button
                type="button"
                onClick={exportCurrentProfile}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-500 hover:text-indigo-600 shrink-0"
              >
                <Download className="w-3.5 h-3.5" /> Export JSON
              </button>
            )}
          </div>

          {agentRunning && (
            <AgentActivityFeed
              active
              seed={runState?.activityLog ?? []}
              title="Researching your business"
              generatingLabel="Generating your profile JSON…"
              startedAt={runState?.startedAt}
              onStop={() => void cancelAgent()}
              cancelling={cancelling}
              className="mb-4"
            />
          )}

          {profileError && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 space-y-2">
              <p className="text-sm text-rose-600 dark:text-rose-400">{profileError}</p>
              <button
                type="button"
                onClick={() => void retryProfileAgent()}
                className="text-xs font-medium text-indigo-500 hover:text-indigo-600 underline"
              >
                Retry with AI
              </button>
            </div>
          )}

          {/* Result text from agent */}
          {resultText && !agentRunning && (
            <div className="text-xs text-stone-500 dark:text-stone-400 bg-stone-50 dark:bg-stone-800 border border-stone-200/80 dark:border-stone-800/80 rounded-lg px-4 py-3 mb-4 leading-relaxed">
              {resultText.slice(0, 300)}
              {resultText.length > 300 && "…"}
            </div>
          )}

          {/* Pillars */}
          {pillars.length === 0 && agentRunning ? (
            <div className="space-y-3 mb-6">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-stone-50 dark:bg-stone-800 rounded-lg p-4 border border-stone-200/80 dark:border-stone-800/80 animate-pulse"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-stone-200 dark:bg-stone-700" />
                    <div className="h-4 w-48 bg-stone-200 dark:bg-stone-700 rounded" />
                  </div>
                  <div className="h-4 w-full bg-stone-100 dark:bg-stone-800 rounded mt-2" />
                </div>
              ))}
            </div>
          ) : pillars.length === 0 ? (
            <div className="text-center py-6 space-y-3">
              <p className="text-sm text-stone-400">No pillars yet.</p>
              <NavButton variant="secondary" onClick={() => importInputRef.current?.click()}>
                <Upload className="w-4 h-4" /> Import profile JSON
              </NavButton>
            </div>
          ) : (
            <div className="space-y-2 mb-6">
              <p className="text-xs font-bold uppercase tracking-widest text-stone-400">
                Pillars — {pillars.length}
              </p>
              {pillars.map((p, idx) => (
                <div
                  key={p.slug}
                  className="flex items-start gap-3 px-4 py-3 bg-stone-50 dark:bg-stone-800 rounded-lg border border-stone-200/80 dark:border-stone-800/80"
                >
                  <button
                    type="button"
                    onClick={() => {
                      const next = [...pillars];
                      const nextAccentIdx = (ACCENTS.indexOf(p.accent) + 1) % ACCENTS.length;
                      next[idx] = { ...p, accent: ACCENTS[nextAccentIdx]! };
                      setPillars(next);
                    }}
                    className="w-3.5 h-3.5 rounded-full mt-2 shrink-0 border-2 border-white dark:border-stone-700"
                    title="Click to change color"
                    style={{
                      backgroundColor:
                        p.accent === "slate" ? "#64748b"
                        : p.accent === "emerald" ? "#10b981"
                        : p.accent === "amber" ? "#f59e0b"
                        : p.accent === "rose" ? "#f43f5e"
                        : p.accent === "violet" ? "#8b5cf6"
                        : "#06b6d4",
                    }}
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <input
                      value={p.name}
                      onChange={(e) => {
                        const next = [...pillars];
                        next[idx] = { ...p, name: e.target.value };
                        setPillars(next);
                      }}
                      className="w-full px-0 py-0 text-sm font-medium bg-transparent text-stone-900 dark:text-stone-100 focus:outline-none border-none placeholder:text-stone-400"
                      placeholder="Pillar name"
                    />
                    <textarea
                      value={p.description}
                      onChange={(e) => {
                        const next = [...pillars];
                        next[idx] = { ...p, description: e.target.value };
                        setPillars(next);
                      }}
                      rows={2}
                      className="w-full px-0 py-0 text-xs bg-transparent text-stone-500 dark:text-stone-400 focus:outline-none border-none resize-none placeholder:text-stone-300"
                      placeholder="Description — what signals does this pillar cover?"
                    />
                  </div>
                  {pillars.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setPillars((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-stone-300 hover:text-stone-500 dark:text-stone-600 dark:hover:text-stone-400 mt-1 shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {!agentRunning && pillars.length > 0 && setupQuestions.length > 0 && (
            <DigestTuneSection
              technicalDepth={technicalDepth}
              onTechnicalDepthChange={handleTechnicalDepthChange}
              setupQuestions={setupQuestions}
              setupAnswers={setupAnswers}
              onSetupAnswerChange={handleSetupAnswerChange}
            />
          )}

          {/* Sources */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold uppercase tracking-widest text-stone-400">
                Sources{" "}
                {agentRunning && sources.length === 0 && (
                  <span className="normal-case font-normal">— discovering…</span>
                )}
                {!agentRunning && sources.length > 0 && (
                  <span className="normal-case font-normal">
                    — {sources.length} found
                  </span>
                )}
              </p>
              <label className="flex items-center gap-2 cursor-pointer select-none" title="Automatically discover new relevant sources as you use the app">
                <span className="text-[11px] text-stone-400">Auto-discover</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoDiscover}
                  onClick={() => {
                    const next = !autoDiscover;
                    setAutoDiscover(next);
                    void setInStorage(STORAGE_KEYS.autoDiscoverSources, next);
                  }}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${autoDiscover ? "bg-indigo-500" : "bg-stone-300 dark:bg-stone-600"}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${autoDiscover ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
              </label>
            </div>
            {sources.length > 0 && (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {sources.map((s) => (
                  <div
                    key={s.url}
                    className="flex items-center gap-2 px-3 py-2 text-sm bg-stone-50 dark:bg-stone-800 rounded-lg border border-stone-200 dark:border-stone-700"
                  >
                    <span className="flex-1 truncate text-stone-600 dark:text-stone-400 text-xs">
                      {s.url.replace(/^https?:\/\//, "")}
                    </span>
                    <span className="text-[10px] text-stone-400 shrink-0 bg-stone-100 dark:bg-stone-700 px-1.5 py-0.5 rounded">
                      {s.pillarSlug}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeSource(s.url)}
                      className="text-stone-300 hover:text-stone-500 dark:text-stone-600 dark:hover:text-stone-400 shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 mt-2">
              <input
                placeholder="https://… add source"
                value={sourceUrlInput}
                onChange={(e) => setSourceUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSourceUrl();
                  }
                }}
                className="flex-1 px-3 py-2 text-sm rounded-lg bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <NavButton
                variant="secondary"
                onClick={addSourceUrl}
                disabled={!sourceUrlInput.trim() || pillars.length === 0}
              >
                Add
              </NavButton>
            </div>
          </div>

          <div className="flex items-center justify-between mt-6">
            <NavButton variant="secondary" onClick={() => setStep(1)}>
              <ArrowLeft className="w-4 h-4" /> Back
            </NavButton>
            <Dots total={STEPS.length} current={step} />
            <NavButton
              variant="primary"
              disabled={pillars.length === 0 || agentRunning}
              onClick={() => void goToCalibration()}
            >
              Next <ArrowRight className="w-4 h-4" />
            </NavButton>
          </div>
        </WizardCard>
      )}

      {/* --- Step 3: Calibrate --- */}
      {step === 3 && (
        <WizardCard wide>
          <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100 text-center">
            Calibrate your feed
          </h2>
          <p className="text-sm text-stone-500 dark:text-stone-400 text-center mt-2 mb-6">
            Rate the &ldquo;what this means for you&rdquo; line on each sample — thumbs up if it
            feels right for your work, down if it misses the mark.
          </p>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {calibrationItems.map((item) => (
              <div
                key={item.id}
                className={`flex items-start gap-3 px-4 py-3 rounded-lg border transition-colors ${
                  calRatings[item.id] === "up"
                    ? "border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/10"
                    : calRatings[item.id] === "down"
                      ? "border-rose-300 dark:border-rose-700 bg-rose-50/50 dark:bg-rose-900/10"
                      : "border-stone-200/80 dark:border-stone-800/80 bg-white dark:bg-stone-900"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-900 dark:text-stone-100 line-clamp-1">
                    {item.title}
                  </p>
                  <p className="text-xs text-stone-500 mt-0.5 line-clamp-1">
                    {item.whyItMatters}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setCalRatings((r) => ({ ...r, [item.id]: "up" }))}
                    className={`p-2 rounded-lg transition-colors ${
                      calRatings[item.id] === "up"
                        ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                        : "hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-400"
                    }`}
                  >
                    <ThumbsUp className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalRatings((r) => ({ ...r, [item.id]: "down" }))}
                    className={`p-2 rounded-lg transition-colors ${
                      calRatings[item.id] === "down"
                        ? "bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400"
                        : "hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-400"
                    }`}
                  >
                    <ThumbsDown className="w-4 h-4" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between mt-8">
            <NavButton variant="secondary" onClick={() => setStep(2)}>
              <ArrowLeft className="w-4 h-4" /> Back
            </NavButton>
            <Dots total={STEPS.length} current={step} />
            <NavButton variant="primary" onClick={() => void finishWizard()}>
              Finish setup <Check className="w-4 h-4" />
            </NavButton>
          </div>
        </WizardCard>
      )}
    </div>
    </div>
    </div>
  );
}
