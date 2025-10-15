# XD-Post - PostHog 集成 + 实时推送系统

一个轻量级的 PostHog 集成库，使用 **PostHog 原生自动采集**，无需手动埋点即可自动追踪所有用户行为。同时支持**自定义事件上报**、WebSocket、SSE 推送和弹窗功能。

## ✨ 主要特性

### 📊 PostHog 原生自动采集
- 🎯 **零配置采集**：PostHog 自动采集页面浏览、点击、表单提交等
- 📈 **自定义事件上报**：使用 `track()` 函数上报任意自定义事件 → **[快速参考](./CUSTOM_EVENTS.md)**
- 👤 **用户识别**：支持用户登录、属性设置
- 📊 **会话追踪**：PostHog ��动关联用户会话
- 🔐 **隐私安全**：支持会话录制和隐私控制

### 🔔 实时推送与弹窗
- 🔌 **WebSocket 支持**：实时双向通信
- 📡 **SSE 支持**：服务器推送事件
- 🎨 **弹窗系统**：美观的推送通知弹窗

## 快速开始

### 1. 安装

```bash
npm install xd-post
```

### 2. 初始化 PostHog

```typescript
import { enableAutoTracker } from 'xd-post';

// 初始化 PostHog（使用原生自动采集）
enableAutoTracker({
  posthog: {
    enabled: true,
    apiKey: 'your-posthog-api-key',           // PostHog API Key
    host: '/quote/api/v1/events/behavior',    // PostHog 上报地址
    autocapture: true,                         // PostHog 原生自动采集（默认启用）
    capture_pageview: true,                    // PostHog 原生页面浏览（默认启用）
    capture_pageleave: true,                   // PostHog 原生页面离开（默认启用）
  },
  // 可选：WebSocket 配置
  websocketUrl: '/ws',
  sessionId: 'user-session-123',
});
```

### 3. 用户识别

```typescript
import { identify, reset } from 'xd-post';

// 用户登录时识别用户（会自动同步到 PostHog）
identify('user-123', {
  email: 'user@example.com',
  userName: 'John Doe',
  plan: 'premium'
});

// 用户登出时重置
reset();
```

### 4. PostHog 原生自动采集

启用后，PostHog 会自动采集以下事件（无需手动调用）：

```typescript
✅ 自动采集的事件（由 PostHog 原生处理）：
- $pageview（页面浏览）
- $pageleave（页面离开）
- $autocapture（点击、表单提��等交互）
- $identify（用户识别）
- $set（用户属性设置）
```

## 配置选项

### AutoTrackerOptions

```typescript
interface AutoTrackerOptions {
  // PostHog 配置（必填）
  posthog: {
    enabled?: boolean;              // 是否启用 PostHog，默认 true
    apiKey: string;                 // PostHog API Key（必填）
    host: string;                   // PostHog 上报地址（必填）
    autocapture?: boolean;          // 原生自动采集，默认 true
    capture_pageview?: boolean;     // 原生页面浏览，默认 true
    capture_pageleave?: boolean;    // 原生页面离开，默认 true
    session_recording?: {
      enabled?: boolean;            // 会话录制，默认 false
    };
  };
  
  // WebSocket 配置（可选）
  websocketUrl?: string;            // WebSocket 连接地址
  sessionId?: string;               // 会话ID（自动生成）
  storageKeyUserId?: string;        // 用户ID存储键，默认 "user_id"
  userProperties?: UserProperties;  // 用户属性
}
```

## API 文���

### enableAutoTracker(options)

初始化 PostHog 和 WebSocket。

```typescript
await enableAutoTracker({
  posthog: {
    apiKey: 'phc_your_key',
    host: '/quote/api/v1/events/behavior'
  }
});
```

### identify(userId, properties?)

识别用户并设置属性���

```typescript
identify('user-123', {
  email: 'user@example.com',
  name: 'John Doe',
  plan: 'premium'
});
```

### reset()

重置用户信息（用户登出时调用）。

```typescript
reset();
```

### getTrackerStatus()

获取追踪器状态。

```typescript
const status = getTrackerStatus();
console.log(status);
// {
//   enabled: true,
//   sessionId: 'xxx',
//   userProperties: {...},
//   websocketConnected: true,
//   posthogHost: '/quote/api/v1/events/behavior'
// }
```

## WebSocket 功能

### 初始化

```typescript
enableAutoTracker({
  posthog: {
    apiKey: 'your-key',
    host: '/quote/api/v1/events/behavior'
  },
  websocketUrl: '/ws',  // WebSocket 地址
});
```

### 获取 WebSocket 客户端

```typescript
import { getWebSocketClient } from 'xd-post';

const wsClient = getWebSocketClient();
if (wsClient && wsClient.isConnected()) {
  wsClient.send(JSON.stringify({ type: 'ping' }));
}
```

## 弹窗功能

### 后端推送弹窗

后端通过 WebSocket 或 SSE 发送弹窗消息：

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
      }
    ]
  }
}
```

### 手动显示弹窗

```typescript
import { showPopup } from 'xd-post';

showPopup({
  title: '欢迎',
  bodyText: '欢迎使用我们的服务！',
  buttonText: '开始使用',
  buttonUrl: '/dashboard'
});
```

## 使用示例

### React 示例

```typescript
import { useEffect } from 'react';
import { enableAutoTracker, identify, reset } from 'xd-post';

function App() {
  useEffect(() => {
    // 初始化
    enableAutoTracker({
      posthog: {
        apiKey: process.env.REACT_APP_POSTHOG_KEY!,
        host: '/quote/api/v1/events/behavior'
      }
    });
  }, []);

  const handleLogin = (user) => {
    identify(user.id, {
      email: user.email,
      name: user.name
    });
  };

  const handleLogout = () => {
    reset();
  };

  return <YourApp />;
}
```

### Next.js 示例

#### App Router (Next.js 13+)

```typescript
// app/providers/posthog-provider.tsx
'use client';

import { useEffect } from 'react';
import { enableAutoTracker } from 'xd-post';

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    enableAutoTracker({
      posthog: {
        apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY!,
        host: process.env.NEXT_PUBLIC_POSTHOG_HOST!,
        autocapture: true,
        capture_pageview: true,
      }
    });
  }, []);

  return <>{children}</>;
}

// app/layout.tsx
import { PostHogProvider } from './providers/posthog-provider';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
```

#### Pages Router

```typescript
// pages/_app.tsx
import { useEffect } from 'react';
import { enableAutoTracker } from 'xd-post';

export default function App({ Component, pageProps }) {
  useEffect(() => {
    enableAutoTracker({
      posthog: {
        apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY!,
        host: process.env.NEXT_PUBLIC_POSTHOG_HOST!,
      }
    });
  }, []);

  return <Component {...pageProps} />;
}
```

📖 **完整指南**：[Next.js 快速开始](./快速开始-Next.js应用.md)

### Vue 示例

```typescript
import { createApp } from 'vue';
import { enableAutoTracker, identify, reset } from 'xd-post';
import App from './App.vue';

const app = createApp(App);

// 初始化
enableAutoTracker({
  posthog: {
    apiKey: import.meta.env.VITE_POSTHOG_KEY,
    host: '/quote/api/v1/events/behavior'
  }
});

app.mount('#app');
```

### 浏览器 IIFE 版本

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.example.com/xd-post/index.global.js"></script>
</head>
<body>
  <script>
    // 初始化
    XDTracker.enableAutoTracker({
      posthog: {
        apiKey: 'your-key',
        host: '/quote/api/v1/events/behavior'
      }
    });

    // 用户登录
    function onLogin(user) {
      XDTracker.identify(user.id, {
        email: user.email,
        name: user.name
      });
    }
  </script>
</body>
</html>
```

## PostHog 控制台

在 PostHog 控制台中，你会看到以下事件：

| 事件名 | 说明 | 触发时机 |
|--------|------|----------|
| `$pageview` | 页面浏览 | 页面加载、路由变化 |
| `$pageleave` | 页面离开 | 页面卸载、路由离开 |
| `$autocapture` | 自动交互 | 点击、表单提交等 |
| `$identify` | 用户识别 | 调用 `identify()` 时 |
| `$set` | 设置属性 | 调用 `identify()` 时 |

## 自定义事件上报

除了自动追踪，你还可以手动上报自定义事件：

```typescript
import { track } from 'xd-post';

// 简单事件
track('button_clicked');

// 带属性的事件
track('purchase_completed', {
  product_id: '12345',
  amount: 99.99,
  currency: 'CNY'
});

// 电商事件
track('add_to_cart', {
  product_id: 'prod_123',
  product_name: 'iPhone 15',
  price: 5999,
  quantity: 1
});
```

### React 组件中使用

```tsx
import { track } from 'xd-post';

function ProductCard({ product }) {
  const handleAddToCart = () => {
    track('add_to_cart', {
      product_id: product.id,
      product_name: product.name,
      price: product.price
    });

    addToCart(product);
  };

  return (
    <button onClick={handleAddToCart}>
      加入购物车
    </button>
  );
}
```

📖 **完整指南**：[自定义事件上报说明](./自定义事件上报说明.md)

## 高级功能

### 获取 PostHog 实例

```typescript
import { getPostHogInstance } from 'xd-post';

const posthog = getPostHogInstance();

// 使用 PostHog 原生 API
const isFeatureEnabled = posthog.isFeatureEnabled('new-feature');
const flags = posthog.getFeatureFlags();
```

### 会话录制

```typescript
enableAutoTracker({
  posthog: {
    apiKey: 'your-key',
    host: '/quote/api/v1/events/behavior',
    session_recording: {
      enabled: true  // 启用会话录制
    }
  }
});
```

## 注意事项

1. **API Key 安全性**：不要将 PostHog API Key 硬编码在前端代码中，建议使用环境变量
2. **数据隐私**：确保遵守 GDPR 等数据隐私法规
3. **PostHog 原生采集**：
   - PostHog 自动处理事件采集
   - 自动识别 UTM 参数
   - 自动关联用户会话
   - 无需手动埋点
4. **会话录制**：会话录制可能影响隐私和性能，请谨慎使用

## 相关资源

- [PostHog 官方文档](https://posthog.com/docs)
- [PostHog JavaScript SDK](https://posthog.com/docs/libraries/js)
- [PostHog 自动采集文档](https://posthog.com/docs/data/autocapture)

## 许可证

MIT License
