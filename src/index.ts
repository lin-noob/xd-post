import {
  enableAutoTracker,
  disableAutoTracker,
  identify as identifyUser,
  reset as resetUser,
  getTrackerStatus,
  resetTracker,
  type UserProperties,
  type AutoTrackerOptions,
  getWebSocketClient,
  updateWebSocketSessionId,
  setWebSocketAutoHandlePopup,
  getWebSocketAutoHandlePopup,
  isIdentified,
  userRegisterTrack,
  userLoginTrack,
  quoteTrack,
  addToCartTrack,
  submitOrderTrack,
  completePurchaseTrack,
  startCheckout,
  contactUsTrack,
  boxBuildSubmitTrack,
  clickHomeInquiryTrack,
  clickBannerInquiryTrack,
  articleContentClickTrack,
} from "./auto-tracker";

// 简单的运行时守卫以避免 SSR 崩溃
const isBrowser =
  typeof window !== "undefined" && typeof document !== "undefined";

// 导出 auto-tracker 的所有功能
export * from "./auto-tracker";

// 导出 popup 功能
export {
  showPopup,
  hidePopup,
  showPopupFromStrategy,
  type PopupButton,
  type PopupPayload,
  type PopupOptions,
} from "./popup";

// 导出 SSE 客户端
export { SSEClient, type SSEConfig } from "./sse-client";

// 导出 PostHog 集成
export * from "./posthog-integration";
export {
  capturePageView,
  capturePostHogEvent,
  capturePostHogEventBeacon as trackBeacon,
  capturePostHogEventBeacon,
  flushPostHogEvents as flush,
  flushPostHogEvents,
  setPostHogUserProperties,
  getPostHogInstance,
} from "./posthog-integration";

// 导出 WebSocket 客户端
export { WebSocketClient, type WebSocketConfig } from "./websocket-client";

// 组合默认导出
export type XDTracker = {
  enableAutoTracker: typeof enableAutoTracker;
  disableAutoTracker: typeof disableAutoTracker;
  identify: typeof identifyUser;
  reset: typeof resetUser;
  getTrackerStatus: typeof getTrackerStatus;
  resetTracker: typeof resetTracker;
  getWebSocketClient: typeof getWebSocketClient;
  updateWebSocketSessionId: typeof updateWebSocketSessionId;
  setWebSocketAutoHandlePopup: typeof setWebSocketAutoHandlePopup;
  getWebSocketAutoHandlePopup: typeof getWebSocketAutoHandlePopup;
  isIdentified: typeof isIdentified;
  userRegisterTrack: typeof userRegisterTrack;
  userLoginTrack: typeof userLoginTrack;
  quoteTrack: typeof quoteTrack;
  addToCartTrack: typeof addToCartTrack;
  submitOrderTrack: typeof submitOrderTrack;
  completePurchaseTrack: typeof completePurchaseTrack;
  startCheckout: typeof startCheckout;
  contactUsTrack: typeof contactUsTrack;
  boxBuildSubmitTrack: typeof boxBuildSubmitTrack;
  clickHomeInquiryTrack: typeof clickHomeInquiryTrack;
  clickBannerInquiryTrack: typeof clickBannerInquiryTrack;
  articleContentClickTrack: typeof articleContentClickTrack;
};

// 导出用户属性接口和配置接口
export type { UserProperties, AutoTrackerOptions };

// 创建默认导出对象
const xdTracker: XDTracker = {
  enableAutoTracker,
  disableAutoTracker,
  identify: identifyUser,
  reset: resetUser,
  getTrackerStatus,
  resetTracker,
  getWebSocketClient,
  updateWebSocketSessionId,
  setWebSocketAutoHandlePopup,
  getWebSocketAutoHandlePopup,
  isIdentified,
  userRegisterTrack,
  userLoginTrack,
  quoteTrack,
  addToCartTrack,
  submitOrderTrack,
  completePurchaseTrack,
  startCheckout,
  contactUsTrack,
  boxBuildSubmitTrack,
  clickHomeInquiryTrack,
  clickBannerInquiryTrack,
  articleContentClickTrack,
};

export default xdTracker;
