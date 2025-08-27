# XD-Post 弹窗推送系统

这个项目包含了一个弹窗显示系统，支持通过 WebSocket 和 Server-Sent Events (SSE) 接收后端推送的弹窗消息。

## 功能特性

- 🎯 弹窗显示：支持标题、正文、单按钮或多按钮配置
- 🔌 WebSocket 支持：实时双向通信
- 📡 SSE 支持：服务器推送事件
- 🔄 智能重连：指数退避策略 + 随机抖动
- 📊 连接监控：实时监控连接状态和重连统计
- 🌐 网络检测：自动检测网络状态变化
- ⏱️ 页面停留时间跟踪：精确跟踪用户页面停留行为
- 🎨 现代化UI：美观的弹窗界面
- 📱 响应式设计：适配不同屏幕尺寸

## 文件结构

```
src/
├── popup.ts                    # 弹窗核心逻辑
├── websocket-client.ts         # WebSocket 客户端
├── sse-client.ts               # SSE 客户端
├── reconnection-manager.ts     # 重连管理器
├── reconnection-monitor.ts     # 重连监控工具
├── page-tracker.ts             # 页面停留时间跟踪核心模块
├── auto-tracking-example.ts    # 自动页面跟踪示例
└── page-tracking-example.ts    # 页面停留时间跟踪示例
```

## 快速开始

### 1. 初始化推送客户端

```typescript
import { initializePushClients } from './example-usage';

// 初始化 WebSocket 和 SSE 客户端
const { wsClient, sseClient } = initializePushClients();
```

### 2. 后端消息格式

后端需要发送以下格式的消息来触发弹窗：

#### WebSocket 消息格式
```json
{
  "type": "popup",
  "payload": {
    "title": "通知标题",
    "bodyText": "这是通知内容",
    "buttons": [
      {
        "text": "确定",
        "url": "https://example.com",
        "target": "_blank"
      },
      {
        "text": "取消",
        "url": "#"
      }
    ]
  },
  "options": {
    "containerId": "custom-popup",
    "overlayClosable": true,
    "zIndex": 9999
  }
}
```

#### SSE 消息格式
```json
{
  "type": "popup",
  "payload": {
    "title": "通知标题",
    "bodyText": "这是通知内容",
    "buttonText": "确定",
    "buttonUrl": "https://example.com"
  }
}
```

### 3. 配置选项

#### WebSocket 配置
```typescript
const wsConfig: WebSocketConfig = {
  url: 'ws://localhost:8080/ws',
  reconnectInterval: 3000,        // 基础重连延迟（毫秒）
  maxReconnectAttempts: 5,        // 最大重连次数
  onOpen: () => console.log('连接成功'),
  onClose: () => console.log('连接关闭'),
  onError: (error) => console.error('连接错误', error),
  onMessage: (data) => console.log('收到消息', data)
};
```

#### SSE 配置
```typescript
const sseConfig: SSEConfig = {
  url: 'http://localhost:8080/events',
  withCredentials: true,           // 是否携带认证信息
  retryInterval: 3000,            // 基础重试延迟（毫秒）
  maxRetryAttempts: 5,            // 最大重试次数
  onOpen: () => console.log('连接成功'),
  onError: (error) => console.error('连接错误', error),
  onMessage: (data) => console.log('收到消息', data)
};
```

#### 高级重连配置
```typescript
import { ReconnectionManager } from './reconnection-manager';

const reconnectionManager = new ReconnectionManager({
  baseDelay: 1000,              // 基础延迟（毫秒）
  maxDelay: 30000,              // 最大延迟（毫秒）
  maxAttempts: 10,              // 最大重连次数
  backoffMultiplier: 2,         // 退避倍数
  jitterRange: 1000,            // 随机抖动范围（毫秒）
  onMaxAttemptsReached: () => {
    console.error('重连次数已达上限');
  },
  onReconnectionAttempt: (attempt, delay) => {
    console.log(`第 ${attempt} 次重连，延迟 ${delay}ms`);
  }
});
```

### 4. 弹窗配置选项

```typescript
interface PopupOptions {
  containerId?: string;           // 弹窗容器ID
  overlayClosable?: boolean;      // 是否可点击遮罩关闭
  zIndex?: number;               // 弹窗层级
}
```

### 5. 按钮配置

```typescript
interface PopupButton {
  text: string;                  // 按钮文本
  url: string;                   // 按钮链接
  target?: string;               // 链接打开方式（默认 _blank）
  rel?: string;                  // 链接关系（默认 noopener noreferrer）
}
```

## 使用示例

### 基本使用

```typescript
import { WebSocketClient } from './websocket-client';
import { SSEClient } from './sse-client';

// 创建 WebSocket 客户端
const wsClient = new WebSocketClient({
  url: 'ws://localhost:8080/ws'
});
wsClient.connect();

// 创建 SSE 客户端
const sseClient = new SSEClient({
  url: 'http://localhost:8080/events'
});
sseClient.connect();

// 检查连接状态
console.log('WebSocket 状态:', wsClient.isConnected());
console.log('SSE 状态:', sseClient.isConnected());

// 清理连接
wsClient.disconnect();
sseClient.disconnect();
```

### 高级重连管理

```typescript
import { ReconnectionManager, NetworkStateDetector } from './reconnection-manager';
import { ReconnectionMonitor } from './reconnection-monitor';

// 创建重连管理器
const reconnectionManager = new ReconnectionManager({
  baseDelay: 1000,
  maxDelay: 30000,
  maxAttempts: 10,
  backoffMultiplier: 2,
  jitterRange: 1000
});

// 创建网络状态检测器
const networkDetector = new NetworkStateDetector();
networkDetector.addListener((isOnline) => {
  if (isOnline) {
    console.log('网络恢复，重新连接');
    reconnectionManager.forceReconnection(() => {
      wsClient.reconnect();
      sseClient.reconnect();
    });
  }
});

// 创建连接监控器
const monitor = new ReconnectionMonitor();
monitor.monitorWebSocket(wsClient);
monitor.monitorSSE(sseClient);

// 生成连接报告
setInterval(() => {
  console.log(monitor.generateReport());
}, 60000); // 每分钟生成一次报告
```

### 页面停留时间跟踪

#### 手动跟踪（原有功能）

```typescript
import { 
  startPageViewTracking, 
  stopPageViewTracking,
  trackCurrentPageDuration,
  getCurrentPageDuration 
} from './index';

// 基础使用
const tracker = startPageViewTracking();

// 获取当前停留时间
const duration = getCurrentPageDuration();
console.log(`当前页面停留时间: ${duration}ms`);

// 手动上报
trackCurrentPageDuration();

// 停止跟踪
stopPageViewTracking();

// 自定义配置
const customTracker = startPageViewTracking('/product-page', {
  minDuration: 2000,           // 最小停留时间 2 秒
  maxDuration: 60000,          // 最大停留时间 1 分钟
  heartbeatInterval: 15000,    // 心跳间隔 15 秒
  trackOnVisibilityChange: true, // 跟踪页面可见性变化
  customProperties: {
    user_type: 'premium',
    page_category: 'product'
  }
});

// SPA 应用中的页面切换
customTracker.updatePage('/product-detail');
```

#### 自动跟踪（新功能）

```typescript
import { enableAutoPageTracking, disableAutoPageTracking } from './index';

// 启用自动页面跟踪
enableAutoPageTracking({
  minDuration: 2000,           // 最小停留时间 2 秒
  maxDuration: 300000,         // 最大停留时间 5 分钟
  heartbeatInterval: 30000,    // 心跳间隔 30 秒
  trackOnUnload: true,         // 页面卸载时上报
  trackOnVisibilityChange: true, // 页面可见性变化时上报
  customProperties: {
    tracking_mode: 'auto',
    user_type: 'visitor'
  }
});

// 自动跟踪会：
// 1. 页面加载时自动开始计时
// 2. 路由变化时自动切换页面
// 3. 超过最大时长时自动停止跟踪
// 4. 页面隐藏/显示时智能处理
// 5. 页面卸载时自动上报

// 停止自动跟踪
disableAutoPageTracking();
```

#### 页面停留时间自动上报（新增功能）

```typescript
import { enableAutoTracker } from './index';

// 启用全量自动埋点，包括页面停留时间自动上报
enableAutoTracker({
  endpoint: 'https://your-api-endpoint.com/track',
  // 页面停留时间配置
  pageDwellTime: {
    enabled: true,        // 启用页面停留时间自动上报
    interval: 10000,      // 每10秒自动上报一次
    eventName: 'PageDwellTime' // 自定义事件名称
  }
});

// 手动触发页面停留时间上报
import { trackPageDwellTime } from './index';
trackPageDwellTime(); // 使用默认配置上报
trackPageDwellTime('CustomDwellTimeEvent'); // 使用自定义事件名上报
```

### 自定义弹窗样式

弹窗样式可以通过修改 `popup.ts` 中的 CSS 来自定义，或者通过 `zIndex` 选项调整层级。

## 注意事项

1. **浏览器兼容性**：WebSocket 和 SSE 都要求现代浏览器支持
2. **连接管理**：记得在页面卸载时调用 `disconnect()` 方法清理连接
3. **错误处理**：建议配置 `onError` 回调来处理连接错误
4. **重连策略**：使用指数退避策略，避免频繁重连对服务器造成压力
5. **网络监控**：建议启用网络状态检测，在网络恢复时自动重连
6. **性能监控**：使用连接监控器跟踪连接质量和重连性能
7. **页面跟踪**：支持页面可见性变化检测，提供精确的停留时间统计

## 开发

### 构建项目

```bash
npm install
npm run build
```

### 运行测试

```bash
npm test
```

## 许可证

MIT License 