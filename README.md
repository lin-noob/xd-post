# XD-Post

[![npm version](https://img.shields.io/npm/v/xd-post.svg)](https://www.npmjs.com/package/xd-post)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一个功能强大的 PostHog 集成库，提供**原生自动采集**、**实时推送**和**智能弹窗**功能。基于 PostHog SDK 构建，无需手动埋点即可自动追踪用户行为，同时支持 WebSocket、SSE 推送和美观的弹窗系统。

## ✨ 核心特性

### 📊 PostHog 原生自动采集

- 🎯 **零配置采集**：自动追踪页面浏览、点击、表单提交等用户行为
- 📈 **自定义事件**：灵活上报业务事件，支持电商、SaaS 等场景
- 👤 **用户识别**：完整的用户身份管理和属性设置
- 📊 **会话追踪**：自动关联用户会话，追踪用户旅程
- 🔐 **隐私安全**：支持会话录制和隐私控制
- ⚡ **批量发送**：优化网络性能，支持事件批量上报

### 🔔 实时推送系统

- 🔌 **WebSocket 支持**：双向实时通信，自动重连
- 📡 **SSE 支持**：服务器推送事件，轻量高效
- 💓 **心跳保活**：智能连接管理，断线自动恢复
- 🔄 **指数退避**：优雅的重连策略，避免服务器压力

### 🎨 智能弹窗系统

- 💎 **美观设计**：现代化 UI，支持多种样式
- 🎯 **精准推送**：WebSocket/SSE 推送弹窗消息
- 🔧 **高度定制**：自定义位置、样式、按钮
- 💾 **持久化**：支持弹窗状态记忆，避免重复打扰

## 📦 安装

```bash
npm install xd-post
```

或使用其他包管理器：

```bash
yarn add xd-post
pnpm add xd-post
```

## 🚀 快速开始

### 1. 初始化 PostHog

```typescript
import { enableAutoTracker } from "xd-post";

// 初始化（使用 PostHog 原生自动采集）
await enableAutoTracker({
  posthog: {
    enabled: true,
    apiKey: "your-posthog-api-key", // PostHog API Key
    host: "/quote/api/v1/events/behavior", // PostHog 上报地址
    autocapture: true, // 自动采集交互事件
    capture_pageview: true, // 自动采集页面浏览
    capture_pageleave: true, // 自动采集页面离开
  },
});
```

### 2. 用户识别

```typescript
import { identify, reset } from "xd-post";

// 用户登录时识别
identify("user-123", {
  email: "user@example.com",
  userName: "John Doe",
  plan: "premium",
});

// 用户登出时重置
reset();
```

### 3. PostHog 原生自动采集

启用后，PostHog 会自动采集以下事件（无需手动调用）：

| 事件名         | 说明     | 触发时机             |
| -------------- | -------- | -------------------- |
| `$pageview`    | 页面浏览 | 页面加载、路由变化   |
| `$pageleave`   | 页面离开 | 页面卸载、路由离开   |
| `$autocapture` | 自动交互 | 点击、表单提交等     |
| `$identify`    | 用户识别 | 调用 `identify()` 时 |
| `$set`         | 设置属性 | 调用 `identify()` 时 |

### 4. 自定义事件上报（可选）

除了自动采集，你还可以手动上报业务事件：

```typescript
import { track, trackBeacon } from "xd-post";

// 简单事件
track("button_clicked");

// 带属性的事件
track("purchase_completed", {
  product_id: "12345",
  amount: 99.99,
  currency: "USD",
});

// 页面跳转前上报（使用 Beacon API 保证发送成功）
trackBeacon("page_exit", {
  duration: 120,
});
```

## 📚 完整 API 文档

### 初始化和配置

#### `enableAutoTracker(options)`

初始化 PostHog 和实时推送系统。

```typescript
await enableAutoTracker({
  posthog: {
    enabled: true,
    apiKey: "phc_your_key",
    host: "/quote/api/v1/events/behavior",
    autocapture: true, // 自动采集交互
    capture_pageview: true, // 自动采集页面浏览
    capture_pageleave: true, // 自动采集页面离开
    session_recording: {
      // 会话录制（可选）
      enabled: false,
    },
  },
  websocketUrl: "/ws", // WebSocket 地址（可选）
  sessionId: "user-session-123", // 会话 ID（可选）
});
```

#### `disableAutoTracker(fullReset?)`

停用追踪器。

```typescript
disableAutoTracker(); // 停用但保留数据
disableAutoTracker(true); // 完全重置
```

### 用户管理

#### `identify(userId, properties?)`

识别用户并设置属性。

```typescript
identify("user-123", {
  email: "user@example.com",
  userName: "John Doe",
  plan: "premium",
  signupDate: "2024-01-01",
});
```

#### `reset()`

重置用户信息（用户登出时调用）。

```typescript
reset();
```

#### `isIdentified()`

检查用户是否已识别。

```typescript
const identified = isIdentified();
```

### 事件追踪

#### `track(eventName, properties?)`

上报自定义事件。

```typescript
track("add_to_cart", {
  product_id: "prod_123",
  product_name: "iPhone 15",
  price: 999,
  quantity: 1,
});
```

#### `trackBeacon(eventName, properties?)`

使用 Beacon API 上报事件，保证页面跳转前发送成功。

```typescript
trackBeacon("checkout_completed", {
  order_id: "order_123",
  total: 1999,
});
```

### 预定义电商事件

#### `userRegisterTrack(properties?)`

用户注册事件。

```typescript
userRegisterTrack({
  userId: "user-123",
  email: "user@example.com",
});
```

#### `userLoginTrack(properties?)`

用户登录事件。

```typescript
userLoginTrack({
  userId: "user-123",
});
```

#### `addToCartTrack(properties?)`

加入购物车事件。

```typescript
addToCartTrack({
  product_id: "prod_123",
  price: 999,
});
```

#### `submitOrderTrack(properties?)`

提交订单事件。

```typescript
submitOrderTrack({
  order_id: "order_123",
  total: 1999,
});
```

#### `completePurchaseTrack(properties?)`

完成购买事件。

```typescript
completePurchaseTrack({
  order_id: "order_123",
  revenue: 1999,
});
```

#### `startCheckout(properties?)`

开始结账事件。

```typescript
startCheckout({
  cart_total: 1999,
});
```

#### `quoteTrack(properties?)`

询价事件。

```typescript
quoteTrack({
  product_id: "prod_123",
});
```

#### `contactUsTrack(properties?)`

联系我们事件。

```typescript
contactUsTrack({
  source: "homepage",
});
```

### PostHog 高级功能

#### `getPostHogInstance()`

获取 PostHog 实例，使用原生 API。

```typescript
const posthog = getPostHogInstance();

// Feature Flags
const isEnabled = posthog.isFeatureEnabled("new-feature");
const flags = posthog.getFeatureFlags();

// 实验
posthog.getFeatureFlag("experiment-key");
```

#### `setPostHogUserProperties(properties)`

设置用户属性。

```typescript
setPostHogUserProperties({
  subscription: "premium",
  lastPurchase: "2024-12-01",
});
```

#### `flushPostHogEvents()`

立即刷新事件队列，强制发送所有待发送的事件。

```typescript
flushPostHogEvents();
```

### 状态查询

#### `getTrackerStatus()`

获取追踪器当前状态。

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

## ⚙️ 配置选项

### `AutoTrackerOptions`

```typescript
interface AutoTrackerOptions {
  // PostHog 配置（必填）
  posthog: {
    enabled?: boolean; // 是否启用，默认 true
    apiKey: string; // API Key（必填）
    host: string; // 上报地址（必填）
    autocapture?: boolean; // 自动采集，默认 true
    capture_pageview?: boolean; // 页面浏览，默认 true
    capture_pageleave?: boolean; // 页面离开，默认 true
    session_recording?: {
      enabled?: boolean; // 会话录制，默认 false
    };
  };

  // WebSocket 配置（可选）
  websocketUrl?: string; // WebSocket 地址
  sessionId?: string; // 会话 ID（自动生成）

  // 用户配置（可选）
  storageKeyUserId?: string; // 用户 ID 存储键
  userProperties?: UserProperties; // 初始用户属性
}
```

### `UserProperties`

```typescript
interface UserProperties {
  id?: string;
  userId?: string;
  email?: string;
  phone?: string;
  userName?: string;
  [key: string]: any; // 自定义属性
}
```

## 💡 使用示例

### React

```typescript
import { useEffect } from "react";
import { enableAutoTracker, identify, reset, track } from "xd-post";

function App() {
  useEffect(() => {
    // 初始化
    enableAutoTracker({
      posthog: {
        apiKey: process.env.REACT_APP_POSTHOG_KEY!,
        host: "/quote/api/v1/events/behavior",
      },
    });
  }, []);

  const handleLogin = (user) => {
    identify(user.id, {
      email: user.email,
      name: user.name,
    });
  };

  const handleLogout = () => {
    reset();
  };

  const handleAddToCart = (product) => {
    track("add_to_cart", {
      product_id: product.id,
      price: product.price,
    });
  };

  return <YourApp />;
}
```

### Next.js (App Router)

```typescript
// app/providers/posthog-provider.tsx
"use client";

import { useEffect } from "react";
import { enableAutoTracker } from "xd-post";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    enableAutoTracker({
      posthog: {
        apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY!,
        host: process.env.NEXT_PUBLIC_POSTHOG_HOST!,
        autocapture: true,
        capture_pageview: true,
      },
    });
  }, []);

  return <>{children}</>;
}

// app/layout.tsx
import { PostHogProvider } from "./providers/posthog-provider";

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

### Next.js (Pages Router)

```typescript
// pages/_app.tsx
import { useEffect } from "react";
import { enableAutoTracker } from "xd-post";

export default function App({ Component, pageProps }) {
  useEffect(() => {
    enableAutoTracker({
      posthog: {
        apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY!,
        host: process.env.NEXT_PUBLIC_POSTHOG_HOST!,
      },
    });
  }, []);

  return <Component {...pageProps} />;
}
```

### Vue

```typescript
// main.ts
import { createApp } from "vue";
import { enableAutoTracker } from "xd-post";
import App from "./App.vue";

const app = createApp(App);

// 初始化
enableAutoTracker({
  posthog: {
    apiKey: import.meta.env.VITE_POSTHOG_KEY,
    host: "/quote/api/v1/events/behavior",
  },
});

app.mount("#app");
```

### 浏览器 (IIFE/UMD)

```html
<!DOCTYPE html>
<html>
  <head>
    <!-- 使用 IIFE 版本 -->
    <script src="https://unpkg.com/xd-post/dist/index.iife.js"></script>
    <!-- 或使用 UMD 版本 -->
    <!-- <script src="https://unpkg.com/xd-post/dist/index.umd.js"></script> -->
  </head>
  <body>
    <script>
      // 初始化
      XDTracker.enableAutoTracker({
        posthog: {
          apiKey: "your-posthog-key",
          host: "/quote/api/v1/events/behavior",
        },
      });

      // 用户登录
      function onLogin(user) {
        XDTracker.identify(user.id, {
          email: user.email,
          name: user.name,
        });
      }

      // 追踪事件
      function trackButtonClick() {
        XDTracker.track("button_clicked", {
          button_name: "subscribe",
        });
      }
    </script>
  </body>
</html>
```

## 🔌 WebSocket 功能

### 初始化 WebSocket

```typescript
enableAutoTracker({
  posthog: {
    apiKey: "your-key",
    host: "/quote/api/v1/events/behavior",
  },
  websocketUrl: "/ws", // WebSocket 地址
  sessionId: "session-123", // 可选，自动生成
});
```

### 获取 WebSocket 客户端

```typescript
import { getWebSocketClient } from "xd-post";

const wsClient = getWebSocketClient();

if (wsClient && wsClient.isConnected()) {
  // 发送消息
  wsClient.send(JSON.stringify({ type: "ping" }));

  // 检查连接状态
  console.log(wsClient.getReadyStateText()); // "OPEN"
}
```

### 更新 Session ID

```typescript
import { updateWebSocketSessionId } from "xd-post";

updateWebSocketSessionId("new-session-id");
```

### 控制弹窗自动处理

```typescript
import {
  setWebSocketAutoHandlePopup,
  getWebSocketAutoHandlePopup,
} from "xd-post";

// 禁用自动处理弹窗
setWebSocketAutoHandlePopup(false);

// 检查当前设置
const autoHandle = getWebSocketAutoHandlePopup();
```

## 📡 SSE 功能

### 使用 SSE 客户端

```typescript
import { SSEClient } from "xd-post";

const sseClient = new SSEClient({
  url: "/api/sse",
  sessionId: "session-123",
  onMessage: (data) => {
    console.log("SSE message:", data);
  },
  onOpen: () => {
    console.log("SSE connected");
  },
  onError: (error) => {
    console.error("SSE error:", error);
  },
});

// 连接
sseClient.connect();

// 添加自定义事件监听
sseClient.addEventListener("custom-event", (event) => {
  console.log("Custom event:", event.data);
});

// 断开连接
sseClient.disconnect();
```

## 🎨 弹窗功能

### 后端推送弹窗

后端通过 WebSocket 或 SSE 发送弹窗消息：

```json
{
  "type": "success",
  "message": {
    "type": "popup",
    "strategy": {
      "content": {
        "title": "新消息",
        "body": "您有一条新的系统通知",
        "buttonText": "查看详情",
        "link": "/notifications"
      }
    },
    "options": {
      "position": "top-right",
      "zIndex": 10000
    }
  }
}
```

### 手动显示弹窗

```typescript
import { showPopup } from "xd-post";

showPopup(
  {
    title: "欢迎",
    body: "欢迎使用我们的服务！",
    buttonText: "开始使用",
    link: "/dashboard",
  },
  {
    position: "center", // 位置：center, top-right, bottom-right 等
    overlayClosable: true, // 点击遮罩关闭
    zIndex: 10000, // 层级
    persistent: true, // 持久化
    persistentKey: "welcome", // 持久化键
    expiresInSeconds: 86400, // 过期时间（秒）
  }
);
```

### 隐藏弹窗

```typescript
import { hidePopup } from "xd-post";

hidePopup();
```

### 多按钮弹窗

```typescript
showPopup({
  title: "确认操作",
  body: "您确定要删除此项吗？",
  buttons: [
    {
      text: "取消",
      url: "#",
      target: "_self",
    },
    {
      text: "确定",
      url: "/api/delete",
      target: "_self",
    },
  ],
});
```

## 🔧 高级功能

### Feature Flags

```typescript
const posthog = getPostHogInstance();

// 检查功能是否启用
if (posthog.isFeatureEnabled("new-dashboard")) {
  // 显示新界面
}

// 获取所有 flags
const flags = posthog.getFeatureFlags();
```

### 会话录制

```typescript
enableAutoTracker({
  posthog: {
    apiKey: "your-key",
    host: "/quote/api/v1/events/behavior",
    session_recording: {
      enabled: true, // 启用会话录制
    },
  },
});
```

### 批量事件发送

PostHog 会自动批量发送事件以优化性能。在需要时可以手动刷新：

```typescript
import { flushPostHogEvents } from "xd-post";

// 页面跳转前刷新事件
window.addEventListener("beforeunload", () => {
  flushPostHogEvents();
});
```

### 页面跳转前上报事件

使用 `trackBeacon` 确保事件在页面跳转前发送：

```typescript
import { trackBeacon } from "xd-post";

function handleCheckout() {
  // 使用 Beacon API，保证发送成功
  trackBeacon("checkout_started", {
    cart_total: 1999,
  });

  // 立即跳转
  router.push("/checkout");
}
```

## 📦 构建和打包

### 支持的格式

- **ESM**: `dist/index.js` - 用于现代打包工具（Vite, Webpack 5+）
- **CJS**: `dist/index.cjs` - 用于 Node.js 和旧版打包工具
- **IIFE**: `dist/index.iife.js` - 直接在浏览器中使用
- **UMD**: `dist/index.umd.js` - 兼容 AMD/CommonJS/全局变量

### 构建命令

```bash
npm run build          # 构建 ESM 和 CJS
npm run build:iife     # 构建 IIFE
npm run build:umd      # 构建 UMD
npm run build:all      # 构建所有格式
```

### CDN 使用

```html
<!-- IIFE 版本（推荐） -->
<script src="https://unpkg.com/xd-post/dist/index.iife.js"></script>

<!-- UMD 版本 -->
<script src="https://unpkg.com/xd-post/dist/index.umd.js"></script>

<!-- 压缩版本 -->
<script src="https://unpkg.com/xd-post/dist/index.umd.min.js"></script>
```

全局命名空间：`XDTracker`

## ❓ 常见问题

### SSE 连接错误

如果遇到 SSE 连接问题，请参考 [SSE-Troubleshooting.md](./SSE-Troubleshooting.md)。

常见解决方案：

- 确保服务器正确实现 SSE 协议
- 检查网络状态和防火墙设置
- 页面离开前主动断开连接

### 多次初始化问题

SDK 内置了防重复初始化机制，多次调用 `enableAutoTracker` 只会生效一次。

### WebSocket 重连

SDK 使用指数退避策略自动重连，最大重试次数为 5 次。可以通过配置调整：

```typescript
const wsClient = new WebSocketClient({
  url: "/ws",
  maxRetryAttempts: 10, // 最大重试次数
  retryInterval: 3000, // 基础重试间隔（毫秒）
});
```

### 环境变量管理

建议使用环境变量管理 API Key：

```bash
# .env
VITE_POSTHOG_KEY=phc_your_key
VITE_POSTHOG_HOST=/quote/api/v1/events/behavior
```

```typescript
enableAutoTracker({
  posthog: {
    apiKey: import.meta.env.VITE_POSTHOG_KEY,
    host: import.meta.env.VITE_POSTHOG_HOST,
  },
});
```

## 📖 相关文档

- [APPID_USAGE.md](./APPID_USAGE.md) - AppId 使用说明（已废弃）
- [SSE-Troubleshooting.md](./SSE-Troubleshooting.md) - SSE 连接故障排查
- [UMD_USAGE.md](./UMD_USAGE.md) - UMD/IIFE 使用指南
- [PostHog 官方文档](https://posthog.com/docs)
- [PostHog JavaScript SDK](https://posthog.com/docs/libraries/js)
- [PostHog 自动采集](https://posthog.com/docs/data/autocapture)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

[MIT License](LICENSE)

---

**XD-Post** - 让用户行为分析和实时推送变得简单 ✨
