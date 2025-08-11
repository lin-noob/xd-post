import { ReconnectionManager, NetworkStateDetector } from './reconnection-manager';
import { WebSocketClient } from './websocket-client';
import { SSEClient } from './sse-client';

export interface ConnectionMetrics {
  totalConnections: number;
  successfulConnections: number;
  failedConnections: number;
  totalReconnectionAttempts: number;
  averageReconnectionTime: number;
  lastConnectionDuration: number | null;
  uptime: number;
}

export class ReconnectionMonitor {
  private reconnectionManager: ReconnectionManager;
  private networkDetector: NetworkStateDetector;
  private metrics: ConnectionMetrics;
  private startTime: number;
  private connectionHistory: Array<{
    timestamp: number;
    type: 'connect' | 'disconnect' | 'reconnect';
    success: boolean;
    duration?: number;
  }> = [];

  constructor() {
    this.startTime = Date.now();
    this.metrics = {
      totalConnections: 0,
      successfulConnections: 0,
      failedConnections: 0,
      totalReconnectionAttempts: 0,
      averageReconnectionTime: 0,
      lastConnectionDuration: null,
      uptime: 0
    };

    this.reconnectionManager = new ReconnectionManager({
      onReconnectionAttempt: (attempt, delay) => {
        this.metrics.totalReconnectionAttempts++;
        this.logReconnectionAttempt(attempt, delay);
      },
      onMaxAttemptsReached: () => {
        this.logMaxAttemptsReached();
      }
    });

    this.networkDetector = new NetworkStateDetector();
    this.setupNetworkMonitoring();
  }

  private setupNetworkMonitoring(): void {
    this.networkDetector.addListener((isOnline) => {
      if (isOnline) {
        this.logNetworkRecovery();
      } else {
        this.logNetworkLoss();
      }
    });
  }

  /**
   * 监控 WebSocket 客户端
   */
  monitorWebSocket(wsClient: WebSocketClient): void {
    // 这里可以添加 WebSocket 特定的监控逻辑
    // 由于 WebSocket 客户端已经有内置的重连逻辑，我们主要监控其状态
    this.logClientMonitoring('WebSocket', wsClient);
  }

  /**
   * 监控 SSE 客户端
   */
  monitorSSE(sseClient: SSEClient): void {
    // 这里可以添加 SSE 特定的监控逻辑
    this.logClientMonitoring('SSE', sseClient);
  }

  /**
   * 记录连接事件
   */
  recordConnectionEvent(type: 'connect' | 'disconnect' | 'reconnect', success: boolean, duration?: number): void {
    const event = {
      timestamp: Date.now(),
      type,
      success,
      duration
    };

    this.connectionHistory.push(event);
    this.updateMetrics();
    this.logConnectionEvent(event);
  }

  /**
   * 更新连接指标
   */
  private updateMetrics(): void {
    const now = Date.now();
    this.metrics.uptime = now - this.startTime;

    // 统计连接历史
    this.metrics.totalConnections = this.connectionHistory.filter(e => e.type === 'connect').length;
    this.metrics.successfulConnections = this.connectionHistory.filter(e => e.type === 'connect' && e.success).length;
    this.metrics.failedConnections = this.connectionHistory.filter(e => e.type === 'connect' && !e.success).length;

    // 计算平均重连时间
    const reconnectEvents = this.connectionHistory.filter(e => e.type === 'reconnect' && e.duration);
    if (reconnectEvents.length > 0) {
      const totalReconnectTime = reconnectEvents.reduce((sum, e) => sum + (e.duration || 0), 0);
      this.metrics.averageReconnectionTime = totalReconnectTime / reconnectEvents.length;
    }

    // 记录最后一次连接持续时间
    const lastConnectEvent = this.connectionHistory
      .filter(e => e.type === 'connect' && e.success)
      .pop();
    
    if (lastConnectEvent) {
      this.metrics.lastConnectionDuration = lastConnectEvent.duration || null;
    }
  }

  /**
   * 获取连接指标
   */
  getMetrics(): ConnectionMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * 获取连接历史
   */
  getConnectionHistory(): Array<typeof this.connectionHistory[0]> {
    return [...this.connectionHistory];
  }

  /**
   * 获取重连统计
   */
  getReconnectionStats() {
    return this.reconnectionManager.getReconnectionStats();
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus() {
    return this.reconnectionManager.getConnectionStatus();
  }

  /**
   * 手动触发重连
   */
  forceReconnection(connectCallback: () => void): void {
    this.reconnectionManager.forceReconnection(connectCallback);
  }

  /**
   * 重置监控数据
   */
  resetMetrics(): void {
    this.connectionHistory = [];
    this.startTime = Date.now();
    this.metrics = {
      totalConnections: 0,
      successfulConnections: 0,
      failedConnections: 0,
      totalReconnectionAttempts: 0,
      averageReconnectionTime: 0,
      lastConnectionDuration: null,
      uptime: 0
    };
    this.reconnectionManager.resetReconnectionState();
  }

  /**
   * 生成连接报告
   */
  generateReport(): string {
    const metrics = this.getMetrics();
    const reconnectionStats = this.getReconnectionStats();
    const connectionStatus = this.getConnectionStatus();

    return `
=== 连接监控报告 ===
生成时间: ${new Date().toLocaleString()}
运行时长: ${Math.round(metrics.uptime / 1000)}秒

连接统计:
- 总连接次数: ${metrics.totalConnections}
- 成功连接: ${metrics.successfulConnections}
- 失败连接: ${metrics.failedConnections}
- 成功率: ${metrics.totalConnections > 0 ? (metrics.successfulConnections / metrics.totalConnections * 100).toFixed(2) : 0}%

重连统计:
- 总重连尝试: ${metrics.totalReconnectionAttempts}
- 平均重连时间: ${metrics.averageReconnectionTime.toFixed(2)}ms
- 剩余重连次数: ${reconnectionStats.remainingAttempts}

当前状态:
- 连接状态: ${connectionStatus.isConnected ? '已连接' : '未连接'}
- 重连状态: ${connectionStatus.isReconnecting ? '重连中' : '未重连'}
- 最后连接时间: ${connectionStatus.lastConnectionTime ? new Date(connectionStatus.lastConnectionTime).toLocaleString() : '无'}
- 连接持续时间: ${connectionStatus.connectionDuration ? Math.round(connectionStatus.connectionDuration / 1000) + '秒' : '无'}

网络状态: ${this.networkDetector.isOnline() ? '在线' : '离线'}
    `.trim();
  }

  // 日志记录方法
  private logReconnectionAttempt(attempt: number, delay: number): void {
    console.log(`🔄 重连尝试 #${attempt}，延迟 ${delay}ms`);
  }

  private logMaxAttemptsReached(): void {
    console.error('❌ 重连次数已达上限');
  }

  private logNetworkRecovery(): void {
    console.log('🌐 网络已恢复');
  }

  private logNetworkLoss(): void {
    console.warn('🌐 网络已断开');
  }

  private logClientMonitoring(clientType: string, client: WebSocketClient | SSEClient): void {
    console.log(`📡 开始监控 ${clientType} 客户端`);
  }

  private logConnectionEvent(event: typeof this.connectionHistory[0]): void {
    const status = event.success ? '✅' : '❌';
    const duration = event.duration ? ` (${event.duration}ms)` : '';
    console.log(`${status} ${event.type} ${duration}`);
  }

  /**
   * 清理资源
   */
  destroy(): void {
    this.reconnectionManager.destroy();
    this.networkDetector.destroy();
  }
} 