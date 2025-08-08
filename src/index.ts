import posthog from "posthog-js";

// 简单的运行时守卫以避免 SSR 崩溃
const isBrowser =
  typeof window !== "undefined" && typeof document !== "undefined";

let storedExternalSDK: unknown = undefined;
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

/**
 * 确保在 <head> 中存在具有给定 src（或 id）的 <script>。如果已存在，则不执行任何操作。
 */
export function ensureHeadScript(
  options: InjectScriptOptions
): HTMLScriptElement | null {
  if (!isBrowser) return null;

  const { id, src, attributes, beforeAppend } = options;

  // 按 id 或 src 去重
  if (id && injectedById.has(id)) {
    const existing = document.getElementById(id);
    return (existing as HTMLScriptElement) || null;
  }
  if (injectedBySrc.has(src)) {
    const existing = document.querySelector(`script[src="${CSS.escape(src)}"]`);
    return (existing as HTMLScriptElement) || null;
  }

  // 如果 DOM 已经存在（例如由服务端注入），做标记后直接返回
  if (id) {
    const existingById = document.getElementById(id);
    if (existingById && existingById.tagName === "SCRIPT") {
      injectedById.add(id);
      injectedBySrc.add(src);
      return existingById as HTMLScriptElement;
    }
  }
  const existingBySrc = document.querySelector(
    `script[src="${CSS.escape(src)}"]`
  );
  if (existingBySrc) {
    if (id) injectedById.add(id);
    injectedBySrc.add(src);
    return existingBySrc as HTMLScriptElement;
  }

  const script = document.createElement("script");
  script.async = true;
  script.src = src;
  if (id) script.id = id;
  if (attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      const normalized =
        typeof value === "boolean" ? (value ? "" : undefined) : String(value);
      if (normalized !== undefined) {
        script.setAttribute(key, normalized);
      }
    }
  }

  if (typeof beforeAppend === "function") {
    try {
      beforeAppend(script);
    } catch (_) {
      // 忽略
    }
  }

  document.head.appendChild(script);
  if (id) injectedById.add(id);
  injectedBySrc.add(src);
  return script;
}

export interface InjectInlineScriptOptions {
  id?: string;
  content: string;
  beforeAppend?: (el: HTMLScriptElement) => void;
}

/**
 * 确保在 <head> 中注入指定内容的内联 <script>。若已注入相同内容（本次运行时），则不再重复注入。
 */
export function ensureHeadInlineScript(
  options: InjectInlineScriptOptions
): HTMLScriptElement | null {
  if (!isBrowser) return null;
  const { id, content, beforeAppend } = options;

  if (id && injectedById.has(id)) {
    const existing = document.getElementById(id);
    return (existing as HTMLScriptElement) || null;
  }
  if (injectedByContent.has(content)) {
    return null;
  }

  if (id) {
    const existingById = document.getElementById(id);
    if (existingById && existingById.tagName === "SCRIPT") {
      injectedById.add(id);
      injectedByContent.add(content);
      return existingById as HTMLScriptElement;
    }
  }

  const script = document.createElement("script");
  script.type = "text/javascript";
  if (id) script.id = id;
  script.textContent = content;

  if (typeof beforeAppend === "function") {
    try {
      beforeAppend(script);
    } catch (_) {
      // 忽略
    }
  }

  document.head.appendChild(script);
  if (id) injectedById.add(id);
  injectedByContent.add(content);
  return script;
}

export interface InitXDOptions {
  // 提供一个应注入到 <head> 的 URL
  scriptUrl?: string;
  // 可选 id，用于帮助对注入的脚本去重
  scriptId?: string;
  // 为注入的 script 标签添加额外属性
  scriptAttributes?: Record<string, HeadScriptAttributeValue>;
  // 使用 apiKey 和可选项初始化 posthog（若 `sdk` 传入为字符串，将优先作为 apiKey 使用）
  posthog?: {
    apiKey?: string;
    options?: Parameters<typeof posthog.init>[1];
  };
}

/**
 * 使用外部 SDK 引用进行初始化，并可选地注入 script 标签并初始化 posthog。
 */
export function init(sdk: string, options: InitXDOptions = {}): void {
  storedExternalSDK = sdk;

  injectFixedSnippetWithDynamicInit({ apiKey: sdk, ...options.posthog });

  // apiKey 解析优先级：sdk(字符串) > options.posthog.apiKey > 环境变量 NEXT_PUBLIC_POSTHOG_KEY
  const apiKeyFromSdk = typeof sdk === "string" ? sdk : undefined;
  const finalApiKey = apiKeyFromSdk;
  if (finalApiKey) {
    // 避免在同一运行时重复初始化
    const phAny = posthog as unknown as {
      init: typeof posthog.init;
      _isInitialized?: boolean;
    };
    if (!phAny._isInitialized) {
      // 默认集成的 init 参数，用户传入的 options 可覆盖这些默认值
      const mergedOptions = {
        api_host: "https://statis.pcbx.com",
        person_profiles: "identified_only",
        ...(options?.posthog || {}),
      } as Parameters<typeof posthog.init>[1];

      phAny.init(finalApiKey, mergedOptions);
      phAny._isInitialized = true;
    }
  }
}

/**
 * 根据传入的 apiKey 与可选配置，构造 `posthog.init(...)` 调用字符串。
 */
export function buildPosthogInitCall(
  apiKey: string,
  options?: Parameters<typeof posthog.init>[1]
): string {
  const merged = {
    api_host: "https://statis.pcbx.com",
    person_profiles: "identified_only",
    ...(options || {}),
  } as Parameters<typeof posthog.init>[1];
  const safeKey = String(apiKey).replace(/'/g, "\\'");
  return `posthog.init('${safeKey}', ${JSON.stringify(merged)})`;
}

export interface InjectFixedSnippetOptions {
  id?: string;
  apiKey?: string;
  options?: Parameters<typeof posthog.init>[1];
}

/**
 * 注入“固定内容 + 动态 init” 的内联脚本：
 * - 固定内容为你提供的 posthog 引导代码
 * - 仅将最后的 posthog.init(...) 按传入值进行替换
 */
export function injectFixedSnippetWithDynamicInit(
  params: InjectFixedSnippetOptions
): HTMLScriptElement | null {
  if (!isBrowser) return null;
  const envApiKey =
    typeof process !== "undefined"
      ? (process.env?.NEXT_PUBLIC_POSTHOG_KEY as string | undefined)
      : undefined;
  const apiKey = params.apiKey ?? envApiKey;
  if (!apiKey) return null;

  const initCall = buildPosthogInitCall(apiKey, params.options);

  const fixedBootstrap = `!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys getNextSurveyStep onSessionId setPersonProperties".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);`;

  // const content = `${fixedBootstrap}\n${initCall}`;
  const content = `${fixedBootstrap}`;
  return ensureHeadInlineScript({ id: params.id, content });
}

export function getSDK<T = unknown>(): T | undefined {
  return storedExternalSDK as T | undefined;
}

// 新增：导出一个与 posthog.identify 参数一致的便捷方法
export function identify(...args: Parameters<typeof posthog.identify>): void {
  if (!isBrowser) return;
  try {
    (
      posthog.identify as unknown as (
        ...a: Parameters<typeof posthog.identify>
      ) => void
    )(...args);
  } catch (_) {
    // 忽略
  }
}

export * from "./popup";

// 组合默认导出：行为与 posthog 相同，但增加了我们的自定义方法
export type XDPosthog = typeof posthog & {
  initXD: typeof init;
  ensureHeadScript: typeof ensureHeadScript;
  ensureHeadInlineScript: typeof ensureHeadInlineScript;
  buildPosthogInitCall: typeof buildPosthogInitCall;
  getSDK: typeof getSDK;
};

const xdposthog: XDPosthog = new Proxy(posthog as XDPosthog, {
  get(target, prop, receiver) {
    if (prop === "initXD") return init;
    if (prop === "ensureHeadScript") return ensureHeadScript;
    if (prop === "ensureHeadInlineScript") return ensureHeadInlineScript;
    if (prop === "buildPosthogInitCall") return buildPosthogInitCall;
    if (prop === "getSDK") return getSDK;
    return Reflect.get(target, prop, receiver);
  },
  set(target, prop, value, receiver) {
    return Reflect.set(target, prop, value, receiver);
  },
});

export default xdposthog;
