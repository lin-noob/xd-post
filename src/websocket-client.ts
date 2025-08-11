import { showPopup, PopupPayload } from './popup';

export interface WebSocketConfig {
  url: string;
  protocols?: string | string[];
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  onMessage?: (data: any) => void;
}

export interface PopupMessage {
  type: 'popup';
  payload: PopupPayload;
  options?: {
    containerId?: string;
    overlayClosable?: boolean;
    zIndex?: number;
  };
}

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private config: WebSocketConfig;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;

  constructor(config: WebSocketConfig) {
    this.config = {
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
      ...config
    };
  }

  connect(): void {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.isConnecting = true;
    
    try {
      this.ws = new WebSocket(this.config.url, this.config.protocols);
      this.setupEventHandlers();
    } catch (error) {
      console.error('WebSocket connection failed:', error);
      this.isConnecting = false;
      this.handleReconnect();
    }
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.config.onOpen?.();
    };

    this.ws.onclose = (event) => {
      console.log('WebSocket disconnected:', event.code, event.reason);
      this.isConnecting = false;
      this.config.onClose?.();
      
      if (!event.wasClean) {
        this.handleReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.isConnecting = false;
      this.config.onError?.(error);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
        this.config.onMessage?.(data);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };
  }

  private handleMessage(data: any): void {
    if (data.type === 'popup') {
      const popupMessage = data as PopupMessage;
      showPopup(popupMessage.payload, popupMessage.options);
    }
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts >= (this.config.maxReconnectAttempts || 5)) {
      console.error('Max reconnection attempts reached');
      this.config.onError?.(new Event('Max reconnection attempts reached'));
      return;
    }

    this.reconnectAttempts++;
    const delay = this.calculateReconnectDelay();
    console.log(`Attempting to reconnect in ${delay}ms... (${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private calculateReconnectDelay(): number {
    // 指数退避策略：基础延迟 * 2^(重连次数-1)，最大延迟为30秒
    const baseDelay = this.config.reconnectInterval || 3000;
    const maxDelay = 30000;
    const delay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts - 1), maxDelay);
    
    // 添加随机抖动，避免多个客户端同时重连
    const jitter = Math.random() * 1000;
    return delay + jitter;
  }

  // 手动触发重连
  reconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    this.connect();
  }

  // 重置重连计数
  resetReconnectAttempts(): void {
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  send(data: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket is not connected');
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.isConnecting = false;
    this.reconnectAttempts = 0;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getReadyState(): number {
    return this.ws?.readyState || WebSocket.CLOSED;
  }
} 