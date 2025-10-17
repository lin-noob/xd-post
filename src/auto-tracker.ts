/*
 * Auto Tracker: PostHog 集成 + WebSocket 支持
 * 只使用 PostHog 原生自动采集，不进行自定义事件上报
 */

import { WebSocketClient } from "./websocket-client";
import {
  initializePostHog,
  identifyPostHogUser,
  resetPostHogUser,
  capturePageView,
  getPostHogInstance,
  capturePostHogEvent,
} from "./posthog-integration";

// 导出 capturePageView 供外部使用
export { capturePageView };

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
  | "Search" // 执行搜索
  | "PageDwellTime"; // 页面停留时间

// =============================================================================
// 类型定义
// =============================================================================

// 用户属性接口
export interface UserProperties {
  id?: string;
  userId?: string;
  email?: string;
  phone?: string;
  userName?: string;
  [key: string]: any; // 允许其他自定义属性
}

export interface AutoTrackerOptions {
  // PostHog 集成配置（使用 PostHog 原生自动采集）
  posthog: {
    enabled?: boolean; // 是否启用 PostHog，默认 true
    apiKey: string; // PostHog API Key（必填）
    host: string; // PostHog 上报地址（必填），例如：/quote/api/v1/events/behavior
    autocapture?: boolean; // 是否启用 PostHog 原生自动采集，默认 true
    capture_pageview?: boolean; // 是否启用 PostHog 原生页面浏览追踪，默认 true
    capture_pageleave?: boolean; // 是否启用 PostHog 原生页面离开追踪，默认 true
    session_recording?: {
      enabled?: boolean; // 是否启用会话录制，默认 false
    };
  };
  // WebSocket 配置（可选）
  websocketUrl?: string; // WebSocket 连接地址
  sessionId?: string; // 如果不传，则生成 uuid 并持久化
  // 存储配置
  storageKeyUserId?: string; // 默认 "user_id"
  // 用户属性
  userProperties?: UserProperties; // 用户属性
}

// =============================================================================
// 工具函数
// =============================================================================

const isBrowser =
  typeof window !== "undefined" && typeof document !== "undefined";

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

// =============================================================================
// 存储管理
// =============================================================================

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

// =============================================================================
// 状态管理
// =============================================================================

let trackerEnabled = false;
let trackerOptions: AutoTrackerOptions | null = null;
let persistedUserId: string | null = null;
let userProperties: UserProperties = {};
let websocketClient: WebSocketClient | null = null;

// For cleanup
let removeListeners: Array<() => void> = [];

// WebSocket 连接初始化
function initializeWebSocketConnection(sessionId: string): void {
  if (!trackerOptions || !trackerOptions.websocketUrl) return;

  try {
    // 如果已存在 WebSocket 客户端，检查是否需要更新
    if (websocketClient) {
      const currentSessionId = websocketClient.getSessionId();
      const currentUrl = websocketClient.getUrl();

      // 检查是否需要更新配置
      const needsReconnect =
        currentUrl !== trackerOptions.websocketUrl ||
        currentSessionId !== trackerOptions.sessionId ||
        !websocketClient.isConnected();

      if (!needsReconnect) {
        console.log("[XD-Tracker] WebSocket 连接已存在且配置未变化");
        return;
      }

      // 如果 URL 变化，需要重新创建连接
      if (currentUrl !== trackerOptions.websocketUrl) {
        console.log("[XD-Tracker] WebSocket URL 变化，重新创建连接");
        websocketClient.disconnect();
        websocketClient = null;
      }
      // 如果只是 sessionId 变化，使用 updateSessionId
      else if (
        currentSessionId !== trackerOptions.sessionId &&
        websocketClient.isConnected()
      ) {
        console.log("[XD-Tracker] 更新 WebSocket 连接的 sessionId");
        websocketClient.updateSessionId(trackerOptions.sessionId!);
        return;
      }
      // 如果连接��开，尝试重连
      else if (!websocketClient.isConnected()) {
        console.log("[XD-Tracker] WebSocket 连接断开，尝试重连");
        websocketClient.reconnect();
        return;
      }
    }

    // 创建新的 WebSocket 客户端
    console.log("[XD-Tracker] 创建新的 WebSocket 连接");
    websocketClient = new WebSocketClient({
      url: trackerOptions.websocketUrl,
      sessionId,
      autoHandlePopup: true,
      onOpen: () => {
        console.log("[XD-Tracker] WebSocket 连接已建立");
      },
      onClose: () => {
        console.log("[XD-Tracker] WebSocket 连接已关闭");
      },
      onError: (error) => {
        console.error("[XD-Tracker] WebSocket 连接错误:", error);
      },
    });

    // 建立连接
    websocketClient.connect();

    // 将清理函数添加到列表中
    removeListeners.push(() => {
      if (websocketClient) {
        websocketClient.disconnect();
        websocketClient = null;
      }
    });
  } catch (error) {
    console.error("[XD-Tracker] WebSocket 初始化失败:", error);
  }
}

// =============================================================================
// 公共 API
// =============================================================================

export async function enableAutoTracker(
  options: AutoTrackerOptions
): Promise<void> {
  if (!isBrowser) return;

  // 验证必填参数
  if (!options.posthog || !options.posthog.apiKey || !options.posthog.host) {
    throw new Error(
      "[XD-Tracker] posthog.apiKey and posthog.host are required"
    );
  }

  // 如果已经启用，先清理之前的状态
  if (trackerEnabled) {
    console.log("[XD-Tracker] 重新初始化");
    trackerEnabled = false;
  }

  trackerOptions = options;
  userProperties = { ...options.userProperties };

  // 初始化 PostHog（使用原生自动采集）并获取 distinct_id
  const distinctId = await initializePostHog({
    apiKey: options.posthog.apiKey,
    host: options.posthog.host,
    enabled: options.posthog.enabled ?? true,
    autocapture: options.posthog.autocapture ?? true,
    capture_pageview: options.posthog.capture_pageview ?? true,
    capture_pageleave: options.posthog.capture_pageleave ?? true,
    session_recording: options.posthog.session_recording,
  });

  if (!distinctId) {
    return;
  }

  // 使用 PostHog 返回的 distinct_id 作为 persistedUserId
  persistedUserId = distinctId;

  trackerEnabled = true;

  // 初始化 WebSocket 连接（如果配置了）
  if (trackerOptions.websocketUrl) {
    initializeWebSocketConnection(persistedUserId);
  }
}

export function disableAutoTracker(fullReset?: boolean): void {
  trackerEnabled = false;

  // 执行所有清理函数
  for (const fn of removeListeners.splice(0, removeListeners.length)) {
    try {
      fn();
    } catch (_) {}
  }

  console.log("[XD-Tracker] 已禁用");
}

/**
 * 获取跟踪器当前状态
 */
export function getTrackerStatus(): {
  enabled: boolean;
  sessionId: string | null;
  userProperties: UserProperties;
  websocketConnected: boolean;
  websocketUrl?: string;
  posthogHost?: string;
} {
  return {
    enabled: trackerEnabled,
    sessionId: persistedUserId,
    userProperties,
    websocketConnected: websocketClient?.isConnected() || false,
    websocketUrl: trackerOptions?.websocketUrl,
    posthogHost: trackerOptions?.posthog?.host,
  };
}

/**
 * 重置跟踪器状态
 */
export function resetTracker(): void {
  disableAutoTracker(true);
}

/**
 * 获取 WebSocket 客户端实例
 */
export function getWebSocketClient(): WebSocketClient | null {
  return websocketClient;
}

/**
 * 更新 WebSocket 连接的 sessionId
 */
export function updateWebSocketSessionId(sessionId: string): void {
  if (websocketClient) {
    websocketClient.updateSessionId(sessionId);
  }
  // 同时更新 trackerOptions 中的 sessionId
  if (trackerOptions) {
    trackerOptions.sessionId = sessionId;
  }
}

/**
 * 设置 WebSocket 是否自动处理弹窗
 */
export function setWebSocketAutoHandlePopup(enabled: boolean): void {
  if (websocketClient) {
    websocketClient.setAutoHandlePopup(enabled);
  }
}

/**
 * 获取 WebSocket 自动处理弹窗设置
 */
export function getWebSocketAutoHandlePopup(): boolean {
  return websocketClient ? websocketClient.getAutoHandlePopup() : false;
}

/**
 * 识别用户并设置用户属性
 * @param userId 用户ID
 * @param properties 用户属性，可包含 email、phone 等
 */
export function identify(userId: string, properties?: UserProperties): void {
  if (!trackerOptions) return;

  // 更新用户属性
  if (properties) {
    userProperties = {
      ...userProperties,
      ...properties,
      id: userId,
    };

    // 同步到 PostHog
    identifyPostHogUser(userId, properties);

    console.log(`[XD-Tracker] 用户已识别，用户ID: ${userId}，属性已更新`);
  } else {
    // 同步到 PostHog
    identifyPostHogUser(userId);

    console.log(`[XD-Tracker] 用户已识别，用户ID: ${userId}`);
  }
  reconnectionWS();
}

/**
 * 重置用户信息，清除所有用户属性
 * 退出登录时调用，会重新生成 distinct_id 并重新初始化 WebSocket
 */
export function reset(): void {
  if (!trackerOptions) return;

  // 清空所有用户属性
  userProperties = {};

  // 同步到 PostHog（会重新生成 distinct_id）
  resetPostHogUser();
  reconnectionWS();
}

function reconnectionWS() {
  // 获取新的 distinct_id
  const posthog = getPostHogInstance();
  const newDistinctId = posthog.get_distinct_id?.();
  // 更新 persistedUserId
  const oldDistinctId = persistedUserId;
  persistedUserId = newDistinctId;

  // 如果配置了 WebSocket 且 distinct_id 发生变化
  if (trackerOptions?.websocketUrl && oldDistinctId !== newDistinctId) {
    // 关闭旧的 WebSocket 连接
    if (websocketClient) {
      websocketClient.disconnect();
      websocketClient = null;
    }

    // 用新的 distinct_id 重新初始化 WebSocket
    initializeWebSocketConnection(newDistinctId);
  }
}

export function track(eventName: string, properties?: Record<string, any>) {
  capturePostHogEvent(eventName, properties);

  let attempts = 0;
  const maxAttempts = 50; // 最多尝试 50 次 (5秒)
  const checkInterval = 100; // 每 100ms 检查一次

  setTimeout(() => {
    if (eventName === "UserLogin") {
      const posthog = getPostHogInstance();
      const newDistinctId = posthog.get_distinct_id?.();
      const payload = JSON.stringify({
        eventName,
        distinct_id: newDistinctId,
        userId: newDistinctId,
        sdk: trackerOptions?.posthog.apiKey,
      });
      const intervalId = setInterval(() => {
        attempts++;

        if (websocketClient && websocketClient.isConnected()) {
          // 连接成功，发送消息
          const sent = websocketClient.send(payload);
          if (sent) {
            console.log(
              `[XD-Tracker] UserLogin 事件已发送 (尝试 ${attempts} 次)`
            );
          }
          clearInterval(intervalId);
        } else if (attempts >= maxAttempts) {
          // 超时
          console.warn(
            `[XD-Tracker] UserLogin 事件发送超时，WebSocket 未在 ${
              maxAttempts * checkInterval
            }ms 内连接`
          );
          clearInterval(intervalId);
        } else {
          console.log(
            `[XD-Tracker] 等待 WebSocket 连接... (${attempts}/${maxAttempts})`
          );
        }
      }, checkInterval);
    }
  }, 200);
}
