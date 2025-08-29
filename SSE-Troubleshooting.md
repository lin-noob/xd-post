# SSE 连接错误排查指南

## 常见错误及解决方案

### 1. ClientAbortException: java.io.IOException

**错误原因**：
- 客户端（浏览器）异常终止了连接
- 页面刷新、关闭或网络中断
- 单页应用路由跳转时未正确断开 SSE 连接

**已实现的解决方案**：
```javascript
// 在页面离开前自动断开 SSE 连接 (auto-tracker.ts:1251-1258)
const leaveHandler = () => {
  // 在页面离开前断开 SSE 连接
  if (sseClient) {
    console.log("[XD-Tracker] 页面即将离开，断开 SSE 连接");
    sseClient.disconnect();
  }
  onPageLeave(true);
};
```

**解决方案**：
```javascript
// 在服务器端添加异常处理
try {
    // SSE 处理逻辑
} catch (ClientAbortException e) {
    // 客户端正常断开，无需处理
    log.debug("客户端断开连接: " + e.getMessage());
} catch (IOException e) {
    // 其他 IO 异常
    log.error("SSE 连接异常: " + e.getMessage());
}
```

### 2. 多次调用 enableAutoTracker 的优化

虽然代码已有防重复机制，但可以进一步优化：

```javascript
// 添加全局锁防止并发调用
let isInitializing = false;

export async function enableAutoTracker(options: AutoTrackerOptions): Promise<void> {
    if (isInitializing) {
        console.warn("[XD-Tracker] 正在初始化中，请稍候");
        return;
    }
    
    isInitializing = true;
    try {
        // 原有逻辑...
    } finally {
        isInitializing = false;
    }
}
```

### 3. SSE 连接监控

```javascript
// 添加连接健康检查
function setupSSEHealthCheck() {
    setInterval(() => {
        if (sseClient && !sseClient.isConnected()) {
            console.warn("[XD-Tracker] SSE 连接异常，尝试重连");
            sseClient.reconnect();
        }
    }, 30000); // 每30秒检查一次
}
```

### 4. 网络状态处理

```javascript
// 监听网络状态变化
window.addEventListener('online', () => {
    console.log("[XD-Tracker] 网络已恢复，重新连接 SSE");
    if (sseClient && !sseClient.isConnected()) {
        sseClient.reconnect();
    }
});

window.addEventListener('offline', () => {
    console.log("[XD-Tracker] 网络已断开");
});
```

## 调试方法

1. **查看连接状态**：
```javascript
console.log(getTrackerStatus());
```

2. **启用详细日志**：
```javascript
// 在开发环境中启用详细日志
if (process.env.NODE_ENV === 'development') {
    console.log("[XD-Tracker] Debug mode enabled");
}
```

## 服务器端建议

1. 设置合理的超时时间
2. 实现心跳机制
3. 添加连接数限制
4. 记录连接日志用于排查问题