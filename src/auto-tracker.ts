/*
  Auto Tracker: capture PageView, PageLeave, ScrollDepth, Click events
  - PageView: 首次进入系统时采集来源(source)
  - PageLeave: 离开页面时汇总上报最大滚动深度和停留时间
  - ScrollDepth: 记录滚动深度
  - Click: 记录点击事件
*/

const isBrowser =
  typeof window !== "undefined" && typeof document !== "undefined";

export type XDEventType =
  | "PageView" // 页面访问
  | "PageLeave" // 页面离开
  | "ScrollDepth" // 页面滚动深度
  | "Click" // 点击行为
  | "ViewProduct" // 查看商品
  | "AddToCart" // 加入购物车
  | "RemoveFromCart" // 从购物车移除
  | "StartCheckout" // 开始结账
  | "CompletePurchase" // 完成购买
  | "UserRegister" // 用户注册
  | "UserLogin" // 用户登录
  | "SubmitForm" // 提交表单
  | "Search"; // 执行搜索;

export interface XDBaseEvent {
  eventType: XDEventType;
  timestamp: number; // ms
  source?: string; // 自定义来源或自动识别（direct/google/referral:example.com/social:twitter 等）
  referrer?: string;
  deviceType?: string; // desktop | mobile | tablet | bot | unknown
  os?: string; // Windows 10 / macOS 13.1 / iOS 15.4 / Android 12 / Linux / Unknown
  browser?: string; // Chrome 98.0 / Safari 15.4 / Firefox 97.0 / Edge 99.0 / IE 11.0 / Unknown
  pageTitle?: string;
  pageURL?: string;
  sessionId: string;
  businessId?: string;
  // IP 和地理位置信息（通常由服务端填充或通过配置提供）
  // ip?: string; // IP 地址
  // country?: string; // 国家
  // city?: string; // 城市
  // 自动识别的流量信息（若可得）
  channel?:
    | "direct"
    | "organic"
    | "paid"
    | "social"
    | "referral"
    | "email"
    | "unknown";
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
  // href?: string;
}

export interface AlinzeEvent extends XDBaseEvent {
  eventType: XDEventType;
}

export interface Event extends XDBaseEvent {
  eventType: "Click";
  elementTag?: string;
  elementId?: string;
  elementClasses?: string;
  elementText?: string;
  // href?: string;
}

export type XDEvent =
  | XDPageViewEvent
  | XDPageLeaveEvent
  | XDScrollDepthEvent
  | XDClickEvent
  | AlinzeEvent;

// 用户属性接口
export interface UserProperties {
  id?: string;
  email?: string;
  phone?: string;
  userName?: string;
  [key: string]: any; // 允许其他自定义属性
}

export interface AutoTrackerOptions {
  endpoint: string; // API 接口地址
  source?: string; // 自定义来源，作为基础字段之一，若不提供则自动识别
  businessId?: string | (() => string | Promise<string>);
  getAuthHeaders?: () =>
    | Record<string, string>
    | Promise<Record<string, string>>;
  sessionId?: string; // 如果不传，则生成 uuid 并持久化
  storageKeyUserId?: string; // 默认 "user_id"
  storageKeyFirstVisit?: string; // 默认 "xd_first_visit"
  userProperties?: UserProperties; // 用户属性
  trackClicks?: boolean; // 默认 true
  trackScrollDepth?: boolean; // 默认 true
  scrollThresholds?: number[]; // 默认 [25, 50, 75, 90, 100]
  autoDetectSource?: boolean; // 默认 true，自动识别 direct/organic/social/paid/referral
  preferUTM?: boolean; // 默认 true，若有 UTM 则优先使用 UTM
  // 地理位置信息（由服务端提供或注入）
  geoInfo?: {
    ip?: string;
    country?: string;
    city?: string;
  };
}

let trackerEnabled = false;
let trackerOptions: Required<AutoTrackerOptions> | null = null;
let persistedUserId: string | null = null;
let userProperties: UserProperties = {};
let currentPageStartTime = 0;
let maxScrollDepthPercent = 0;
let isFirstVisit = false;

// For cleanup
let removeListeners: Array<() => void> = [];
// 防止重复绑定的标记
let boundEvents: Set<string> = new Set();
// 初始化计数，用于追踪初始化次数
let initCount = 0;

function getDefaultedOptions(
  options: AutoTrackerOptions
): Required<AutoTrackerOptions> {
  return {
    endpoint: options.endpoint,
    source: options.source || undefined,
    businessId: options.businessId ?? undefined,
    getAuthHeaders: options.getAuthHeaders || (async () => ({})),
    sessionId: options.sessionId || "",
    storageKeyUserId: options.storageKeyUserId || "user_id",
    storageKeyFirstVisit: options.storageKeyFirstVisit || "xd_first_visit",
    userProperties: options.userProperties || {},
    trackClicks: options.trackClicks ?? true,
    trackScrollDepth: options.trackScrollDepth ?? true,
    scrollThresholds: options.scrollThresholds || [25, 50, 75, 90, 100],
    autoDetectSource: options.autoDetectSource ?? true,
    preferUTM: options.preferUTM ?? true,
    geoInfo: options.geoInfo || {},
  } as Required<AutoTrackerOptions>;
}

function generateUUID(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try {
      return (crypto as any).randomUUID();
    } catch (_) {}
  }
  const tpl = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return tpl.replace(/[xy]/g, (c) => {
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

function getOSVersion(ua: string): string {
  // Windows
  const windowsMatch = ua.match(/Windows NT (\d+\.\d+)/i);
  if (windowsMatch) {
    const versionMap: Record<string, string> = {
      "10.0":
        ua.indexOf("Windows NT 10.0") !== -1 &&
        // Windows 11 特征检测
        (ua.indexOf("Windows 11") !== -1 || // 一些新版浏览器直接报告 Windows 11
          (ua.indexOf("Win64; x64") !== -1 &&
            // Chrome 在 Windows 11 上的版本通常较高
            ((/Chrome\/([0-9]+)/.test(ua) && parseInt(RegExp.$1, 10) >= 94) ||
              // Firefox 在 Windows 11 上的版本通常较高
              (/Firefox\/([0-9]+)/.test(ua) && parseInt(RegExp.$1, 10) >= 94) ||
              // Edge 在 Windows 11 上的版本通常较高
              (/Edg\/([0-9]+)/.test(ua) && parseInt(RegExp.$1, 10) >= 94))))
          ? "11"
          : "10",
      "6.3": "8.1",
      "6.2": "8",
      "6.1": "7",
      "6.0": "Vista",
      "5.2": "XP x64",
      "5.1": "XP",
      "5.0": "2000",
    };
    return versionMap[windowsMatch[1]] || windowsMatch[1];
  }

  // macOS
  const macMatch = ua.match(/Mac OS X (\d+[._]\d+[._]?\d*)/i);
  if (macMatch) {
    return macMatch[1].replace(/_/g, ".");
  }

  // iOS
  const iosMatch = ua.match(/OS (\d+[._]\d+[._]?\d*) like Mac OS X/i);
  if (iosMatch) {
    return iosMatch[1].replace(/_/g, ".");
  }

  // Android
  const androidMatch = ua.match(/Android (\d+\.\d+(\.\d+)?)/i);
  if (androidMatch) {
    return androidMatch[1];
  }

  return "";
}

function getBrowser(ua: string): string {
  if (/edg\//i.test(ua)) return "Edge";
  if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) return "Chrome";
  if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) return "Safari";
  if (/firefox\//i.test(ua)) return "Firefox";
  if (/msie|trident/i.test(ua)) return "IE";
  return "Unknown";
}

function getBrowserVersion(ua: string, browser: string): string {
  let match;

  // 如果浏览器未知，则不尝试获取版本
  if (!browser || browser === "Unknown") {
    return "";
  }

  switch (browser) {
    case "Edge":
      match = ua.match(/Edg\/([\d.]+)/i);
      break;
    case "Chrome":
      match = ua.match(/Chrome\/([\d.]+)/i);
      break;
    case "Safari":
      match = ua.match(/Version\/([\d.]+)/i);
      break;
    case "Firefox":
      match = ua.match(/Firefox\/([\d.]+)/i);
      break;
    case "IE":
      match = ua.match(/(?:MSIE |rv:)([\d.]+)/i);
      break;
  }

  return match ? match[1] : "";
}

async function resolveBusinessId(
  biz: Required<AutoTrackerOptions>["businessId"]
): Promise<string | undefined> {
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

function classifyTraffic(
  referrer: string | undefined,
  href: string | undefined,
  preferUTM: boolean
): {
  channel: XDBaseEvent["channel"];
  trafficSource?: string;
  trafficMedium?: string;
  trafficCampaign?: string;
  trafficTerm?: string;
  trafficContent?: string;
  referrerDomain?: string;
  sourceLabel: string; // 用于回填 base.source
} {
  const params = getSearchParams(
    href || (isBrowser ? window.location.href : undefined)
  );
  const utm_source = params?.get("utm_source") || undefined;
  const utm_medium = params?.get("utm_medium") || undefined;
  const utm_campaign = params?.get("utm_campaign") || undefined;
  const utm_term = params?.get("utm_term") || undefined;
  const utm_content = params?.get("utm_content") || undefined;
  const gclid = params?.get("gclid") || undefined;
  const fbclid = params?.get("fbclid") || undefined;
  const msclkid = params?.get("msclkid") || undefined;

  const searchEngines: Array<{
    hostIncludes: RegExp;
    name: string;
    qParams: string[];
  }> = [
    { hostIncludes: /google\./i, name: "google", qParams: ["q"] },
    { hostIncludes: /bing\./i, name: "bing", qParams: ["q"] },
    { hostIncludes: /yahoo\./i, name: "yahoo", qParams: ["p", "q"] },
    { hostIncludes: /baidu\./i, name: "baidu", qParams: ["wd", "word"] },
    { hostIncludes: /duckduckgo\./i, name: "duckduckgo", qParams: ["q"] },
    { hostIncludes: /yandex\./i, name: "yandex", qParams: ["text"] },
    { hostIncludes: /naver\./i, name: "naver", qParams: ["query"] },
  ];
  const socialHosts =
    /facebook\.com|fb\.com|x\.com|twitter\.com|t\.co|linkedin\.com|instagram\.com|pinterest\.com|reddit\.com|weibo\.com|zhihu\.com|douyin\.com|tiktok\.com/i;

  const refDomain = getDomainFromUrl(referrer);

  // 优先 UTM
  if (preferUTM && (utm_source || utm_medium || utm_campaign)) {
    let channel: XDBaseEvent["channel"] = "unknown";
    const mediumLower = (utm_medium || "").toLowerCase();
    if (
      /^(cpc|ppc|paidsearch|paid|cpv|cpa|cpm|display)$/.test(mediumLower) ||
      gclid ||
      msclkid
    ) {
      channel = "paid";
    } else if (
      /^(social|social-network|social-media|sm|paid_social)$/.test(
        mediumLower
      ) ||
      fbclid
    ) {
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
      trafficMedium:
        utm_medium || (channel === "paid" ? "paid" : channel || undefined),
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
  const se = searchEngines.find(
    (se) => refDomain && se.hostIncludes.test(refDomain)
  );
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

function now(): number {
  return Date.now();
}

function buildBaseEvent(eventType: XDEventType): XDBaseEvent {
  const ua = isBrowser ? navigator.userAgent : "";
  const referrer = isBrowser ? document.referrer || undefined : undefined;
  const href = isBrowser ? window.location.href : undefined;
  const classification = trackerOptions?.autoDetectSource
    ? classifyTraffic(referrer, href, !!trackerOptions?.preferUTM)
    : {
        channel: "unknown" as XDBaseEvent["channel"],
        trafficSource: undefined,
        trafficMedium: undefined,
        trafficCampaign: undefined,
        trafficTerm: undefined,
        trafficContent: undefined,
        referrerDomain: getDomainFromUrl(referrer),
        sourceLabel: "unknown",
      };

  // 获取操作系统和浏览器信息
  let osInfo = undefined;
  let browserInfo = undefined;

  if (ua) {
    const osName = getOS(ua);
    const osVer = osName !== "Unknown" ? getOSVersion(ua) : "";
    osInfo = osVer ? `${osName} ${osVer}` : osName;

    const browserName = getBrowser(ua);
    const browserVer =
      browserName !== "Unknown" ? getBrowserVersion(ua, browserName) : "";
    browserInfo = browserVer ? `${browserName} ${browserVer}` : browserName;
  }

  // 获取地理位置信息
  const geoInfo = trackerOptions?.geoInfo || {};

  // 基础事件对象
  const baseEvent: XDBaseEvent = {
    eventType,
    timestamp: now(),
    source:
      trackerOptions?.source && trackerOptions.source.trim()
        ? trackerOptions.source
        : classification.sourceLabel,
    referrer,
    deviceType: ua ? getDeviceType(ua) : undefined,
    os: osInfo,
    browser: browserInfo,
    pageTitle: isBrowser ? document.title : undefined,
    pageURL: href,
    sessionId: persistedUserId || "",
    businessId:
      typeof trackerOptions?.businessId === "string"
        ? trackerOptions.businessId
        : undefined,
    // ip: geoInfo.ip,
    // country: geoInfo.country,
    // city: geoInfo.city,
    // channel: classification.channel,
    // trafficSource: classification.trafficSource,
    // trafficMedium: classification.trafficMedium,
    // trafficCampaign: classification.trafficCampaign,
    // trafficTerm: classification.trafficTerm,
    // trafficContent: classification.trafficContent,
    // referrerDomain: classification.referrerDomain,
  };

  return baseEvent;
}

async function sendEvent(event: XDEvent, useBeacon = false): Promise<void> {
  if (!trackerOptions) return;
  const endpoint = trackerOptions.endpoint;
  const headers = {
    "Content-Type": "application/json",
    ...(await trackerOptions.getAuthHeaders()),
  } as Record<string, string>;

  // 添加用户属性到事件中
  const eventWithUserProps = {
    ...event,
    ...userProperties,
  };

  const payload = JSON.stringify({
    eventName: eventWithUserProps.eventType,
    properties: eventWithUserProps,
    timestamp: eventWithUserProps.timestamp,
    userEmail: eventWithUserProps?.email ?? undefined,
    userId: eventWithUserProps?.id ?? undefined,
    userName: eventWithUserProps?.userName ?? undefined,
    sessionId: eventWithUserProps.sessionId,
  });

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
      // credentials: "include",
    });
  } catch (_) {
    // ignore failures silently
  }
}

function getClickElementInfo(
  target: EventTarget | null
): Pick<
  XDClickEvent,
  "elementTag" | "elementId" | "elementClasses" | "elementText"
> {
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
    elementClasses: (element as HTMLElement).className
      ? String((element as HTMLElement).className)
      : undefined,
    elementText: text,
  };
}

function onClick(ev: MouseEvent): void {
  if (!trackerEnabled || !trackerOptions || !trackerOptions.trackClicks) return;
  const businessIdSource = trackerOptions.businessId;
  const base = buildBaseEvent("Click");
  resolveBusinessId(businessIdSource).then((businessId) => {
    const info = getClickElementInfo(ev.target);
    const event: XDClickEvent = {
      ...base,
      eventType: "Click",
      businessId,
      ...info,
    };
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
  const percent = Math.max(
    0,
    Math.min(100, Math.round((maxVisible / docHeight) * 100))
  );
  return percent;
}

let scrollDepthRaf = 0;
function onScroll(): void {
  if (!trackerEnabled || !trackerOptions || !trackerOptions.trackScrollDepth)
    return;
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
      const reachedThreshold = thresholds.find(
        (t) => oldDepth < t && maxScrollDepthPercent >= t
      );

      if (reachedThreshold) {
        const base = buildBaseEvent("ScrollDepth");
        const businessIdSource = trackerOptions.businessId;
        resolveBusinessId(businessIdSource).then((businessId) => {
          const event: XDScrollDepthEvent = {
            ...base,
            eventType: "ScrollDepth",
            businessId,
            maxDepthPercent: maxScrollDepthPercent,
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
      isFirstVisit,
    };
    void sendEvent(event);
  });
}

function onPageLeave(useBeacon = true): void {
  if (!trackerEnabled || !trackerOptions) return;

  // 发送 PageLeave 事件，包含停留时间和最大滚动深度
  const dwellTimeMs = getCurrentDwellMs();
  const currentScrollDepth = Math.max(
    maxScrollDepthPercent,
    computeScrollDepthPercent()
  );

  const baseLeave = buildBaseEvent("PageLeave");
  const businessIdSource = trackerOptions.businessId;
  resolveBusinessId(businessIdSource).then((businessId) => {
    const leaveEvent: XDPageLeaveEvent = {
      ...baseLeave,
      eventType: "PageLeave",
      businessId,
      maxScrollDepth: currentScrollDepth,
      dwellTimeMs,
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

  // 只有在尚未修改 history 方法时才替换它们
  if (history.pushState === origPush) {
    history.pushState = function (...args: any[]) {
      onPageLeave(false);
      origPush.apply(history, args as any);
      startPageTimers();
      onPageView();
    } as any;
    removeListeners.push(() => {
      history.pushState = origPush;
    });
  }

  // 只有在尚未修改 history 方法时才替换它们
  if (history.replaceState === origReplace) {
    history.replaceState = function (...args: any[]) {
      onPageLeave(false);
      origReplace.apply(history, args as any);
      startPageTimers();
      onPageView();
    } as any;
    removeListeners.push(() => {
      history.replaceState = origReplace;
    });
  }
}

function onUserRegister(): void {
  if (!trackerEnabled || !trackerOptions || !trackerOptions.trackClicks) return;
  const businessIdSource = trackerOptions.businessId;
  const base = buildBaseEvent("Click");
  resolveBusinessId(businessIdSource).then((businessId) => {});
}

function addCoreListeners(): void {
  // Clicks
  if (!boundEvents.has("click")) {
    const clickHandler = (e: MouseEvent) => onClick(e);
    document.addEventListener("click", clickHandler, {
      capture: true,
      passive: true,
    } as any);
    removeListeners.push(() =>
      document.removeEventListener("click", clickHandler, {
        capture: true,
      } as any)
    );
    boundEvents.add("click");
  }

  // Scroll depth
  if (!boundEvents.has("scroll")) {
    const scrollHandler = () => onScroll();
    window.addEventListener("scroll", scrollHandler, { passive: true } as any);
    window.addEventListener("resize", scrollHandler);
    removeListeners.push(() =>
      window.removeEventListener("scroll", scrollHandler)
    );
    removeListeners.push(() =>
      window.removeEventListener("resize", scrollHandler)
    );
    boundEvents.add("scroll");
  }

  // Page leave
  if (!boundEvents.has("unload")) {
    const leaveHandler = () => onPageLeave(true);
    window.addEventListener("beforeunload", leaveHandler);
    window.addEventListener("pagehide", leaveHandler);
    removeListeners.push(() =>
      window.removeEventListener("beforeunload", leaveHandler)
    );
    removeListeners.push(() =>
      window.removeEventListener("pagehide", leaveHandler)
    );
    boundEvents.add("unload");
  }

  // Visibility -> treat hidden as potential leave to record dwell time more accurately
  if (!boundEvents.has("visibility")) {
    const visHandler = () => {
      if (document.hidden) onPageLeave(false);
    };
    document.addEventListener("visibilitychange", visHandler);
    removeListeners.push(() =>
      document.removeEventListener("visibilitychange", visHandler)
    );
    boundEvents.add("visibility");
  }

  // Route changes
  if (!boundEvents.has("route")) {
    listenToRouteChanges();
    boundEvents.add("route");
  }
}

export async function enableAutoTracker(
  options: AutoTrackerOptions
): Promise<void> {
  if (!isBrowser) return;

  // 如果已经启用，先清理之前的状态（但保留已绑定的事件）
  if (trackerEnabled) {
    console.log("[XD-Tracker] 重新初始化，保留已绑定事件");
    // 保留事件绑定，但清理其他状态
    trackerEnabled = false;
    // 执行清理但不重置 boundEvents
  }

  // 增加初始化计数
  initCount++;

  trackerOptions = getDefaultedOptions(options);
  persistedUserId = ensureUserId(
    trackerOptions.storageKeyUserId,
    trackerOptions.sessionId
  );
  userProperties = { ...trackerOptions.userProperties };
  isFirstVisit = checkFirstVisit(trackerOptions.storageKeyFirstVisit);
  trackerEnabled = true;

  startPageTimers();
  onPageView();
  addCoreListeners();

  console.log(
    `[XD-Tracker] 已启用 (初始化次数: ${initCount}, 已绑定事件: ${Array.from(
      boundEvents
    ).join(", ")})`
  );
}

export function disableAutoTracker(fullReset?: boolean): void {
  trackerEnabled = false;

  // 执行所有清理函数，但保留绑定事件的记录
  for (const fn of removeListeners.splice(0, removeListeners.length)) {
    try {
      fn();
    } catch (_) {}
  }

  // 清空绑定事件记录（完全重置）
  if (fullReset === true) {
    boundEvents.clear();
    initCount = 0;
    console.log("[XD-Tracker] 已完全禁用并重置事件绑定");
  } else {
    console.log("[XD-Tracker] 已禁用，但保留事件绑定记录");
  }
}

/**
 * 获取跟踪器当前状态
 */
export function getTrackerStatus(): {
  enabled: boolean;
  boundEvents: string[];
  initCount: number;
  sessionId: string | null;
  userProperties: UserProperties;
  isFirstVisit: boolean;
} {
  return {
    enabled: trackerEnabled,
    boundEvents: Array.from(boundEvents),
    initCount,
    sessionId: persistedUserId,
    userProperties,
    isFirstVisit,
  };
}

/**
 * 重置跟踪器状态，包括所有事件绑定
 */
export function resetTracker(): void {
  disableAutoTracker(true);
}

/**
 * 识别用户并设置用户属性
 * @param businessId 业务系统ID
 * @param properties 用户属性，可包含 email、phone 等
 */
export function identify(
  businessId: string,
  properties?: UserProperties
): void {
  if (!trackerOptions) return;

  // 设置业务系统ID
  trackerOptions.businessId = businessId;

  // 更新用户属性
  if (properties) {
    userProperties = {
      ...userProperties,
      ...properties,
      id: businessId,
    };

    console.log(`[XD-Tracker] 用户已识别，业务ID: ${businessId}，属性已更新`);
  } else {
    console.log(`[XD-Tracker] 用户已识别，业务ID: ${businessId}`);
  }
}

/**
 * 重置用户信息，清除所有用户属性
 * 保留本地用户ID，但清空所有用户属性
 */
export function reset(): void {
  if (!trackerOptions) return;

  // 清空所有用户属性
  userProperties = {};

  console.log(`[XD-Tracker] 用户属性已重置，保留用户ID: ${persistedUserId}`);
}

export function setBusinessId(businessId: string): void {
  if (!trackerOptions) return;
  trackerOptions.businessId = businessId as any;
}

/**
 * 更新地理位置信息（通常由服务端提供）
 */
export function updateGeoInfo(geoInfo: {
  ip?: string;
  country?: string;
  city?: string;
}): void {
  if (!trackerOptions) return;
  trackerOptions.geoInfo = {
    ...trackerOptions.geoInfo,
    ...geoInfo,
  };
}

export async function trackEvent(
  eventType: XDEventType,
  extra?: Record<string, any>
): Promise<void> {
  if (!trackerOptions) return;
  const base = buildBaseEvent(eventType);

  // 如果 businessId 是函数，则解析它
  let businessId = base.businessId;
  if (typeof trackerOptions.businessId === "function") {
    businessId = await resolveBusinessId(trackerOptions.businessId);
  }

  let event: XDEvent;

  switch (eventType) {
    case "PageView":
      event = { ...base, eventType, businessId, ...extra } as XDPageViewEvent;
      break;
    case "PageLeave":
      event = {
        ...base,
        eventType,
        businessId,
        maxScrollDepth:
          (extra?.maxScrollDepth as number) ??
          Math.max(maxScrollDepthPercent, computeScrollDepthPercent()),
        dwellTimeMs: (extra?.dwellTimeMs as number) ?? getCurrentDwellMs(),
        ...extra,
      } as XDPageLeaveEvent;
      break;
    case "ScrollDepth":
      event = {
        ...base,
        eventType,
        businessId,
        maxDepthPercent:
          (extra?.maxDepthPercent as number) ??
          Math.max(maxScrollDepthPercent, computeScrollDepthPercent()),
        ...extra,
      } as XDScrollDepthEvent;
      break;
    case "Click":
      event = { ...base, eventType, businessId, ...extra } as XDClickEvent;
      break;
    default:
      event = { ...base, eventType, businessId };
  }

  await sendEvent(event);
}

export function capture(eventType: XDEventType, data: Record<string, string>) {
  if (eventType === "UserRegister") {
  }
}
