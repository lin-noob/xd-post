# SDK AppId 使用说明

## 概述

从版本 0.1.7 开始，SDK 新增了必填参数 `sdk`，用于标识不同的应用程序。此参数会在所有上报事件中自动包含。

## 使用方法

### 初始化 SDK

```javascript
import { enableAutoTracker } from 'xd-post';

// 初始化时必须提供 sdk
await enableAutoTracker({
  endpoint: 'https://your-api-endpoint.com',
  sdk: 'your-app-id',  // 必填参数
  businessId: 'your-business-id',
  // 其他配置...
});
```

### 在浏览器中使用（UMD/IIFE）

```html
<script src="https://cdn.example.com/xd-post/dist/index.umd.js"></script>
<script>
  // 必须提供 sdk
  XDTracker.enableAutoTracker({
    endpoint: 'https://your-api-endpoint.com',
    sdk: 'your-app-id',  // 必填参数
    businessId: 'your-business-id'
  });
</script>
```

## 事件数据

所有上报的事件都会自动包含 `sdk` 字段：

```json
{
  "eventType": "PageView",
  "timestamp": 1634567890123,
  "sessionId": "uuid-string",
  "sdk": "your-app-id",  // 自动添加
  "pageTitle": "页面标题",
  "pageURL": "https://example.com/page",
  // ... 其他字段
}
```

## 错误处理

如果未提供 `sdk`，SDK 会抛出错误：

```javascript
try {
  await enableAutoTracker({
    endpoint: 'https://your-api-endpoint.com',
    // 缺少 sdk - 会抛出错误
  });
} catch (error) {
  console.error(error.message); // "[XD-Tracker] sdk is required"
}
```

## 迁移指南

如果您从旧版本升级，需要在初始化代码中添加 `sdk` 参数：

### 旧版本
```javascript
await enableAutoTracker({
  endpoint: 'https://your-api-endpoint.com',
  businessId: 'your-business-id'
});
```

### 新版本
```javascript
await enableAutoTracker({
  endpoint: 'https://your-api-endpoint.com',
  sdk: 'your-app-id',        // 新增必填参数
  businessId: 'your-business-id'
});
```