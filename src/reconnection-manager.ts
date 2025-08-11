export interface ReconnectionConfig {
  baseDelay: number;           // 基础重连延迟（毫秒）
  maxDelay: number;            // 最大重连延迟（毫秒）
  maxAttempts: number;         // 最大重连次数
  backoffMultiplier: number;   // 退避倍数
  jitterRange: number;         // 随机抖动范围（毫秒）
  onMaxAttemptsReached?: () => void;
  onReconnectionAttempt?: (attempt: number, delay: number) => void;
}

export interface ConnectionStatus {
  isConnected: boolean;
  isReconnecting: boolean;
  reconnectAttempts: number;
  lastConnectionTime: number | null;
  lastDisconnectionTime: number | null;
  connectionDuration: number | null;
}

export class ReconnectionManager {
  private config: ReconnectionConfig;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isReconnecting = false;
  private connectionStartTime: number | null = null;
  private lastDisconnectionTime: number | null = null;

  constructor(config: Partial<ReconnectionConfig> = {}) {
    this.config = {
      baseDelay: 1000,
      maxDelay: 30000,
      maxAttempts: 10,
      backoffMultiplier: 2,
      jitterRange: 1000,
      ...config
    };
  }

  /**
   * 开始重连流程
   */
  startReconnection(connectCallback: () => void): void {
    if (this.isReconnecting || this.reconnectAttempts >= this.config.maxAttempts) {
      if (this.reconnectAttempts >= this.config.maxAttempts) {
        this.config.onMaxAttemptsReached?.();
      }
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;
    
    const delay = this.calculateReconnectDelay();
    
    this.config.onReconnectionAttempt?.(this.reconnectAttempts, delay);
    
    console.log(`Reconnection attempt ${this.reconnectAttempts}/${this.config.maxAttempts} in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.isReconnecting = false;
      connectCallback();
    }, delay);
  }

  /**
   * 计算重连延迟（指数退避 + 随机抖动）
   */
  private calculateReconnectDelay(): number {
    const exponentialDelay = this.config.baseDelay * Math.pow(
      this.config.backoffMultiplier, 
      this.reconnectAttempts - 1
    );
    
    // 限制最大延迟
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelay);
    
    // 添加随机抖动
    const jitter = (Math.random() - 0.5) * this.config.jitterRange;
    
    return Math.max(0, cappedDelay + jitter);
  }

  /**
   * 记录连接成功
   */
  onConnectionSuccess(): void {
    this.connectionStartTime = Date.now();
    this.lastDisconnectionTime = null;
    this.resetReconnectionState();
  }

  /**
   * 记录连接断开
   */
  onConnectionLost(): void {
    this.lastDisconnectionTime = Date.now();
  }

  /**
   * 重置重连状态
   */
  resetReconnectionState(): void {
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * 手动触发重连
   */
  forceReconnection(connectCallback: () => void): void {
    this.resetReconnectionState();
    this.startReconnection(connectCallback);
  }

  /**
   * 停止重连
   */
  stopReconnection(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.isReconnecting = false;
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus(): ConnectionStatus {
    const now = Date.now();
    const connectionDuration = this.connectionStartTime 
      ? now - this.connectionStartTime 
      : null;

    return {
      isConnected: this.connectionStartTime !== null && this.lastDisconnectionTime === null,
      isReconnecting: this.isReconnecting,
      reconnectAttempts: this.reconnectAttempts,
      lastConnectionTime: this.connectionStartTime,
      lastDisconnectionTime: this.lastDisconnectionTime,
      connectionDuration
    };
  }

  /**
   * 获取重连统计信息
   */
  getReconnectionStats() {
    return {
      totalAttempts: this.reconnectAttempts,
      maxAttempts: this.config.maxAttempts,
      remainingAttempts: Math.max(0, this.config.maxAttempts - this.reconnectAttempts),
      isMaxAttemptsReached: this.reconnectAttempts >= this.config.maxAttempts
    };
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<ReconnectionConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 清理资源
   */
  destroy(): void {
    this.stopReconnection();
    this.resetReconnectionState();
    this.connectionStartTime = null;
    this.lastDisconnectionTime = null;
  }
}

/**
 * 网络状态检测器
 */
export class NetworkStateDetector {
  private listeners: Array<(isOnline: boolean) => void> = [];

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.notifyListeners(true));
      window.addEventListener('offline', () => this.notifyListeners(false));
    }
  }

  addListener(callback: (isOnline: boolean) => void): void {
    this.listeners.push(callback);
  }

  removeListener(callback: (isOnline: boolean) => void): void {
    const index = this.listeners.indexOf(callback);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  private notifyListeners(isOnline: boolean): void {
    this.listeners.forEach(callback => callback(isOnline));
  }

  isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  destroy(): void {
    this.listeners = [];
  }
} 