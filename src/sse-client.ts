import { showPopup, PopupPayload } from "./popup";

export interface SSEConfig {
  url: string;
  sessionId?: string;
  headers?: Record<string, string>;
  withCredentials?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  onMessage?: (data: any) => void;
  retryInterval?: number;
  maxRetryAttempts?: number;
  autoHandlePopup?: boolean; // 是否自动处理弹窗消息，默认 true
}

export interface PopupMessage {
  type: "popup";
  payload: PopupPayload;
  strategy: any;
  options?: {
    containerId?: string;
    overlayClosable?: boolean;
    zIndex?: number;
  };
}

export class SSEClient {
  private eventSource: EventSource | null = null;
  private config: SSEConfig;
  private retryAttempts = 0;
  private retryTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;

  constructor(config: SSEConfig) {
    this.config = {
      retryInterval: 3000,
      maxRetryAttempts: 5,
      autoHandlePopup: true,
      ...config,
    };
  }

  connect(): void {
    if (
      this.isConnecting ||
      this.eventSource?.readyState === EventSource.OPEN
    ) {
      return;
    }

    this.isConnecting = true;

    try {
      // 构建 URL，添加 sessionId 参数
      let url = this.config.url;
      if (this.config.sessionId) {
        const separator = url.includes("?") ? "&" : "?";
        url = `${url}${separator}sessionId=${encodeURIComponent(
          this.config.sessionId
        )}`;
      }

      // 创建 EventSource 实例
      this.eventSource = new EventSource(url, {
        withCredentials: this.config.withCredentials,
      });

      this.setupEventHandlers();
    } catch (error) {
      console.error("SSE connection failed:", error);
      this.isConnecting = false;
      this.handleRetry();
    }
  }

  private setupEventHandlers(): void {
    if (!this.eventSource) return;

    this.eventSource.onopen = () => {
      console.log("SSE connected");
      this.isConnecting = false;
      this.retryAttempts = 0;
      this.config.onOpen?.();
    };

    this.eventSource.onerror = (error) => {
      console.error("SSE error:", error);
      this.isConnecting = false;
      this.config.onError?.(error);

      // SSE 会自动重连，但我们也可以添加自定义重连逻辑
      if (this.eventSource?.readyState === EventSource.CLOSED) {
        this.handleRetry();
      }
    };

    // 监听自定义事件类型
    this.eventSource.addEventListener("popup", (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handlePopupMessage(data);
        // 仍然调用外部回调
        this.config.onMessage?.(data);
      } catch (error) {
        console.error("[SSE] Failed to parse popup message:", error);
      }
    });

    // 监听通用消息事件
    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(JSON.parse(event.data));
        this.handlePopupMessage(data);
        // 调用外部回调
        this.config.onMessage?.(data);
      } catch (error) {
        console.error("[SSE] Failed to parse SSE message:", error);
      }
    };
  }

  private handlePopupMessage(data: any): void {
    if (this.config.autoHandlePopup) {
      const popupMessage = data as PopupMessage;
      showPopup(popupMessage.strategy.content, popupMessage.options);
      console.log("[SSE] 自动显示弹窗:", popupMessage.payload.title);
    }
  }

  private handleMessage(data: any): void {
    // 处理通用消息（弹窗消息由专门的 event handler 处理）
    // 这里只处理非弹窗消息
    if (data.type !== "popup") {
      // 可以在这里添加其他类型的消息处理逻辑
      console.log("[SSE] 收到非弹窗消息:", data);
    }
  }

  private handleRetry(): void {
    if (this.retryAttempts >= (this.config.maxRetryAttempts || 5)) {
      console.error("Max retry attempts reached");
      this.config.onError?.(new Event("Max retry attempts reached"));
      return;
    }

    this.retryAttempts++;
    const delay = this.calculateRetryDelay();
    console.log(
      `Attempting to retry SSE connection in ${delay}ms... (${this.retryAttempts}/${this.config.maxRetryAttempts})`
    );

    this.retryTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private calculateRetryDelay(): number {
    // 指数退避策略：基础延迟 * 2^(重试次数-1)，最大延迟为30秒
    const baseDelay = this.config.retryInterval || 3000;
    const maxDelay = 30000;
    const delay = Math.min(
      baseDelay * Math.pow(2, this.retryAttempts - 1),
      maxDelay
    );

    // 添加随机抖动，避免多个客户端同时重试
    const jitter = Math.random() * 1000;
    return delay + jitter;
  }

  // 手动触发重连
  reconnect(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.retryAttempts = 0;
    this.connect();
  }

  // 重置重试计数
  resetRetryAttempts(): void {
    this.retryAttempts = 0;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  // 添加自定义事件监听器
  addEventListener(eventType: string, listener: EventListener): void {
    if (this.eventSource) {
      this.eventSource.addEventListener(eventType, listener);
    }
  }

  // 移除自定义事件监听器
  removeEventListener(eventType: string, listener: EventListener): void {
    if (this.eventSource) {
      this.eventSource.removeEventListener(eventType, listener);
    }
  }

  disconnect(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.isConnecting = false;
    this.retryAttempts = 0;
  }

  isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }

  getReadyState(): number {
    return this.eventSource?.readyState || EventSource.CLOSED;
  }

  // 获取连接状态描述
  getReadyStateText(): string {
    const state = this.getReadyState();
    switch (state) {
      case EventSource.CONNECTING:
        return "CONNECTING";
      case EventSource.OPEN:
        return "OPEN";
      case EventSource.CLOSED:
        return "CLOSED";
      default:
        return "UNKNOWN";
    }
  }

  // 更新 sessionId 并重新连接
  updateSessionId(sessionId: string): void {
    this.config.sessionId = sessionId;
    if (this.isConnected()) {
      // 如果已连接，需要重新连接以应用新的 sessionId
      this.disconnect();
      this.connect();
    }
  }

  // 获取当前 sessionId
  getSessionId(): string | undefined {
    return this.config.sessionId;
  }

  // 获取当前 URL
  getUrl(): string {
    return this.config.url;
  }

  // 设置是否自动处理弹窗
  setAutoHandlePopup(enabled: boolean): void {
    this.config.autoHandlePopup = enabled;
  }

  // 获取当前自动处理弹窗设置
  getAutoHandlePopup(): boolean {
    return this.config.autoHandlePopup ?? true;
  }
}
