import posthog from "posthog-js";

const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";

export interface PageViewEvent {
  page: string;
  duration: number;
  timestamp: number;
  referrer?: string;
  userAgent?: string;
  screenResolution?: string;
}

export interface PageViewTrackerOptions {
  trackOnUnload?: boolean;
  trackOnVisibilityChange?: boolean;
  minDuration?: number;
  maxDuration?: number;
  heartbeatInterval?: number;
  customProperties?: Record<string, any>;
}

class PageViewTracker {
  private startTime: number;
  private currentPage: string;
  private options: Required<PageViewTrackerOptions>;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isTracking = false;
  private lastVisibilityChangeTime: number | null = null;
  private totalVisibleTime = 0;
  private lastHeartbeatTime = 0;

  constructor(page: string, options: PageViewTrackerOptions = {}) {
    this.currentPage = page;
    this.startTime = Date.now();
    this.options = {
      trackOnUnload: true,
      trackOnVisibilityChange: true,
      minDuration: 1000,
      maxDuration: 300000,
      heartbeatInterval: 30000,
      customProperties: {},
      ...options,
    };
  }

  start(): void {
    if (this.isTracking) return;

    this.isTracking = true;
    this.startTime = Date.now();
    this.lastHeartbeatTime = this.startTime;

    if (this.options.trackOnUnload) {
      this.setupUnloadListener();
    }

    if (this.options.trackOnVisibilityChange) {
      this.setupVisibilityChangeListener();
    }

    this.setupHeartbeat();
  }

  stop(): void {
    if (!this.isTracking) return;

    this.isTracking = false;
    this.clearTimers();

    const duration = this.calculateDuration();
    this.trackPageView(duration);
  }

  updatePage(newPage: string): void {
    if (this.currentPage === newPage) return;
    this.stop();
    this.currentPage = newPage;
    this.start();
  }

  trackCurrentDuration(): void {
    if (!this.isTracking) return;
    const duration = this.calculateDuration();
    this.trackPageView(duration);
    this.startTime = Date.now();
    this.lastHeartbeatTime = this.startTime;
  }

  getCurrentDuration(): number {
    return this.calculateDuration();
  }

  getTrackingStatus(): {
    isTracking: boolean;
    currentPage: string;
    startTime: number;
    currentDuration: number;
    totalVisibleTime: number;
  } {
    return {
      isTracking: this.isTracking,
      currentPage: this.currentPage,
      startTime: this.startTime,
      currentDuration: this.calculateDuration(),
      totalVisibleTime: this.totalVisibleTime,
    };
  }

  private setupUnloadListener(): void {
    const handleUnload = () => {
      const duration = this.calculateDuration();
      if (duration >= this.options.minDuration) {
        this.trackPageView(duration, "pageUnload");
      }
    };

    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("pagehide", handleUnload);
  }

  private setupVisibilityChangeListener(): void {
    const handleVisibilityChange = () => {
      const now = Date.now();
      if (document.hidden) {
        if (this.lastVisibilityChangeTime) {
          this.totalVisibleTime += now - this.lastVisibilityChangeTime;
        }
        this.lastVisibilityChangeTime = null;
      } else {
        this.lastVisibilityChangeTime = now;
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
  }

  private setupHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      const duration = now - this.lastHeartbeatTime;
      
      // 如果超过最大时长，停止跟踪当前页面
      if (this.options.maxDuration && duration >= this.options.maxDuration) {
        this.stop();
        return;
      }
      
      // 定期检查，如果接近最大时长，提前停止
      if (this.options.maxDuration && duration >= this.options.maxDuration * 0.9) {
        this.stop();
        return;
      }
    }, this.options.heartbeatInterval);
  }

  private clearTimers(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private calculateDuration(): number {
    const now = Date.now();
    return now - this.startTime;
  }

  private trackPageView(duration: number, eventType: string = "pageDuration"): void {
    if (duration < this.options.minDuration) return;
    
    // 如果超过最大时长，不上报
    if (this.options.maxDuration && duration > this.options.maxDuration) {
      return;
    }

    const event: PageViewEvent = {
      page: this.currentPage,
      duration,
      timestamp: Date.now(),
      referrer: document.referrer || undefined,
      userAgent: navigator.userAgent,
      screenResolution: `${screen.width}x${screen.height}`,
      ...this.options.customProperties,
    };

    try {
      posthog.capture(eventType, {
        ...event,
        page_url: window.location.href,
        page_title: document.title,
      });
    } catch (_) {
      // ignore
    }
  }

  private getSessionId(): string {
    try {
      const sessionId = (posthog as any).get_session_id?.();
      if (sessionId) return sessionId;
    } catch (_) {}
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  destroy(): void {
    this.stop();
    this.clearTimers();
  }
}

let globalPageTracker: PageViewTracker | null = null;
let autoTrackingEnabled = false;
let autoTrackingOptions: PageViewTrackerOptions = {};

// 自动开始页面停留时间跟踪
export function enableAutoPageTracking(options: PageViewTrackerOptions = {}): void {
  if (!isBrowser) return;
  
  autoTrackingEnabled = true;
  autoTrackingOptions = {
    trackOnUnload: true,
    trackOnVisibilityChange: true,
    minDuration: 1000,        // 最小停留时间 1 秒
    maxDuration: 300000,      // 最大停留时间 5 分钟
    heartbeatInterval: 30000, // 心跳间隔 30 秒
    customProperties: {},
    ...options
  };
  
  // 立即开始跟踪当前页面
  startAutoTracking();
  
  // 监听路由变化（SPA 应用）
  setupRouteChangeListener();
  
  // 监听页面可见性变化
  setupPageVisibilityListener();
  
  console.log('自动页面停留时间跟踪已启用');
}

// 停止自动页面跟踪
export function disableAutoPageTracking(): void {
  autoTrackingEnabled = false;
  
  if (globalPageTracker) {
    globalPageTracker.stop();
    globalPageTracker = null;
  }
  
  console.log('自动页面停留时间跟踪已禁用');
}

// 自动开始跟踪
function startAutoTracking(): void {
  if (!autoTrackingEnabled) return;
  
  const currentPage = window.location.pathname;
  
  if (globalPageTracker) {
    globalPageTracker.updatePage(currentPage);
  } else {
    globalPageTracker = new PageViewTracker(currentPage, autoTrackingOptions);
    globalPageTracker.start();
  }
}

// 设置路由变化监听
function setupRouteChangeListener(): void {
  if (!isBrowser) return;
  
  // 监听 popstate 事件（浏览器前进后退）
  window.addEventListener('popstate', () => {
    if (autoTrackingEnabled) {
      startAutoTracking();
    }
  });
  
  // 监听 pushstate 和 replacestate 事件（编程式路由）
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  
  history.pushState = function(...args) {
    originalPushState.apply(history, args);
    if (autoTrackingEnabled) {
      setTimeout(startAutoTracking, 0);
    }
  };
  
  history.replaceState = function(...args) {
    originalReplaceState.apply(history, args);
    if (autoTrackingEnabled) {
      setTimeout(startAutoTracking, 0);
    }
  };
}

// 设置页面可见性监听
function setupPageVisibilityListener(): void {
  if (!isBrowser) return;
  
  document.addEventListener('visibilitychange', () => {
    if (!autoTrackingEnabled || !globalPageTracker) return;
    
    if (document.hidden) {
      // 页面隐藏时，如果超过最大时长则上报
      const duration = globalPageTracker.getCurrentDuration();
      if (duration >= (autoTrackingOptions.maxDuration || 300000)) {
        globalPageTracker.trackCurrentDuration();
      }
    } else {
      // 页面显示时，重新开始计时
      startAutoTracking();
    }
  });
}

export function startPageViewTracking(
  page?: string,
  options?: PageViewTrackerOptions
): PageViewTracker {
  if (!isBrowser) {
    throw new Error("Page view tracking is only available in browser environment");
  }
  const pageName = page || window.location.pathname;
  if (globalPageTracker) {
    globalPageTracker.updatePage(pageName);
  } else {
    globalPageTracker = new PageViewTracker(pageName, options);
    globalPageTracker.start();
  }
  return globalPageTracker;
}

export function stopPageViewTracking(): void {
  if (globalPageTracker) {
    globalPageTracker.stop();
  }
}

export function trackCurrentPageDuration(): void {
  if (globalPageTracker) {
    globalPageTracker.trackCurrentDuration();
  }
}

export function getPageViewTracker(): PageViewTracker | null {
  return globalPageTracker;
}

export function getCurrentPageDuration(): number {
  return globalPageTracker?.getCurrentDuration() || 0;
}

export function getPageViewTrackingStatus() {
  return globalPageTracker?.getTrackingStatus();
} 