/**
 * PostHog Integration Module
 * 将事件自动上报到 PostHog
 */

import posthog, { PostHog } from "posthog-js";

export interface PostHogConfig {
  apiKey: string;
  host: string; // 上报地址，例如：/quote/api/v1/events/behavior
  enabled?: boolean;
  autocapture?: boolean;
  capture_pageview?: boolean;
  capture_pageleave?: boolean;
  persistence?: "localStorage" | "cookie" | "memory";
  session_recording?: {
    enabled?: boolean;
  };
  batch_mode?: boolean; // 是否使用批量模式（统一为对象数组），默认 true
  batch_size?: number; // 批量大小，默认 10
  batch_interval?: number; // 批量发送间隔（毫秒），默认 1000
}

let isPostHogInitialized = false;
let postHogConfig: PostHogConfig | null = null;
let originalFetch: typeof fetch;

/**
 * 拦截 PostHog 请求，确保数据格式统一为对象数组
 */
function interceptPostHogRequests(): void {
  if (typeof window === "undefined" || !window.fetch) return;

  // 保存原始 fetch
  if (!originalFetch) {
    originalFetch = window.fetch;
  }

  // 重写 fetch
  window.fetch = async function (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    // 检查是否是 PostHog 请求
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.href
        : input.url;
    const isPostHogRequest =
      url.includes(postHogConfig?.host || "") ||
      url.includes("posthog") ||
      url.includes("/batch") ||
      url.includes("/capture") ||
      url.includes("/decide");

    if (isPostHogRequest && init?.body) {
      try {
        const body =
          typeof init.body === "string" ? JSON.parse(init.body) : init.body;

        // 确保 batch 字段是数组
        if (body.batch && !Array.isArray(body.batch)) {
          console.log("[PostHog] Converting single event to batch array");
          body.batch = [body.batch];
          init.body = JSON.stringify(body);
        }

        // 如果是单个事件，包装成批量格��
        if (body.event && !body.batch) {
          console.log("[PostHog] Converting single event to batch format");
          const batchBody = {
            api_key: body.api_key || postHogConfig?.apiKey,
            batch: [body],
          };
          init.body = JSON.stringify(batchBody);
        }

        console.log("[PostHog] Request body (unified to array):", init.body);
      } catch (error) {
        console.error("[PostHog] Failed to intercept request:", error);
      }
    }

    return originalFetch.call(window, input, init);
  };

  console.log(
    "[PostHog] Request interceptor installed - all events will be sent as arrays"
  );
}

/**
 * 检查 PostHog 是否已初始化且启用
 */
export function isPostHogEnabled(): boolean {
  return isPostHogInitialized && (postHogConfig?.enabled ?? true);
}

/**
 * 手动触发 PageView 事件
 */
export function capturePageView(properties?: Record<string, any>): void {
  if (!isPostHogEnabled()) {
    return;
  }

  try {
    const pageProps = {
      $current_url: window.location.href,
      $pathname: window.location.pathname,
      $title: document.title,
      ...properties,
    };
    posthog.capture("$pageview", pageProps);
    console.log("[PostHog] PageView captured:", pageProps);
  } catch (error) {
    console.error("[PostHog] Failed to capture pageview:", error);
  }
}

/**
 * 初始化 PostHog
 * @returns Promise<string> 返回 PostHog 的 distinct_id
 */
export function initializePostHog(config: PostHogConfig): Promise<string> {
  return new Promise((resolve, reject) => {
    if (isPostHogInitialized) {
      console.warn("[PostHog] Already initialized");
      resolve(posthog.get_distinct_id?.() || "");
      return;
    }

    if (!config.apiKey) {
      console.error("[PostHog] API key is required");
      reject(new Error("[PostHog] API key is required"));
      return;
    }

    postHogConfig = config;

    try {
      const initOptions: any = {
        api_host: config.host,
        autocapture: config.autocapture ?? true, // 默认启用 PostHog 原生自动采集
        // capture_heatmaps: true, // 热力图开关
        capture_pageview: "history_change", // 默认启用页面浏览自动追踪
        capture_pageleave: config.capture_pageleave ?? true, // 默认启用页面离开自动追踪
        persistence: config.persistence || "localStorage",
        disable_compression: true,

        advanced_disable_decide: true,

        // 批量模式配置（统一为对象数组格式）
        batch_events: config.batch_mode ?? false, // 默认启用批量模式
        batch_size: config.batch_size ?? 10, // 批量大小
        batch_interval_ms: config.batch_interval ?? 1000, // 批量发送间隔（毫秒）

        loaded: (posthog: any) => {
          isPostHogInitialized = true;
          localStorage.setItem("isPostHogInitialized", "1");

          // 拦截请求，确保所有数据都是对象数组格式
          if (initOptions.batch_events !== false) {
            interceptPostHogRequests();
          }

          // 返回 distinct_id
          const distinctId = posthog.get_distinct_id?.() || "";
          resolve(distinctId);
        },
      };

      // 只有在明确启用时才添加 session_recording 配置
      if (config.session_recording?.enabled) {
        initOptions.session_recording = config.session_recording;
      }

      posthog.init(config.apiKey, initOptions);
      posthog.register({
        cusEventType: "2",
      });
    } catch (error) {
      console.error("[PostHog] Initialization failed:", error);
      reject(error);
    }
  });
}

/**
 * 发送事件到 PostHog
 */
export function capturePostHogEvent(
  eventName: string,
  properties?: Record<string, any>
): void {
  if (!isPostHogEnabled()) {
    return;
  }

  try {
    posthog.capture(eventName, properties);
  } catch (error) {
    console.error("[PostHog] Failed to capture event:", error);
  }
}

export function capturePostHogEventBeacon(
  eventName: string,
  properties?: Record<string, any>
): void {
  if (!isPostHogEnabled() || !postHogConfig) {
    return;
  }

  try {
    const eventData = {
      api_key: postHogConfig.apiKey,
      batch: [
        {
          event: eventName,
          properties: {
            ...properties,
            distinct_id: posthog.get_distinct_id?.() || "anonymous",
            $lib: "web",
            $lib_version: "1.0.0",
          },
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const blob = new Blob([JSON.stringify(eventData)], {
      type: "application/json",
    });

    // 使用 sendBeacon API，保证在页面卸载时也能发送
    const sent = navigator.sendBeacon(postHogConfig.host, blob);

    if (sent) {
      console.log("[PostHog] Event sent via sendBeacon:", eventName);
    } else {
      console.warn(
        "[PostHog] sendBeacon failed, event may not be sent:",
        eventName
      );
    }
  } catch (error) {
    console.error("[PostHog] Failed to send event via sendBeacon:", error);
  }
}

/**
 * 立即刷新批量队列，强制发送所有待发送的事件
 * 适用于页面跳转前确保事件已发送
 */
export function flushPostHogEvents(): void {
  if (!isPostHogEnabled()) {
    return;
  }

  try {
    // PostHog 没有公开的 flush 方法，但我们可以尝试访问内部方法
    const posthogInstance = posthog as any;
    if (typeof posthogInstance._flush === "function") {
      posthogInstance._flush();
      console.log("[PostHog] Events flushed");
    } else if (typeof posthogInstance.flush === "function") {
      posthogInstance.flush();
      console.log("[PostHog] Events flushed");
    } else {
      console.warn("[PostHog] Flush method not available");
    }
  } catch (error) {
    console.error("[PostHog] Failed to flush events:", error);
  }
}

/**
 * 识别用户
 */
export function identifyPostHogUser(
  userId: string,
  properties?: Record<string, any>
): void {
  if (!isPostHogEnabled()) {
    return;
  }

  try {
    posthog.identify(userId, properties);
  } catch (error) {
    console.error("[PostHog] Failed to identify user:", error);
  }
}

/**
 * 重置用户
 */
export function resetPostHogUser(): void {
  if (!isPostHogEnabled()) {
    return;
  }

  try {
    posthog.reset();
  } catch (error) {
    console.error("[PostHog] Failed to reset user:", error);
  }
}

/**
 * 设置用户属性
 */
export function setPostHogUserProperties(
  properties: Record<string, any>
): void {
  if (!isPostHogEnabled()) {
    return;
  }

  try {
    posthog.people.set(properties);
  } catch (error) {
    console.error("[PostHog] Failed to set user properties:", error);
  }
}

/**
 * 获取 PostHog 实例（用于高级操作）
 */
export function getPostHogInstance() {
  return posthog;
}

/**
 * 关闭 PostHog
 */
export function shutdownPostHog(): void {
  if (!isPostHogInitialized) {
    return;
  }

  try {
    // PostHog 没有官方的 shutdown 方法，但我们可以标记为未初始化
    isPostHogInitialized = false;
    postHogConfig = null;
    console.log("[PostHog] Shutdown complete");
  } catch (error) {
    console.error("[PostHog] Failed to shutdown:", error);
  }
}
