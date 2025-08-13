/*
  Auto Tracker: capture PageView, PageLeave, ScrollDepth, Click events
  - PageView: 首次进入系统时采集来源(source)
  - PageLeave: 离开页面时汇总上报最大滚动深度和停留时间
  - ScrollDepth: 记录滚动深度
  - Click: 记录点击事件
*/

const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";

export type XDEventType =
  | "PageView"
  | "PageLeave"
  | "ScrollDepth"
  | "Click";

export interface XDBaseEvent {
  eventType: XDEventType;
  timestamp: number; // ms
  source?: string; // 自定义来源或自动识别（direct/google/referral:example.com/social:twitter 等）
  referrer?: string;
  deviceType?: string; // desktop | mobile | tablet | bot | unknown
  os?: string; // Windows / macOS / iOS / Android / Linux / Unknown
  browser?: string; // Chrome / Safari / Firefox / Edge / IE / Unknown
  pageTitle?: string;
  pageURL?: string;
  userId: string;
  businessId?: string;
  // 自动识别的流量信息（若可得）
  channel?: "direct" | "organic" | "paid" | "social" | "referral" | "email" | "unknown";
  trafficSource?: string; // utm_source 或搜索引擎/域名
  trafficMedium?: string; // utm_medium 或 organic/social/referral/paid
  trafficCampaign?: string; // utm_campaign
  trafficTerm?: string; // utm_term 或搜索词（未解析搜索词时为空）
  trafficContent?: string; // utm_content
  referrerDomain?: string; // 从 referrer 提取的域名
}

export interface XDPageViewEvent extends XDBaseEvent {
  eventType: "PageView";
  isFirstVisit?: boolean; // 是否首次访问
}

export interface XDPageLeaveEvent extends XDBaseEvent {
  eventType: "PageLeave";
  maxScrollDepth: number; // 0-100
  dwellTimeMs: number; // 停留时间(毫秒)
}

export interface XDScrollDepthEvent extends XDBaseEvent {
  eventType: "ScrollDepth";
  maxDepthPercent: number; // 0-100
}

export interface XDClickEvent extends XDBaseEvent {
  eventType: "Click";
  elementTag?: string;
  elementId?: string;
  elementClasses?: string;
  elementText?: string;
  href?: string;
}

export type XDEvent =
  | XDPageViewEvent
  | XDPageLeaveEvent
  | XDScrollDepthEvent
  | XDClickEvent;

export interface AutoTrackerOptions {
  endpoint: string; // API 接口地址
  source?: string; // 自定义来源，作为基础字段之一，若不提供则自动识别
  businessId?: string | (() => string | Promise<string>);
  getAuthHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
  userId?: string; // 如果不传，则生成 uuid 并持久化
  storageKeyUserId?: string; // 默认 "xd_user_id"
  storageKeyFirstVisit?: string; // 默认 "xd_first_visit"
  trackClicks?: boolean; // 默认 true
  trackScrollDepth?: boolean; // 默认 true
  scrollThresholds?: number[]; // 默认 [25, 50, 75, 90, 100]
  autoDetectSource?: boolean; // 默认 true，自动识别 direct/organic/social/paid/referral
  preferUTM?: boolean; // 默认 true，若有 UTM 则优先使用 UTM
}

let trackerEnabled = false;
let trackerOptions: Required<AutoTrackerOptions> | null = null;
let persistedUserId: string | null = null;
let currentPageStartTime = 0;
let maxScrollDepthPercent = 0;
let isFirstVisit = false;

// For cleanup
let removeListeners: Array<() => void> = [];

function getDefaultedOptions(options: AutoTrackerOptions): Required<AutoTrackerOptions> {
  return {
    endpoint: options.endpoint,
    source: options.source || undefined,
    businessId: options.businessId ?? undefined,
    getAuthHeaders: options.getAuthHeaders || (async () => ({})),
    userId: options.userId || "",
    storageKeyUserId: options.storageKeyUserId || "xd_user_id",
    storageKeyFirstVisit: options.storageKeyFirstVisit || "xd_first_visit",
    trackClicks: options.trackClicks ?? true,
    trackScrollDepth: options.trackScrollDepth ?? true,
    scrollThresholds: options.scrollThresholds || [25, 50, 75, 90, 100],
    autoDetectSource: options.autoDetectSource ?? true,
    preferUTM: options.preferUTM ?? true,
  } as Required<AutoTrackerOptions>;
}

function generateUUID(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try { return (crypto as any).randomUUID(); } catch (_) {}
  }
  const tpl = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return tpl.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function ensureUserId(storageKey: string, provided?: string): string {
  if (!isBrowser) return provided || generateUUID();
  try {
    if (provided && provided.trim()) {
      localStorage.setItem(storageKey, provided);
      return provided;
    }
    const existing = localStorage.getItem(storageKey);
    if (existing && existing.trim()) return existing;
    const id = generateUUID();
    localStorage.setItem(storageKey, id);
    return id;
  } catch (_) {
    return provided || generateUUID();
  }
}

function checkFirstVisit(storageKey: string): boolean {
  if (!isBrowser) return false;
  try {
    const visited = localStorage.getItem(storageKey);
    if (!visited) {
      localStorage.setItem(storageKey, "1");
      return true;
    }
    return false;
  } catch (_) {
    return false;
  }
}

function getDeviceType(ua: string): string {
  const uaLower = ua.toLowerCase();
  if (/bot|crawler|spider|crawling/i.test(uaLower)) return "bot";
  if (/mobile|iphone|ipod|android.+mobile/.test(uaLower)) return "mobile";
  if (/ipad|tablet|android(?!.*mobile)/.test(uaLower)) return "tablet";
  return "desktop";
}

function getOS(ua: string): string {
  if (/windows nt/i.test(ua)) return "Windows";
  if (/mac os x/i.test(ua)) return "macOS";
  if (/(iphone|ipad|ipod)/i.test(ua)) return "iOS";
  if (/android/i.test(ua)) return "Android";
  if (/linux/i.test(ua)) return "Linux";
  return "Unknown";
}

function getBrowser(ua: string): string {
  if (/edg\//i.test(ua)) return "Edge";
  if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) return "Chrome";
  if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) return "Safari";
  if (/firefox\//i.test(ua)) return "Firefox";
  if (/msie|trident/i.test(ua)) return "IE";
  return "Unknown";
}

async function resolveBusinessId(biz: Required<AutoTrackerOptions>["businessId"]): Promise<string | undefined> {
  try {
    if (typeof biz === "function") {
      const v = await (biz as any)();
      return v || undefined;
    }
    return biz || undefined;
  } catch (_) {
    return undefined;
  }
}

function getDomainFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.hostname || undefined;
  } catch (_) {
    try {
      // 有些 referrer 可能是非绝对路径，简单兜底
      const a = document.createElement("a");
      a.href = url;
      return a.hostname || undefined;
    } catch (_) {
      return undefined;
    }
  }
}

function getSearchParams(href: string | undefined): URLSearchParams | null {
  if (!href) return null;
  try {
    const u = new URL(href);
    return u.searchParams;
  } catch (_) {
    return null;
  }
}

function classifyTraffic(referrer: string | undefined, href: string | undefined, preferUTM: boolean): {
  channel: XDBaseEvent["channel"];
  trafficSource?: string;
  trafficMedium?: string;
  trafficCampaign?: string;
  trafficTerm?: string;
  trafficContent?: string;
  referrerDomain?: string;
  sourceLabel: string; // 用于回填 base.source
} {
  const params = getSearchParams(href || (isBrowser ? window.location.href : undefined));
  const utm_source = params?.get("utm_source") || undefined;
  const utm_medium = params?.get("utm_medium") || undefined;
  const utm_campaign = params?.get("utm_campaign") || undefined;
  const utm_term = params?.get("utm_term") || undefined;
  const utm_content = params?.get("utm_content") || undefined;
  const gclid = params?.get("gclid") || undefined;
  const fbclid = params?.get("fbclid") || undefined;
  const msclkid = params?.get("msclkid") || undefined;

  const searchEngines: Array<{ hostIncludes: RegExp; name: string; qParams: string[] }> = [
    { hostIncludes: /google\./i, name: "google", qParams: ["q"] },
    { hostIncludes: /bing\./i, name: "bing", qParams: ["q"] },
    { hostIncludes: /yahoo\./i, name: "yahoo", qParams: ["p", "q"] },
    { hostIncludes: /baidu\./i, name: "baidu", qParams: ["wd", "word"] },
    { hostIncludes: /duckduckgo\./i, name: "duckduckgo", qParams: ["q"] },
    { hostIncludes: /yandex\./i, name: "yandex", qParams: ["text"] },
    { hostIncludes: /naver\./i, name: "naver", qParams: ["query"] },
  ];
  const socialHosts = /facebook\.com|fb\.com|x\.com|twitter\.com|t\.co|linkedin\.com|instagram\.com|pinterest\.com|reddit\.com|weibo\.com|zhihu\.com|douyin\.com|tiktok\.com/i;

  const refDomain = getDomainFromUrl(referrer);

  // 优先 UTM
  if (preferUTM && (utm_source || utm_medium || utm_campaign)) {
    let channel: XDBaseEvent["channel"] = "unknown";
    const mediumLower = (utm_medium || "").toLowerCase();
    if (/^(cpc|ppc|paidsearch|paid|cpv|cpa|cpm|display)$/.test(mediumLower) || gclid || msclkid) {
      channel = "paid";
    } else if (/^(social|social-network|social-media|sm|paid_social)$/.test(mediumLower) || fbclid) {
      channel = "social";
    } else if (/^email$/.test(mediumLower)) {
      channel = "email";
    } else if (/^organic$/.test(mediumLower)) {
      channel = "organic";
    } else if (/^referral$/.test(mediumLower)) {
      channel = "referral";
    }
    const sourceLabel = utm_source || mediumLower || "unknown";
    return {
      channel,
      trafficSource: utm_source,
      trafficMedium: utm_medium || (channel === "paid" ? "paid" : channel || undefined),
      trafficCampaign: utm_campaign,
      trafficTerm: utm_term,
      trafficContent: utm_content,
      referrerDomain: refDomain,
      sourceLabel,
    };
  }

  // 没有 UTM，根据 referrer 判断
  if (!referrer) {
    return {
      channel: "direct",
      trafficSource: undefined,
      trafficMedium: "direct",
      trafficCampaign: undefined,
      trafficTerm: undefined,
      trafficContent: undefined,
      referrerDomain: undefined,
      sourceLabel: "direct",
    };
  }

  // 搜索引擎
  const se = searchEngines.find(se => refDomain && se.hostIncludes.test(refDomain));
  if (se) {
    return {
      channel: "organic",
      trafficSource: se.name,
      trafficMedium: "organic",
      trafficCampaign: undefined,
      trafficTerm: undefined, // 搜索词不从 referrer 解析
      trafficContent: undefined,
      referrerDomain: refDomain,
      sourceLabel: se.name,
    };
  }

  // 社交
  if (refDomain && socialHosts.test(refDomain)) {
    return {
      channel: "social",
      trafficSource: refDomain,
      trafficMedium: "social",
      trafficCampaign: undefined,
      trafficTerm: undefined,
      trafficContent: undefined,
      referrerDomain: refDomain,
      sourceLabel: `social:${refDomain}`,
    };
  }

  // 其他引荐
  return {
    channel: "referral",
    trafficSource: refDomain,
    trafficMedium: "referral",
    trafficCampaign: undefined,
    trafficTerm: undefined,
    trafficContent: undefined,
    referrerDomain: refDomain,
    sourceLabel: refDomain ? `referral:${refDomain}` : "referral",
  };
}

function now(): number { return Date.now(); }

function buildBaseEvent(eventType: XDEventType): XDBaseEvent {
  const ua = isBrowser ? navigator.userAgent : "";
  const referrer = isBrowser ? document.referrer || undefined : undefined;
  const href = isBrowser ? window.location.href : undefined;
  const classification = trackerOptions?.autoDetectSource ? classifyTraffic(referrer, href, !!trackerOptions?.preferUTM) : {
    channel: "unknown" as XDBaseEvent["channel"],
    trafficSource: undefined,
    trafficMedium: undefined,
    trafficCampaign: undefined,
    trafficTerm: undefined,
    trafficContent: undefined,
    referrerDomain: getDomainFromUrl(referrer),
    sourceLabel: "unknown",
  };
  return {
    eventType,
    timestamp: now(),
    source: (trackerOptions?.source && trackerOptions.source.trim()) ? trackerOptions.source : classification.sourceLabel,
    referrer,
    deviceType: ua ? getDeviceType(ua) : undefined,
    os: ua ? getOS(ua) : undefined,
    browser: ua ? getBrowser(ua) : undefined,
    pageTitle: isBrowser ? document.title : undefined,
    pageURL: href,
    userId: persistedUserId || "",
    businessId: undefined,
    channel: classification.channel,
    trafficSource: classification.trafficSource,
    trafficMedium: classification.trafficMedium,
    trafficCampaign: classification.trafficCampaign,
    trafficTerm: classification.trafficTerm,
    trafficContent: classification.trafficContent,
    referrerDomain: classification.referrerDomain,
  };
}

async function sendEvent(event: XDEvent, useBeacon = false): Promise<void> {
  if (!trackerOptions) return;
  const endpoint = trackerOptions.endpoint;
  const headers = {
    "Content-Type": "application/json",
    ...(await trackerOptions.getAuthHeaders()),
  } as Record<string, string>;

  const payload = JSON.stringify(event);

  if (useBeacon && isBrowser && "sendBeacon" in navigator) {
    try {
      const blob = new Blob([payload], { type: "application/json" });
      (navigator as any).sendBeacon(endpoint, blob);
      return;
    } catch (_) {
      // fallback to fetch
    }
  }

  try {
    await fetch(endpoint, {
      method: "POST",
      headers,
      body: payload,
      keepalive: useBeacon, // allow sending during unload
      credentials: "include",
    });
  } catch (_) {
    // ignore failures silently
  }
}

function getClickElementInfo(target: EventTarget | null): Pick<XDClickEvent, "elementTag" | "elementId" | "elementClasses" | "elementText" | "href"> {
  let element: Element | null = null;
  if (target instanceof Element) {
    element = target;
  } else if ((target as any)?.parentElement) {
    element = (target as any).parentElement as Element;
  }
  if (!element) return {};
  const anchor = element.closest("a[href]") as HTMLAnchorElement | null;
  const href = anchor?.getAttribute("href") || undefined;
  const text = (anchor || element).textContent?.trim() || undefined;
  return {
    elementTag: (element as HTMLElement).tagName?.toLowerCase(),
    elementId: (element as HTMLElement).id || undefined,
    elementClasses: (element as HTMLElement).className ? String((element as HTMLElement).className) : undefined,
    elementText: text,
    href,
  };
}

function onClick(ev: MouseEvent): void {
  if (!trackerEnabled || !trackerOptions || !trackerOptions.trackClicks) return;
  const businessIdSource = trackerOptions.businessId;
  const base = buildBaseEvent("Click");
  resolveBusinessId(businessIdSource).then((businessId) => {
    const info = getClickElementInfo(ev.target);
    const event: XDClickEvent = { ...base, eventType: "Click", businessId, ...info };
    void sendEvent(event);
  });
}

function computeScrollDepthPercent(): number {
  if (!isBrowser) return 0;
  const body = document.documentElement || document.body;
  const scrollTop = window.pageYOffset || body.scrollTop || 0;
  const viewportHeight = window.innerHeight || body.clientHeight || 0;
  const docHeight = Math.max(
    body.scrollHeight,
    body.offsetHeight,
    body.clientHeight
  );
  if (docHeight <= 0) return 0;
  const maxVisible = Math.min(scrollTop + viewportHeight, docHeight);
  const percent = Math.max(0, Math.min(100, Math.round((maxVisible / docHeight) * 100)));
  return percent;
}

let scrollDepthRaf = 0;
function onScroll(): void {
  if (!trackerEnabled || !trackerOptions || !trackerOptions.trackScrollDepth) return;
  if (scrollDepthRaf) return;
  scrollDepthRaf = requestAnimationFrame(() => {
    scrollDepthRaf = 0;
    const newDepth = computeScrollDepthPercent();
    const oldDepth = maxScrollDepthPercent;
    maxScrollDepthPercent = Math.max(maxScrollDepthPercent, newDepth);
    
    // 如果达到了新的阈值，上报滚动深度事件
    if (maxScrollDepthPercent > oldDepth) {
      // 再次检查 trackerOptions，因为可能在异步操作中已经被清除
      if (!trackerOptions) return;
      
      const thresholds = trackerOptions.scrollThresholds;
      const reachedThreshold = thresholds.find(t => oldDepth < t && maxScrollDepthPercent >= t);
      
      if (reachedThreshold) {
        const base = buildBaseEvent("ScrollDepth");
        const businessIdSource = trackerOptions.businessId;
        resolveBusinessId(businessIdSource).then((businessId) => {
          const event: XDScrollDepthEvent = { 
            ...base, 
            eventType: "ScrollDepth", 
            businessId, 
            maxDepthPercent: maxScrollDepthPercent
          };
          void sendEvent(event);
        });
      }
    }
  });
}

function startPageTimers(): void {
  currentPageStartTime = now();
  maxScrollDepthPercent = computeScrollDepthPercent();
}

function getCurrentDwellMs(): number {
  return Math.max(0, now() - currentPageStartTime);
}

function onPageView(): void {
  if (!trackerEnabled || !trackerOptions) return;
  const base = buildBaseEvent("PageView");
  const businessIdSource = trackerOptions.businessId;
  resolveBusinessId(businessIdSource).then((businessId) => {
    const event: XDPageViewEvent = { 
      ...base, 
      eventType: "PageView", 
      businessId,
      isFirstVisit
    };
    void sendEvent(event);
  });
}

function onPageLeave(useBeacon = true): void {
  if (!trackerEnabled || !trackerOptions) return;
  
  // 发送 PageLeave 事件，包含停留时间和最大滚动深度
  const dwellTimeMs = getCurrentDwellMs();
  const currentScrollDepth = Math.max(maxScrollDepthPercent, computeScrollDepthPercent());
  
  const baseLeave = buildBaseEvent("PageLeave");
  const businessIdSource = trackerOptions.businessId;
  resolveBusinessId(businessIdSource).then((businessId) => {
    const leaveEvent: XDPageLeaveEvent = { 
      ...baseLeave, 
      eventType: "PageLeave", 
      businessId,
      maxScrollDepth: currentScrollDepth,
      dwellTimeMs
    };
    void sendEvent(leaveEvent, useBeacon);
  });
}

function listenToRouteChanges(): void {
  // popstate
  const onPop = () => {
    onPageLeave(false);
    startPageTimers();
    onPageView();
  };
  window.addEventListener("popstate", onPop);
  removeListeners.push(() => window.removeEventListener("popstate", onPop));

  // pushState / replaceState
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function(...args: any[]) {
    onPageLeave(false);
    origPush.apply(history, args as any);
    startPageTimers();
    onPageView();
  } as any;
  history.replaceState = function(...args: any[]) {
    onPageLeave(false);
    origReplace.apply(history, args as any);
    startPageTimers();
    onPageView();
  } as any;
  removeListeners.push(() => { history.pushState = origPush; });
  removeListeners.push(() => { history.replaceState = origReplace; });
}

function addCoreListeners(): void {
  // Clicks
  const clickHandler = (e: MouseEvent) => onClick(e);
  document.addEventListener("click", clickHandler, { capture: true, passive: true } as any);
  removeListeners.push(() => document.removeEventListener("click", clickHandler, { capture: true } as any));

  // Scroll depth
  const scrollHandler = () => onScroll();
  window.addEventListener("scroll", scrollHandler, { passive: true } as any);
  window.addEventListener("resize", scrollHandler);
  removeListeners.push(() => window.removeEventListener("scroll", scrollHandler));
  removeListeners.push(() => window.removeEventListener("resize", scrollHandler));

  // Page leave
  const leaveHandler = () => onPageLeave(true);
  window.addEventListener("beforeunload", leaveHandler);
  window.addEventListener("pagehide", leaveHandler);
  removeListeners.push(() => window.removeEventListener("beforeunload", leaveHandler));
  removeListeners.push(() => window.removeEventListener("pagehide", leaveHandler));

  // Visibility -> treat hidden as potential leave to record dwell time more accurately
  const visHandler = () => {
    if (document.hidden) onPageLeave(false);
  };
  document.addEventListener("visibilitychange", visHandler);
  removeListeners.push(() => document.removeEventListener("visibilitychange", visHandler));

  // Route changes
  listenToRouteChanges();
}

export async function enableAutoTracker(options: AutoTrackerOptions): Promise<void> {
  if (!isBrowser) return;
  trackerOptions = getDefaultedOptions(options);
  persistedUserId = ensureUserId(trackerOptions.storageKeyUserId, trackerOptions.userId);
  isFirstVisit = checkFirstVisit(trackerOptions.storageKeyFirstVisit);
  trackerEnabled = true;

  startPageTimers();
  onPageView();
  addCoreListeners();
}

export function disableAutoTracker(): void {
  trackerEnabled = false;
  for (const fn of removeListeners.splice(0, removeListeners.length)) {
    try { fn(); } catch (_) {}
  }
}

export function setUserId(userId: string): void {
  if (!trackerOptions) return;
  persistedUserId = ensureUserId(trackerOptions.storageKeyUserId, userId);
}

export function setBusinessId(businessId: string): void {
  if (!trackerOptions) return;
  trackerOptions.businessId = businessId as any;
}

export async function trackEvent(eventType: XDEventType, extra?: Record<string, any>): Promise<void> {
  if (!trackerOptions) return;
  const base = buildBaseEvent(eventType);
  const businessId = await resolveBusinessId(trackerOptions.businessId);
  
  let event: XDEvent;
  
  switch(eventType) {
    case "PageView":
      event = { ...base, eventType, businessId, ...extra } as XDPageViewEvent;
      break;
    case "PageLeave":
      event = { 
        ...base, 
        eventType, 
        businessId, 
        maxScrollDepth: (extra?.maxScrollDepth as number) ?? Math.max(maxScrollDepthPercent, computeScrollDepthPercent()),
        dwellTimeMs: (extra?.dwellTimeMs as number) ?? getCurrentDwellMs(),
        ...extra 
      } as XDPageLeaveEvent;
      break;
    case "ScrollDepth":
      event = { 
        ...base, 
        eventType, 
        businessId, 
        maxDepthPercent: (extra?.maxDepthPercent as number) ?? Math.max(maxScrollDepthPercent, computeScrollDepthPercent()),
        ...extra 
      } as XDScrollDepthEvent;
      break;
    case "Click":
      event = { ...base, eventType, businessId, ...extra } as XDClickEvent;
      break;
    default:
      event = { ...base, eventType, businessId } as XDEvent;
  }

  await sendEvent(event);
} 