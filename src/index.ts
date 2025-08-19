import { startPageViewTracking, stopPageViewTracking, trackCurrentPageDuration, getPageViewTracker, getCurrentPageDuration, getPageViewTrackingStatus, enableAutoPageTracking, disableAutoPageTracking, addPageViewEventListener, removePageViewEventListener } from "./page-tracker";
import { enableAutoTracker, disableAutoTracker, identify as identifyUser, reset as resetUser, setBusinessId, trackEvent, getTrackerStatus, resetTracker, updateGeoInfo, type UserProperties } from "./auto-tracker";

// 简单的运行时守卫以避免 SSR 崩溃
const isBrowser =
  typeof window !== "undefined" && typeof document !== "undefined";

const injectedById = new Set<string>();
const injectedBySrc = new Set<string>();
const injectedByContent = new Set<string>();

export type HeadScriptAttributeValue = string | number | boolean;

export interface InjectScriptOptions {
  id?: string;
  src: string;
  attributes?: Record<string, HeadScriptAttributeValue>;
  beforeAppend?: (el: HTMLScriptElement) => void;
}

// 用独立模块替换内联的页面停留时间实现
export * from "./page-tracker";

export * from "./auto-tracker";
 
export * from "./popup";


// 组合默认导出：行为与 posthog 相同，但增加了我们的自定义方法
export type XDTracker = {
  startPageViewTracking: typeof startPageViewTracking;
  stopPageViewTracking: typeof stopPageViewTracking;
  trackCurrentPageDuration: typeof trackCurrentPageDuration;
  getPageViewTracker: typeof getPageViewTracker;
  getCurrentPageDuration: typeof getCurrentPageDuration;
  getPageViewTrackingStatus: typeof getPageViewTrackingStatus;
  addPageViewEventListener: typeof addPageViewEventListener;
  removePageViewEventListener: typeof removePageViewEventListener;
  // 自动页面跟踪方法
  enableAutoPageTracking: typeof enableAutoPageTracking;
  disableAutoPageTracking: typeof disableAutoPageTracking;
  // 新增：全量自动埋点
  enableAutoTracker: typeof enableAutoTracker;
  disableAutoTracker: typeof disableAutoTracker;
  identify: typeof identifyUser;
  reset: typeof resetUser;
  setBusinessId: typeof setBusinessId;
  trackEvent: typeof trackEvent;
  // 新增：跟踪器状态管理
  getTrackerStatus: typeof getTrackerStatus;
  resetTracker: typeof resetTracker;
  // 新增：地理位置信息更新
  updateGeoInfo: typeof updateGeoInfo;
};

// 导出用户属性接口
export type { UserProperties };

// 创建纯对象实例，不再使用代理
const xdTracker: XDTracker = {
  startPageViewTracking,
  stopPageViewTracking,
  trackCurrentPageDuration,
  getPageViewTracker,
  getCurrentPageDuration,
  getPageViewTrackingStatus,
  addPageViewEventListener,
  removePageViewEventListener,
  enableAutoPageTracking,
  disableAutoPageTracking,
  enableAutoTracker,
  disableAutoTracker,
  identify: identifyUser,
  reset: resetUser,
  setBusinessId,
  trackEvent,
  getTrackerStatus,
  resetTracker,
  updateGeoInfo
};

export default xdTracker;
