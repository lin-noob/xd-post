import { showPopup, PopupPayload } from "./popup";

export interface WebSocketConfig {
  url: string;
  sessionId?: string;
  headers?: Record<string, string>;
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

export class WebSocketClient {
  private websocket: WebSocket | null = null;
  private config: WebSocketConfig;
  private retryAttempts = 0;
  private retryTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private heartbeatInterval = 30000; // 30秒心跳间隔

  constructor(config: WebSocketConfig) {
    this.config = {
      retryInterval: 3000,
      maxRetryAttempts: 5,
      autoHandlePopup: true,
      ...config,
    };
  }

  connect(): void {
    if (this.isConnecting || this.websocket?.readyState === WebSocket.OPEN) {
      return;
    }

    this.isConnecting = true;

    try {
      // 构建 WebSocket URL，添加 sessionId 参数
      let url = this.config.url;
      if (this.config.sessionId) {
        const separator = url.includes("?") ? "&" : "?";
        url = `${url}/${encodeURIComponent(this.config.sessionId)}`;
      }

      // 如果是 http/https 协议，转换为 ws/wss
      if (url.startsWith("http://")) {
        url = url.replace("http://", "ws://");
      } else if (url.startsWith("https://")) {
        url = url.replace("https://", "wss://");
      }

      // 创建 WebSocket 实例
      this.websocket = new WebSocket(url);

      this.setupEventHandlers();
    } catch (error) {
      console.error("WebSocket connection failed:", error);
      this.isConnecting = false;
      this.handleRetry();
    }
  }

  private setupEventHandlers(): void {
    if (!this.websocket) return;

    this.websocket.onopen = () => {
      console.log("WebSocket connected");
      this.isConnecting = false;
      this.retryAttempts = 0;

      // 启动心跳机制
      this.startHeartbeat();

      this.config.onOpen?.();
    };

    this.websocket.onerror = (error) => {
      console.error("WebSocket error:", error);
      this.isConnecting = false;
      this.config.onError?.(error);

      // 处理重连
      this.handleRetry();
    };

    this.websocket.onclose = (event) => {
      console.log("WebSocket closed:", event.code, event.reason);
      this.isConnecting = false;

      // 清理心跳
      this.stopHeartbeat();

      this.config.onClose?.();

      // 如果不是主动关闭，尝试重连
      if (!event.wasClean) {
        this.handleRetry();
      }
    };

    this.websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
        // 调用外部回调
        this.config.onMessage?.(data);
      } catch (error) {
        console.error("[WebSocket] Failed to parse message:", error);
      }
    };
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
        // 发送心跳消息
        this.websocket.send(JSON.stringify({ type: "ping" }));
      }
    }, this.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private handleMessage(data: any): void {
    try {
      // 处理弹窗消息
      if (data.type === "success") {
        const message = JSON.parse(data.message);
        this.handlePopupMessage(message);
        return;
      } else {
        console.log("[WebSocket] 收到消息:", data);
      }
    } catch (error) {
      console.log("[WebSocket] error:", error);
    }
  }

  private handlePopupMessage(data: any): void {
    if (this.config.autoHandlePopup) {
      const popupMessage = data as PopupMessage;
      showPopup(popupMessage.strategy.content, popupMessage.options);
      console.log("[WebSocket] 自动显示弹窗:", popupMessage.payload.title);
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
      `Attempting to retry WebSocket connection in ${delay}ms... (${this.retryAttempts}/${this.config.maxRetryAttempts})`
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

    // 添加随机抖动，避免多个客户端同时重连
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

  disconnect(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    // 停止心跳
    this.stopHeartbeat();

    if (this.websocket) {
      // 先关闭 WebSocket
      this.websocket.close(1000, "Client disconnect");
      this.websocket = null;
    }

    this.isConnecting = false;
    this.retryAttempts = 0;
  }

  isConnected(): boolean {
    return this.websocket?.readyState === WebSocket.OPEN;
  }

  getReadyState(): number {
    return this.websocket?.readyState || WebSocket.CLOSED;
  }

  // 获取连接状态描述
  getReadyStateText(): string {
    const state = this.getReadyState();
    switch (state) {
      case WebSocket.CONNECTING:
        return "CONNECTING";
      case WebSocket.OPEN:
        return "OPEN";
      case WebSocket.CLOSING:
        return "CLOSING";
      case WebSocket.CLOSED:
        return "CLOSED";
      default:
        return "UNKNOWN";
    }
  }

  // 发送消息
  send(data: any): boolean {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      try {
        this.websocket.send(data);
        return true;
      } catch (error) {
        console.error("Failed to send WebSocket message:", error);
        return false;
      }
    }
    return false;
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
