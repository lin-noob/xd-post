# UMD/IIFE Bundle Usage

The library is now available in UMD and IIFE formats for easy integration in browsers.

## CDN Usage

### UMD Format
```html
<!-- Using UMD bundle -->
<script src="https://cdn.example.com/xd-post/dist/index.umd.js"></script>
<!-- Or minified version -->
<script src="https://cdn.example.com/xd-post/dist/index.umd.min.js"></script>
<script>
  // The library is available as window.XDTracker
  XDTracker.enableAutoTracker({
    apiEndpoint: 'https://your-api-endpoint.com',
    businessId: 'your-business-id'
  });
  
  XDTracker.trackEvent('page_view', {
    page_title: document.title,
    page_url: window.location.href
  });
</script>
```

### IIFE Format
```html
<!-- Using IIFE bundle (immediately invoked) -->
<script src="https://cdn.example.com/xd-post/dist/index.iife.js"></script>
<script>
  // The library is available as window.XDTracker
  XDTracker.enableAutoTracker({
    apiEndpoint: 'https://your-api-endpoint.com',
    businessId: 'your-business-id'
  });
</script>
```

## Local Usage

1. Install dependencies and build the library:
```bash
npm install
npm run build:all
```

2. Use the generated bundles:
```html
<!-- UMD bundle -->
<script src="./dist/index.umd.js"></script>
<!-- OR minified UMD bundle -->
<script src="./dist/index.umd.min.js"></script>

<!-- OR IIFE bundle -->
<script src="./dist/index.iife.js"></script>
```

## Build Scripts

- `npm run build` - Build ESM and CJS formats (using tsup)
- `npm run build:iife` - Build IIFE format (using tsup)
- `npm run build:umd` - Build UMD format (using rollup)
- `npm run build:all` - Build all formats

## Available Methods

All methods are available on the global `XDTracker` object:

```javascript
// Auto tracking
XDTracker.enableAutoTracker(options)
XDTracker.disableAutoTracker()

// User identification
XDTracker.identify(userId, properties)
XDTracker.reset()

// Event tracking
XDTracker.trackEvent(eventName, properties)
XDTracker.trackViewProduct(productData)
XDTracker.trackAddToCart(cartData)
XDTracker.trackCompletePurchase(purchaseData)

// Page view tracking
XDTracker.startPageViewTracking()
XDTracker.stopPageViewTracking()
XDTracker.trackCurrentPageDuration()

// SSE client
XDTracker.getSSEClient()
XDTracker.updateSSESessionId(sessionId)

// And many more...
```

## Configuration

The UMD/IIFE bundles include all dependencies and are ready to use in any browser environment without additional setup. The UMD format works with AMD, CommonJS, and as a global variable.