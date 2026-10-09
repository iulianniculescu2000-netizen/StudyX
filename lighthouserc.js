module.exports = {
  ci: {
    collect: {
      numberOfRuns: 3,
      startServerCommand: 'npm run dev',
      startServerReadyPattern: 'Local:',
      startServerReadyTimeout: 30000,
      url: ['http://localhost:5173'],
      settings: {
        chromeFlags: '--no-sandbox --headless --disable-gpu --disable-dev-shm-usage',
        preset: 'desktop',
        throttling: {
          cpuSlowdownMultiplier: 1,
          requestThroughputKbps: 0,
          downloadThroughputKbps: 0,
          rttMs: 0,
        },
        emulatedUserAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    },
    assert: {
      assertions: {
        // Performance budgets
        'categories:performance': ['warn', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
        'categories:seo': ['off'],
        
        // Specific performance metrics
        'first-contentful-paint': ['warn', { maxNumericValue: 1500 }],
        'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['warn', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['warn', { maxNumericValue: 300 }],
        'speed-index': ['warn', { maxNumericValue: 3400 }],
        
        // Resource budgets
        'resource-summary:script-count': ['warn', { maxNumericValue: 20 }],
        'resource-summary:total-byte-weight': ['warn', { maxNumericValue: 1500000 }], // 1.5MB
        'resource-summary:unused-css-rules': ['warn', { maxNumericValue: 2000 }],
        
        // Accessibility
        'accessibility:aria-valid-attr-value': ['error', { maxNumericValue: 0 }],
        'accessibility:aria-input-field-name': ['error', { maxNumericValue: 0 }],
        'accessibility:button-name': ['error', { maxNumericValue: 0 }],
        'accessibility:link-name': ['error', { maxNumericValue: 0 }],
        'accessibility:image-alt': ['error', { maxNumericValue: 0 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
