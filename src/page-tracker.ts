// Simple page tracking implementation

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
  // 用户活跃检测相关配置
  trackUserActivity?: boolean;
  inactivityThreshold?: number; // 用户不活跃阈值（毫秒），默认5分钟
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
  private eventHandlers: Array<(event: PageViewEvent, eventType: string) => void> = [];
  
  // 用户活跃检测相关属性
  private lastActivityTime: number;
  private isPageVisible: boolean;
  private isUserActive: boolean;
  private activityCheckTimer: NodeJS.Timeout | null = null;

  constructor(page: string, options: PageViewTrackerOptions = {}) {
    this.currentPage = page;
    this.startTime = Date.now();
    this.lastActivityTime = this.startTime;
    this.isPageVisible = !document.hidden;
    this.isUserActive = true;
    
    this.options = {
      trackOnUnload: true,
      trackOnVisibilityChange: true,
      minDuration: 1000,
      maxDuration: 300000,
      heartbeatInterval: 30000,
      customProperties: {},
      trackUserActivity: true,
      inactivityThreshold: 300000, // 5分钟
      ...options,
    };
  }

  /**
   * 添加事件处理器，用于接收页面停留时间事件
   */
  addEventListener(handler: (event: PageViewEvent, eventType: string) => void): void {
    this.eventHandlers.push(handler);
  }

  /**
   * 移除事件处理器
   */
  removeEventListener(handler: (event: PageViewEvent, eventType: string) => void): void {
    this.eventHandlers = this.eventHandlers.filter(h => h !== handler);
  }

  start(): void {
    if (this.isTracking) return;

    this.isTracking = true;
    this.startTime = Date.now();
    this.lastHeartbeatTime = this.startTime;
    this.lastActivityTime = this.startTime;

    if (this.options.trackOnUnload) {
      this.setupUnloadListener();
    }

    if (this.options.trackOnVisibilityChange) {
      this.setupVisibilityChangeListener();
    }

    // 如果启用了用户活跃检测，则设置相关监听器
    if (this.options.trackUserActivity) {
      this.setupUserActivityListener();
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
    
    // 只有在用户活跃时才上报停留时间
    if (this.shouldReportDuration()) {
      const duration = this.calculateDuration();
      this.trackPageView(duration);
    }
    
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
    isUserActive: boolean;
    isPageVisible: boolean;
  } {
    return {
      isTracking: this.isTracking,
      currentPage: this.currentPage,
      startTime: this.startTime,
      currentDuration: this.calculateDuration(),
      totalVisibleTime: this.totalVisibleTime,
      isUserActive: this.isUserActive,
      isPageVisible: this.isPageVisible,
    };
  }

  // 检查是否应该上报停留时间
  private shouldReportDuration(): boolean {
    // 如果页面不可见，则不上报
    if (!this.isPageVisible) {
      return false;
    }
    
    // 如果启用了用户活跃检测，且用户不活跃，则不上报
    if (this.options.trackUserActivity && !this.isUserActive) {
      return false;
    }
    
    return true;
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
      this.isPageVisible = !document.hidden;
      
      if (document.hidden) {
        if (this.lastVisibilityChangeTime) {
          this.totalVisibleTime += now - this.lastVisibilityChangeTime;
        }
        this.lastVisibilityChangeTime = null;
      } else {
        this.lastVisibilityChangeTime = now;
        // 页面重新可见时更新活动时间
        this.lastActivityTime = now;
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
  }

  // 设置用户活跃检测监听器
  private setupUserActivityListener(): void {
    const handleUserActivity = () => {
      this.lastActivityTime = Date.now();
      this.isUserActive = true;
    };

    // 监听用户交互事件
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      document.addEventListener(event, handleUserActivity, { passive: true });
    });

    // 定期检查用户是否活跃
    this.activityCheckTimer = setInterval(() => {
      const now = Date.now();
      const inactivityTime = now - this.lastActivityTime;
      
      // 如果用户超过设定的不活跃阈值，则标记为不活跃
      if (inactivityTime > (this.options.inactivityThreshold || 300000)) {
        this.isUserActive = false;
      }
    }, 1000); // 每秒检查一次
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
    
    if (this.activityCheckTimer) {
      clearInterval(this.activityCheckTimer);
      this.activityCheckTimer = null;
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

    // 只有在用户活跃时才上报停留时间
    if (!this.shouldReportDuration()) {
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

    // 触发所有注册的事件处理器
    this.eventHandlers.forEach(handler => {
      try {
        handler(event, eventType);
      } catch (e) {
        console.error('Error in page view event handler:', e);
      }
    });
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
    trackUserActivity: true,  // 启用用户活跃检测
    inactivityThreshold: 300000, // 5分钟不活跃阈值
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

/**
 * 添加页面停留时间事件监听器
 */
export function addPageViewEventListener(handler: (event: PageViewEvent, eventType: string) => void): void {
  if (globalPageTracker) {
    globalPageTracker.addEventListener(handler);
  }
}

/**
 * 移除页面停留时间事件监听器
 */
export function removePageViewEventListener(handler: (event: PageViewEvent, eventType: string) => void): void {
  if (globalPageTracker) {
    globalPageTracker.removeEventListener(handler);
  }
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