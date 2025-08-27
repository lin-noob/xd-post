const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";

export interface PopupButton {
  text: string;
  url: string;
  target?: string;
  rel?: string;
}

export interface PopupPayload {
  title: string;
  body: string;
  // 兼容旧字段（单按钮）
  buttonText?: string;
  buttonUrl?: string;
  // 新增：支持多按钮
  buttons?: PopupButton[];
  // 新增：支持新的策略结构
  link?: string;
}

export type PopupPosition = 'center' | 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export interface PopupOptions {
  containerId?: string;
  overlayClosable?: boolean;
  zIndex?: number;
  position?: PopupPosition;
  showOverlay?: boolean;
  persistent?: boolean;
  persistentKey?: string;
  expiresInSeconds?: number;
}

const DEFAULT_CONTAINER_ID = "xd-post-popup";
const STYLE_ID = "xd-post-popup-style";
const PERSISTENCE_PREFIX = "xd-post-popup-";

function setPersistentData(key: string, data: any, expiresInSeconds?: number): void {
  if (!isBrowser) return;
  try {
    const item = {
      data,
      timestamp: Date.now(),
      expires: expiresInSeconds ? Date.now() + expiresInSeconds * 1000 : null
    };
    localStorage.setItem(PERSISTENCE_PREFIX + key, JSON.stringify(item));
  } catch (e) {
    console.warn('Failed to persist popup data:', e);
  }
}

function getPersistentData(key: string): any {
  if (!isBrowser) return null;
  try {
    const item = localStorage.getItem(PERSISTENCE_PREFIX + key);
    if (!item) return null;
    
    const parsed = JSON.parse(item);
    if (parsed.expires && Date.now() > parsed.expires) {
      localStorage.removeItem(PERSISTENCE_PREFIX + key);
      return null;
    }
    return parsed.data;
  } catch (e) {
    console.warn('Failed to retrieve persistent popup data:', e);
    return null;
  }
}

function clearPersistentData(key: string): void {
  if (!isBrowser) return;
  try {
    localStorage.removeItem(PERSISTENCE_PREFIX + key);
  } catch (e) {
    console.warn('Failed to clear persistent popup data:', e);
  }
}

function ensureStylesInjected(zIndex: number): void {
  if (!isBrowser) return;
  const existing = document.getElementById(STYLE_ID);
  if (existing) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
  @keyframes xdp-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  @keyframes xdp-slide-up {
    from { 
      opacity: 0;
      transform: translateY(20px);
    }
    to { 
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .xdp-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    animation: xdp-fade-in 0.3s ease-out;
  }
  
  .xdp-dialog {
    background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
    border-radius: 16px;
    box-shadow: 
      0 20px 60px rgba(0, 0, 0, 0.3),
      0 0 0 1px rgba(255, 255, 255, 0.1);
    max-width: 480px;
    width: 100%;
    padding: 32px;
    position: relative;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    color: #1a1a1a;
    animation: xdp-slide-up 0.4s ease-out;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }
  
  /* Position styles */
  .xdp-position-center {
    align-items: center;
    justify-content: center;
  }
  
  .xdp-position-bottom-right {
    align-items: flex-end;
    justify-content: flex-end;
    padding: 20px;
  }
  
  .xdp-position-bottom-left {
    align-items: flex-end;
    justify-content: flex-start;
    padding: 20px;
  }
  
  .xdp-position-top-right {
    align-items: flex-start;
    justify-content: flex-end;
    padding: 20px;
  }
  
  .xdp-position-top-left {
    align-items: flex-start;
    justify-content: flex-start;
    padding: 20px;
  }
  
  /* Adjust dialog for corner positions */
  .xdp-position-bottom-right .xdp-dialog,
  .xdp-position-bottom-left .xdp-dialog,
  .xdp-position-top-right .xdp-dialog,
  .xdp-position-top-left .xdp-dialog {
    max-width: 380px;
    margin: 0;
  }
  
  /* Slide animations for different positions */
  @keyframes xdp-slide-up-right {
    from { 
      opacity: 0;
      transform: translate(20px, 20px);
    }
    to { 
      opacity: 1;
      transform: translate(0, 0);
    }
  }
  
  @keyframes xdp-slide-up-left {
    from { 
      opacity: 0;
      transform: translate(-20px, 20px);
    }
    to { 
      opacity: 1;
      transform: translate(0, 0);
    }
  }
  
  @keyframes xdp-slide-down-right {
    from { 
      opacity: 0;
      transform: translate(20px, -20px);
    }
    to { 
      opacity: 1;
      transform: translate(0, 0);
    }
  }
  
  @keyframes xdp-slide-down-left {
    from { 
      opacity: 0;
      transform: translate(-20px, -20px);
    }
    to { 
      opacity: 1;
      transform: translate(0, 0);
    }
  }
  
  .xdp-position-bottom-right .xdp-dialog {
    animation: xdp-slide-up-right 0.4s ease-out;
  }
  
  .xdp-position-bottom-left .xdp-dialog {
    animation: xdp-slide-up-left 0.4s ease-out;
  }
  
  .xdp-position-top-right .xdp-dialog {
    animation: xdp-slide-down-right 0.4s ease-out;
  }
  
  .xdp-position-top-left .xdp-dialog {
    animation: xdp-slide-down-left 0.4s ease-out;
  }
  
  .xdp-title {
    margin: 0 0 16px 0;
    font-size: 24px;
    font-weight: 700;
    line-height: 1.3;
    color: #1a1a1a;
    letter-spacing: -0.02em;
  }
  
  .xdp-body {
    margin: 0 0 24px 0;
    font-size: 16px;
    line-height: 1.6;
    color: #4a4a4a;
    white-space: pre-wrap;
  }
  
  .xdp-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-start;
    flex-wrap: wrap;
  }
  
  .xdp-cta {
    appearance: none;
    border: none;
    border-radius: 12px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: #ffffff;
    padding: 14px 28px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
    position: relative;
    overflow: hidden;
  }
  
  .xdp-cta:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
  }
  
  .xdp-cta:active {
    transform: translateY(0);
  }
  
  .xdp-close {
    position: absolute;
    right: 16px;
    top: 16px;
    width: 40px;
    height: 40px;
    border: none;
    background: rgba(0, 0, 0, 0.05);
    border-radius: 50%;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    color: #666;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }
  
  .xdp-close:hover {
    background: rgba(0, 0, 0, 0.1);
    color: #333;
    transform: rotate(90deg);
  }
  
  .xdp-root {
    position: fixed;
    inset: 0;
    z-index: ${zIndex};
  }
  
  @media (max-width: 640px) {
    .xdp-dialog {
      margin: 16px;
      padding: 24px;
      border-radius: 12px;
    }
    
    .xdp-title {
      font-size: 20px;
    }
    
    .xdp-body {
      font-size: 15px;
    }
    
    .xdp-cta {
      padding: 12px 24px;
      font-size: 15px;
      width: 100%;
    }
    
    .xdp-actions {
      flex-direction: column;
    }
  }
  `;
  document.head.appendChild(style);
}

function createRoot(containerId: string, zIndex: number): HTMLDivElement {
  const root = document.createElement("div");
  root.id = containerId;
  root.className = "xdp-root";
  root.style.zIndex = String(zIndex);
  return root;
}

function removeRoot(containerId: string): void {
  if (!isBrowser) return;
  const exist = document.getElementById(containerId);
  if (exist && exist.parentNode) exist.parentNode.removeChild(exist);
}

export function isPopupVisible(containerId: string = DEFAULT_CONTAINER_ID): boolean {
  if (!isBrowser) return false;
  const el = document.getElementById(containerId);
  return !!el;
}

export function hidePopup(containerId: string = DEFAULT_CONTAINER_ID, persistentKey?: string): void {
  if (persistentKey) {
    setPersistentData(persistentKey, { hidden: true, timestamp: Date.now() });
  }
  removeRoot(containerId);
}

// 新增：检查持久化弹窗是否应该显示
export function shouldShowPersistentPopup(persistentKey: string): boolean {
  return !getPersistentData(persistentKey);
}

// 新增：清除持久化数据
export function clearPersistentPopup(persistentKey: string): void {
  clearPersistentData(persistentKey);
}

// 新增：从策略结构创建弹窗的便捷方法
export interface PopupStrategy {
  method: 'POPUP';
  timing: 'IMMEDIATE' | 'DELAYED';
  content: {
    title: string;
    body: string;
    link: string;
    buttonText: string;
  };
}

export function showPopupFromStrategy(strategy: PopupStrategy, options: PopupOptions = {}): HTMLDivElement | null {
  const { content } = strategy;
  return showPopup({
    title: content.title,
    body: content.body,
    buttonText: content.buttonText,
    link: content.link
  }, options);
}

export function showPopup(payload: PopupPayload, options: PopupOptions = {}): HTMLDivElement | null {
  if (!isBrowser) return null;

  const { title, body, buttonText, buttonUrl, link } = payload;
  const containerId = options.containerId || DEFAULT_CONTAINER_ID;
  const zIndex = options.zIndex ?? 2147483000;
  const overlayClosable = options.overlayClosable ?? false;
  const position = options.position ?? 'bottom-right';
  const showOverlay = options.showOverlay ?? false;
  const persistent = options.persistent ?? false;
  const persistentKey = options.persistentKey;
  const expiresInSeconds = options.expiresInSeconds;

  // Check if this popup should be shown (for persistent popups)
  if (persistent && persistentKey) {
    const existingData = getPersistentData(persistentKey);
    if (existingData) {
      return null; // Don't show if already shown and persistent
    }
  }

  // 归一化按钮：优先使用 buttons，其次兼容新结构的 link 和 buttonText，最后兼容旧字段
  const normalizedButtons: PopupButton[] = (Array.isArray(payload.buttons) && payload.buttons.length > 0)
    ? payload.buttons
    : ((link && buttonText)
        ? [{ text: String(buttonText), url: String(link) }]
        : ((buttonText || buttonUrl)
            ? [{ text: String(buttonText || ""), url: String(buttonUrl || link || "#") }]
            : []));

  ensureStylesInjected(zIndex);

  // If exists, replace content
  removeRoot(containerId);
  const root = createRoot(containerId, zIndex);

  const overlay = document.createElement("div");
  overlay.className = `xdp-overlay xdp-position-${position}`;
  overlay.style.background = showOverlay ? 'rgba(0, 0, 0, 0.6)' : 'transparent';
  overlay.style.backdropFilter = showOverlay ? 'blur(4px)' : 'none';
  if (overlayClosable && showOverlay) overlay.addEventListener("click", () => hidePopup(containerId, persistentKey));

  const dialog = document.createElement("div");
  dialog.className = "xdp-dialog";
  dialog.addEventListener("click", (e) => e.stopPropagation());

  const closeBtn = document.createElement("button");
  closeBtn.className = "xdp-close";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", () => hidePopup(containerId, persistentKey));

  const titleEl = document.createElement("h3");
  titleEl.className = "xdp-title";
  titleEl.textContent = String(title || "");

  const bodyEl = document.createElement("div");
  bodyEl.className = "xdp-body";
  bodyEl.textContent = String(body || "");

  const actions = document.createElement("div");
  actions.className = "xdp-actions";

  // 渲染按钮（可能为多个）
  for (const btn of normalizedButtons) {
    const anchor = document.createElement("a");
    anchor.className = "xdp-cta";
    anchor.textContent = String(btn.text || "");
    anchor.href = String(btn.url || "#");
    anchor.target = btn.target ?? "_blank";
    anchor.rel = btn.rel ?? "noopener noreferrer";
    actions.appendChild(anchor);
  }

  dialog.appendChild(closeBtn);
  dialog.appendChild(titleEl);
  dialog.appendChild(bodyEl);
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  root.appendChild(overlay);

  document.body.appendChild(root);
  return root;
} 