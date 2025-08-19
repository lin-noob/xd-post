const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";

export interface PopupButton {
  text: string;
  url: string;
  target?: string;
  rel?: string;
}

export interface PopupPayload {
  title: string;
  bodyText: string;
  // 兼容旧字段（单按钮）
  buttonText?: string;
  buttonUrl?: string;
  // 新增：支持多按钮
  buttons?: PopupButton[];
}

export interface PopupOptions {
  containerId?: string;
  overlayClosable?: boolean;
  zIndex?: number;
}

const DEFAULT_CONTAINER_ID = "xd-post-popup";
const STYLE_ID = "xd-post-popup-style";

function ensureStylesInjected(zIndex: number): void {
  if (!isBrowser) return;
  const existing = document.getElementById(STYLE_ID);
  if (existing) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
  .xdp-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;}
  .xdp-dialog{background:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.2);max-width:420px;width:90%;padding:20px 20px 16px;position:relative;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111}
  .xdp-title{margin:0 24px 8px 0;font-size:18px;font-weight:600;line-height:1.4;color:#111}
  .xdp-body{margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#444;white-space:pre-wrap}
  .xdp-actions{display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap}
  .xdp-cta{appearance:none;border:0;border-radius:8px;background:#1677ff;color:#fff;padding:10px 14px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}
  .xdp-cta:hover{background:#145edb}
  .xdp-close{position:absolute;right:10px;top:10px;border:0;background:transparent;font-size:18px;line-height:1;cursor:pointer;color:#666}
  .xdp-root{position:fixed;inset:0;z-index:${zIndex};}
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

export function hidePopup(containerId: string = DEFAULT_CONTAINER_ID): void {
  removeRoot(containerId);
}

export function showPopup(payload: PopupPayload, options: PopupOptions = {}): HTMLDivElement | null {
  if (!isBrowser) return null;

  const { title, bodyText, buttonText, buttonUrl } = payload;
  const containerId = options.containerId || DEFAULT_CONTAINER_ID;
  const zIndex = options.zIndex ?? 2147483000;
  const overlayClosable = options.overlayClosable ?? false;

  // 归一化按钮：优先使用 buttons，其次兼容旧字段
  const normalizedButtons: PopupButton[] = (Array.isArray(payload.buttons) && payload.buttons.length > 0)
    ? payload.buttons
    : ((buttonText || buttonUrl)
        ? [{ text: String(buttonText || ""), url: String(buttonUrl || "#") }]
        : []);

  ensureStylesInjected(zIndex);

  // If exists, replace content
  removeRoot(containerId);
  const root = createRoot(containerId, zIndex);

  const overlay = document.createElement("div");
  overlay.className = "xdp-overlay";
  if (overlayClosable) overlay.addEventListener("click", () => hidePopup(containerId));

  const dialog = document.createElement("div");
  dialog.className = "xdp-dialog";
  dialog.addEventListener("click", (e) => e.stopPropagation());

  const closeBtn = document.createElement("button");
  closeBtn.className = "xdp-close";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", () => hidePopup(containerId));

  const titleEl = document.createElement("h3");
  titleEl.className = "xdp-title";
  titleEl.textContent = String(title || "");

  const bodyEl = document.createElement("div");
  bodyEl.className = "xdp-body";
  bodyEl.textContent = String(bodyText || "");

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