/**
 * Heatmap Bridge Module
 * 用于 iframe 内的 A 页面与父窗口 B 页面之间的 postMessage 通信
 * 支持根据元素数组定位 DOM 元素并返回位置信息
 */

/**
 * 元素信息接口（PostHog 自动捕获的元素格式）
 */
export interface ElementInfo {
  tag_name: string;
  classes?: string[];
  attr__class?: string;
  attr__id?: string;
  attr__href?: string;
  attr__src?: string;
  attr__alt?: string;
  attr__style?: string;
  attr__data?: string;
  nth_child: number;
  nth_of_type: number;
  $el_text?: string;
  [key: string]: any; // 支持其他 attr__ 属性
}

/**
 * 元素位置信息
 */
export interface ElementPosition {
  // 元素边界（相对于文档）
  x: number;
  y: number;
  width: number;
  height: number;
  // 元素中心点
  centerX: number;
  centerY: number;
  // 相对于视口的位置
  viewportX: number;
  viewportY: number;
}

/**
 * 热力图位置响应消息
 */
export interface HeatmapPositionMessage {
  type: "heatmap-element-position";
  data: {
    // 是否成功定位
    found: boolean;
    // 元素位置信息
    position: ElementPosition | null;
    // 页面信息（用于 B 页面做比例换算）
    viewport: {
      width: number;
      height: number;
      scrollX: number;
      scrollY: number;
      documentWidth: number;
      documentHeight: number;
    };
    // 匹配到的选择器（调试用）
    matchedSelector: string | null;
    // 原始元素数组
    elements: ElementInfo[];
    // 请求 ID（用于匹配请求和响应）
    requestId?: string;
    // 错误信息
    error?: string;
  };
}

/**
 * 热力图位置请求消息
 */
export interface HeatmapPositionRequest {
  type: "heatmap-locate-element";
  data: {
    elements: ElementInfo[];
    requestId?: string;
  };
}

/**
 * 根据元素信息构建基础 CSS 选择器（不含位置信息）
 */
function buildBaseSelector(element: ElementInfo): string {
  let selector = element.tag_name.toLowerCase();

  // 添加 ID
  if (element.attr__id) {
    selector += `#${CSS.escape(element.attr__id)}`;
    return selector; // ID 通常足够唯一
  }

  // 添加类名（只使用第一个有意义的类名，避免过长）
  if (element.classes && element.classes.length > 0) {
    // 优先选择看起来像组件类名的（包含下划线的 CSS Module 类名）
    const moduleClass = element.classes.find(
      (c) => c.includes("_") && c.includes("__")
    );
    if (moduleClass) {
      selector += `.${CSS.escape(moduleClass)}`;
    } else {
      // 否则使用所有类名
      selector += element.classes.map((c) => `.${CSS.escape(c)}`).join("");
    }
  } else if (element.attr__class) {
    const classes = element.attr__class.trim().split(/\s+/);
    const moduleClass = classes.find(
      (c) => c.includes("_") && c.includes("__")
    );
    if (moduleClass) {
      selector += `.${CSS.escape(moduleClass)}`;
    } else {
      selector += classes.map((c) => `.${CSS.escape(c)}`).join("");
    }
  }

  return selector;
}

/**
 * 根据元素信息构建带位置的 CSS 选择器
 * 优先级：ID > 类名 > nth-of-type > nth-child
 */
function buildSelectorWithPosition(element: ElementInfo): string {
  let selector = element.tag_name.toLowerCase();

  // 1. 添加 ID
  if (element.attr__id) {
    selector += `#${CSS.escape(element.attr__id)}`;
  }

  // 2. 添加类名 (优先使用 module class，否则使用第一个类名)
  if (element.classes && element.classes.length > 0) {
    const moduleClass = element.classes.find(
      (c) => c.includes("_") && c.includes("__")
    );
    if (moduleClass) {
      selector += `.${CSS.escape(moduleClass)}`;
    } else {
      selector += `.${CSS.escape(element.classes[0])}`;
    }
  } else if (element.attr__class) {
    const classes = element.attr__class.trim().split(/\s+/);
    if (classes.length > 0) {
      const moduleClass = classes.find(
        (c) => c.includes("_") && c.includes("__")
      );
      if (moduleClass) {
        selector += `.${CSS.escape(moduleClass)}`;
      } else {
        selector += `.${CSS.escape(classes[0])}`;
      }
    }
  }

  // 3. 添加位置信息 (优先 nth-of-type)
  if (element.nth_of_type) {
    selector += `:nth-of-type(${element.nth_of_type})`;
  } else if (element.nth_child) {
    selector += `:nth-child(${element.nth_child})`;
  }

  return selector;
}

/**
 * 构建精确的 nth-child 路径选择器
 */
function buildPrecisePath(elements: ElementInfo[]): string {
  if (!elements || elements.length === 0) return "";

  const selectors: string[] = [];

  for (let i = elements.length - 1; i >= 0; i--) {
    const element = elements[i];
    if (element.tag_name.toLowerCase() === "body") continue;
    if (element.tag_name.toLowerCase() === "html") continue;

    // 使用标签名 + nth-child 构建精确路径
    selectors.push(buildSelectorWithPosition(element));
  }

  return selectors.join(" > ");
}

/**
 * 构建混合路径选择器（类名 + nth-child）
 */
function buildHybridPath(elements: ElementInfo[]): string {
  if (!elements || elements.length === 0) return "";

  const selectors: string[] = [];

  for (let i = elements.length - 1; i >= 0; i--) {
    const element = elements[i];
    if (element.tag_name.toLowerCase() === "body") continue;
    if (element.tag_name.toLowerCase() === "html") continue;

    let selector = buildBaseSelector(element);

    // 如果没有类名，添加 nth-child
    if (
      !element.attr__id &&
      (!element.classes || element.classes.length === 0)
    ) {
      if (element.nth_child) {
        selector += `:nth-child(${element.nth_child})`;
      }
    }

    selectors.push(selector);
  }

  return selectors.join(" > ");
}

/**
 * 验证元素的父元素链是否匹配给定的元素信息数组
 */
function verifyParentChain(element: Element, elements: ElementInfo[]): boolean {
  let current: Element | null = element;

  // elements[0] 是目标元素，elements[1] 是父元素，以此类推
  for (let i = 0; i < elements.length && current; i++) {
    const expected = elements[i];
    const tagName = current.tagName.toLowerCase();

    // 验证标签名
    if (tagName !== expected.tag_name.toLowerCase()) {
      return false;
    }

    // 跳过 body 和 html 的位置检查，因为它们通常是唯一的且位置可能因环境而异
    if (tagName === "body" || tagName === "html") {
      current = current.parentElement;
      continue;
    }

    // 验证 nth_child (如果存在)
    if (expected.nth_child && current.parentElement) {
      const siblings: HTMLCollection = current.parentElement.children;
      let nthChild = 0;
      for (let j = 0; j < siblings.length; j++) {
        nthChild++;
        if (siblings[j] === current) break;
      }
      if (nthChild !== expected.nth_child) {
        return false;
      }
    }

    // 验证 nth_of_type (如果存在)
    if (expected.nth_of_type && current.parentElement) {
      const siblings: HTMLCollection = current.parentElement.children;
      let nthOfType = 0;
      for (let j = 0; j < siblings.length; j++) {
        if (siblings[j].tagName.toLowerCase() === tagName) {
          nthOfType++;
          if (siblings[j] === current) break;
        }
      }
      if (nthOfType !== expected.nth_of_type) {
        return false;
      }
    }

    current = current.parentElement;
  }

  return true;
}

/**
 * 通过文本内容匹配元素（带父元素链验证）
 */
function findElementByText(
  element: ElementInfo,
  candidates: NodeListOf<Element>,
  elements?: ElementInfo[]
): Element | null {
  if (!element.$el_text) return null;

  const targetText = element.$el_text.trim();
  for (let i = 0; i < candidates.length; i++) {
    const el = candidates[i];
    const elText = el.textContent?.trim();
    if (elText === targetText) {
      // 如果提供了完整的元素链，验证父元素
      if (elements && elements.length > 1) {
        if (verifyParentChain(el, elements)) {
          return el;
        }
        // 不匹配，继续查找下一个候选
        continue;
      }
      return el;
    }
  }
  return null;
}

/**
 * 从唯一祖先向下导航定位目标元素
 */
function locateFromAncestor(elements: ElementInfo[]): {
  element: Element | null;
  selector: string | null;
} {
  // 从上往下找第一个可以唯一定位的祖先
  for (let ancestorIdx = elements.length - 1; ancestorIdx > 0; ancestorIdx--) {
    const ancestor = elements[ancestorIdx];
    if (
      ancestor.tag_name.toLowerCase() === "body" ||
      ancestor.tag_name.toLowerCase() === "html"
    ) {
      continue;
    }

    const ancestorSelector = buildBaseSelector(ancestor);
    try {
      const ancestorCandidates = document.querySelectorAll(ancestorSelector);
      if (ancestorCandidates.length !== 1) continue;

      const ancestorElement = ancestorCandidates[0];

      // 从这个祖先向下构建路径
      const pathFromAncestor: string[] = [];
      for (let i = ancestorIdx - 1; i >= 0; i--) {
        const el = elements[i];
        pathFromAncestor.push(buildSelectorWithPosition(el));
      }

      if (pathFromAncestor.length > 0) {
        const descendantPath = pathFromAncestor.join(" > ");
        const fullSelector = `${ancestorSelector} > ${descendantPath}`;
        const found = ancestorElement.querySelector(descendantPath);
        if (found) {
          // 验证找到的元素是否符合完整的父链
          if (verifyParentChain(found, elements)) {
            return {
              element: found,
              selector: `(from-ancestor:${ancestorIdx}) ${fullSelector}`,
            };
          }
        }
      }
    } catch (e) {
      continue;
    }
  }

  return { element: null, selector: null };
}

/**
 * 尝试多种策略定位元素
 */
function locateElement(elements: ElementInfo[]): {
  element: Element | null;
  selector: string | null;
} {
  if (!elements || elements.length === 0) {
    return { element: null, selector: null };
  }

  const targetElement = elements[0];

  // 策略 1: 使用精确的 nth-child 路径（最可靠）
  const precisePath = buildPrecisePath(elements);
  if (precisePath) {
    try {
      const found = document.querySelector(precisePath);
      if (found) {
        console.log(
          "[HeatmapBridge] Strategy 1 (precise path) succeeded:",
          precisePath
        );
        return { element: found, selector: precisePath };
      }
    } catch (e) {
      console.warn("[HeatmapBridge] Strategy 1 failed:", precisePath, e);
    }
  }

  // 策略 2: 使用混合路径选择器（类名 + nth-child）并验证父链
  const hybridPath = buildHybridPath(elements);
  if (hybridPath && hybridPath !== precisePath) {
    try {
      const candidates = document.querySelectorAll(hybridPath);
      for (let i = 0; i < candidates.length; i++) {
        if (verifyParentChain(candidates[i], elements)) {
          console.log(
            "[HeatmapBridge] Strategy 2 (hybrid path) succeeded:",
            hybridPath
          );
          return { element: candidates[i], selector: hybridPath };
        }
      }
    } catch (e) {
      console.warn("[HeatmapBridge] Strategy 2 failed:", hybridPath, e);
    }
  }

  // 策略 3: 从唯一祖先向下导航
  const ancestorResult = locateFromAncestor(elements);
  if (ancestorResult.element) {
    console.log(
      "[HeatmapBridge] Strategy 3 (from ancestor) succeeded:",
      ancestorResult.selector
    );
    return ancestorResult;
  }

  // 策略 4: 使用文本内容匹配
  if (targetElement.$el_text) {
    const baseSelector = targetElement.tag_name.toLowerCase();
    try {
      const candidates = document.querySelectorAll(baseSelector);
      const found = findElementByText(targetElement, candidates, elements);
      if (found) {
        console.log(
          "[HeatmapBridge] Strategy 4 (text match) succeeded for:",
          targetElement.$el_text
        );
        return {
          element: found,
          selector: `(text-match) ${baseSelector}[text="${targetElement.$el_text}"]`,
        };
      }
    } catch (e) {
      console.warn("[HeatmapBridge] Strategy 4 failed:", e);
    }
  }

  // 策略 5: 使用目标元素的选择器 + nth-of-type 并验证父链
  const targetSelector = buildBaseSelector(targetElement);
  if (
    targetSelector &&
    targetSelector !== targetElement.tag_name.toLowerCase()
  ) {
    try {
      const candidates = document.querySelectorAll(targetSelector);

      // 遍历所有候选者进行验证
      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        if (verifyParentChain(candidate, elements)) {
          console.log(
            "[HeatmapBridge] Strategy 5 (target selector + verify) succeeded:",
            targetSelector
          );
          return { element: candidate, selector: targetSelector };
        }
      }

      // 如果上面的精确验证失败，尝试带 nth-of-type 的选择器（作为备选）
      if (targetElement.nth_of_type) {
        const refinedSelector = `${targetSelector}:nth-of-type(${targetElement.nth_of_type})`;
        const refinedCandidates = document.querySelectorAll(refinedSelector);
        for (let i = 0; i < refinedCandidates.length; i++) {
          if (verifyParentChain(refinedCandidates[i], elements)) {
            console.log(
              "[HeatmapBridge] Strategy 5 (refined selector + verify) succeeded:",
              refinedSelector
            );
            return { element: refinedCandidates[i], selector: refinedSelector };
          }
        }
      }

      // 尝试用文本内容进一步筛选
      if (candidates.length > 1 && targetElement.$el_text) {
        const found = findElementByText(targetElement, candidates, elements);
        if (found) {
          console.log("[HeatmapBridge] Strategy 5 (selector + text) succeeded");
          return { element: found, selector: `(text-match) ${targetSelector}` };
        }
      }
    } catch (e) {
      console.warn("[HeatmapBridge] Strategy 5 failed:", targetSelector, e);
    }
  }

  // 策略 6: 逐层向上匹配祖先，返回最近的可定位元素
  for (let i = 1; i < elements.length; i++) {
    const element = elements[i];
    if (
      element.tag_name.toLowerCase() === "body" ||
      element.tag_name.toLowerCase() === "html"
    ) {
      continue;
    }

    const selector = buildBaseSelector(element);
    try {
      const candidates = document.querySelectorAll(selector);
      if (candidates.length === 1) {
        console.log(
          `[HeatmapBridge] Strategy 6 (ancestor fallback) at level ${i}:`,
          selector
        );
        return {
          element: candidates[0],
          selector: `(ancestor:${i}) ${selector}`,
        };
      }
    } catch (e) {
      continue;
    }
  }

  // 策略 7: 使用属性组合匹配
  const attrSelectors: string[] = [];
  for (const key of Object.keys(targetElement)) {
    if (
      key.startsWith("attr__") &&
      key !== "attr__class" &&
      key !== "attr__style"
    ) {
      const attrName = key.replace("attr__", "").replace(/__/g, "-");
      const attrValue = targetElement[key];
      if (attrValue && typeof attrValue === "string") {
        attrSelectors.push(`[${attrName}="${CSS.escape(attrValue)}"]`);
      }
    }
  }
  if (attrSelectors.length > 0) {
    const attrSelector = `${targetElement.tag_name.toLowerCase()}${attrSelectors.join(
      ""
    )}`;
    try {
      const candidates = document.querySelectorAll(attrSelector);
      for (let i = 0; i < candidates.length; i++) {
        if (verifyParentChain(candidates[i], elements)) {
          console.log(
            "[HeatmapBridge] Strategy 7 (attribute match) succeeded:",
            attrSelector
          );
          return { element: candidates[i], selector: attrSelector };
        }
      }
    } catch (e) {
      console.warn("[HeatmapBridge] Strategy 7 failed:", attrSelector, e);
    }
  }

  console.warn("[HeatmapBridge] All strategies failed for elements:", elements);
  return { element: null, selector: null };
}

/**
 * 获取元素的位置信息
 */
function getElementPosition(element: Element): ElementPosition {
  const rect = element.getBoundingClientRect();
  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;

  return {
    // 相对于文档的位置
    x: rect.left + scrollX,
    y: rect.top + scrollY,
    width: rect.width,
    height: rect.height,
    // 中心点
    centerX: rect.left + scrollX + rect.width / 2,
    centerY: rect.top + scrollY + rect.height / 2,
    // 相对于视口的位置
    viewportX: rect.left,
    viewportY: rect.top,
  };
}

/**
 * 获取页面视口信息
 */
function getViewportInfo() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    scrollX: window.scrollX || window.pageXOffset,
    scrollY: window.scrollY || window.pageYOffset,
    documentWidth: document.documentElement.scrollWidth,
    documentHeight: document.documentElement.scrollHeight,
  };
}

/**
 * 处理元素定位请求并返回位置信息
 */
export function locateElementAndGetPosition(
  elements: ElementInfo[],
  requestId?: string
): HeatmapPositionMessage {
  const viewport = getViewportInfo();

  try {
    const { element, selector } = locateElement(elements);

    if (element) {
      const position = getElementPosition(element);
      return {
        type: "heatmap-element-position",
        data: {
          found: true,
          position,
          viewport,
          matchedSelector: selector,
          elements,
          requestId,
        },
      };
    } else {
      return {
        type: "heatmap-element-position",
        data: {
          found: false,
          position: null,
          viewport,
          matchedSelector: null,
          elements,
          requestId,
          error: "Element not found in DOM",
        },
      };
    }
  } catch (error) {
    return {
      type: "heatmap-element-position",
      data: {
        found: false,
        position: null,
        viewport,
        matchedSelector: null,
        elements,
        requestId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

/**
 * 发送位置信息给父窗口
 */
export function sendPositionToParent(
  message: HeatmapPositionMessage,
  targetOrigin: string = "*"
): void {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(message, targetOrigin);
    console.log("[HeatmapBridge] Position sent to parent:", message);
  } else {
    console.warn("[HeatmapBridge] No parent window found");
  }
}

/**
 * 热力图桥接器配置
 */
export interface HeatmapBridgeConfig {
  /** 允许的来源域名，'*' 表示允许所有 */
  allowedOrigins?: string[];
  /** 是否自动响应定位请求 */
  autoRespond?: boolean;
  /** 响应时的目标域名 */
  targetOrigin?: string;
  /** 定位成功的回调 */
  onLocated?: (position: ElementPosition, elements: ElementInfo[]) => void;
  /** 定位失败的回调 */
  onNotFound?: (elements: ElementInfo[], error?: string) => void;
}

let messageListener: ((event: MessageEvent) => void) | null = null;
let bridgeConfig: HeatmapBridgeConfig = {};

/**
 * 初始化热力图桥接器，监听来自父窗口的定位请求
 */
export function initHeatmapBridge(config: HeatmapBridgeConfig = {}): void {
  if (typeof window === "undefined") {
    console.warn("[HeatmapBridge] Not in browser environment");
    return;
  }

  // 清理之前的监听器
  if (messageListener) {
    window.removeEventListener("message", messageListener);
  }

  bridgeConfig = {
    allowedOrigins: ["*"],
    autoRespond: true,
    targetOrigin: "*",
    ...config,
  };

  messageListener = (event: MessageEvent) => {
    // 验证来源
    if (
      bridgeConfig.allowedOrigins &&
      !bridgeConfig.allowedOrigins.includes("*") &&
      !bridgeConfig.allowedOrigins.includes(event.origin)
    ) {
      console.warn(
        "[HeatmapBridge] Message from unauthorized origin:",
        event.origin
      );
      return;
    }

    // 验证消息格式
    const message = event.data as HeatmapPositionRequest;
    if (!message || message.type !== "heatmap-locate-element") {
      return;
    }

    console.log("[HeatmapBridge] Received locate request:", message);

    const { elements, requestId } = message.data;
    const response = locateElementAndGetPosition(elements, requestId);

    // 回调
    if (response.data.found && response.data.position) {
      bridgeConfig.onLocated?.(response.data.position, elements);
    } else {
      bridgeConfig.onNotFound?.(elements, response.data.error);
    }

    // 自动响应
    if (bridgeConfig.autoRespond) {
      sendPositionToParent(response, bridgeConfig.targetOrigin);
    }
  };

  window.addEventListener("message", messageListener);
  console.log("[HeatmapBridge] Initialized and listening for requests");
}

/**
 * 销毁热力图桥接器
 */
export function destroyHeatmapBridge(): void {
  if (messageListener) {
    window.removeEventListener("message", messageListener);
    messageListener = null;
  }
  bridgeConfig = {};
  console.log("[HeatmapBridge] Destroyed");
}

/**
 * 手动定位元素并发送给父窗口（用于 A 页面主动推送）
 */
export function locateAndSendToParent(
  elements: ElementInfo[],
  requestId?: string,
  targetOrigin: string = "*"
): HeatmapPositionMessage {
  const response = locateElementAndGetPosition(elements, requestId);
  sendPositionToParent(response, targetOrigin);
  return response;
}

// 导出默认对象
export default {
  initHeatmapBridge,
  destroyHeatmapBridge,
  locateElementAndGetPosition,
  sendPositionToParent,
  locateAndSendToParent,
};

/**
 * 自动初始化：模块加载时自动监听来自父窗口的定位请求
 * A 页面无需手动调用 initHeatmapBridge()
 */
if (typeof window !== "undefined") {
  // 等待 DOM 就绪后自动初始化
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initHeatmapBridge();
    });
  } else {
    // DOM 已就绪，直接初始化
    initHeatmapBridge();
  }
}
