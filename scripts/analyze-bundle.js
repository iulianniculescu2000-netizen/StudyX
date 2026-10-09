const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const path = require('path');

// Webpack bundle analysis configuration
const bundleAnalyzerConfig = {
  analyzerMode: 'static',
  analyzerPort: 8888,
  openAnalyzer: false,
  generateStatsFile: true,
  statsFilename: 'bundle-stats.json',
  statsOptions: {
    source: false,
    modules: true,
    chunks: true,
    chunkModules: true,
    chunkOrigins: true,
    depths: true,
    usedExports: true,
    providedExports: true,
    optimizationBailouts: true,
    errorDetails: true,
    colors: true,
    modulesSort: 'size',
    chunksSort: 'size',
    assetsSort: 'size'
  },
  defaultSizes: 'parsed',
  excludeAssets: null,
  logLevel: 'info'
};

// Tree shaking optimization recommendations
const optimizationConfig = {
  splitChunks: {
    chunks: 'all',
    minSize: 20000,
    maxSize: 244000,
    minChunks: 1,
    maxAsyncRequests: 30,
    maxInitialRequests: 30,
    automaticNameDelimiter: '~',
    cacheGroups: {
      default: {
        minChunks: 2,
        priority: -20,
        reuseExistingChunk: true
      },
      vendor: {
        test: /[\\/]node_modules[\\/]/,
        name: 'vendors',
        priority: -10,
        chunks: 'all'
      },
      react: {
        test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
        name: 'react',
        priority: 20,
        chunks: 'all'
      },
      ui: {
        test: /[\\/]node_modules[\\/](@radix-ui|lucide-react)[\\/]/,
        name: 'ui',
        priority: 15,
        chunks: 'all'
      },
      ai: {
        test: /[\\/]node_modules[\\/](openai|groq-sdk)[\\/]/,
        name: 'ai',
        priority: 10,
        chunks: 'all'
      },
      utils: {
        test: /[\\/]src[\\/]utils[\\/]/,
        name: 'utils',
        priority: 5,
        chunks: 'all'
      }
    }
  },
  usedExports: true,
  sideEffects: false,
  moduleIds: 'deterministic',
  runtimeChunk: {
    name: 'runtime'
  }
};

// Bundle size budgets
const performanceBudgets = {
  maxAssetSize: 512000, // 512KB per asset
  maxEntrypointSize: 512000, // 512KB per entrypoint
  hints: 'warning' // or 'error'
};

// Analysis script
function analyzeBundle() {
  console.log('Starting bundle analysis...');
  
  // Check if we're in production build
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (!isProduction) {
    console.warn('Bundle analysis is most effective in production mode.');
    console.log('Run: npm run build && npm run analyze');
  }

  // Generate analysis report
  const analyzer = new BundleAnalyzerPlugin({
    ...bundleAnalyzerConfig,
    reportFilename: path.resolve(__dirname, '../bundle-report.html'),
    statsFilename: path.resolve(__dirname, '../bundle-stats.json')
  });

  console.log('Bundle analysis complete!');
  console.log('Report generated at: bundle-report.html');
  console.log('Stats file: bundle-stats.json');

  // Print summary
  return {
    reportPath: path.resolve(__dirname, '../bundle-report.html'),
    statsPath: path.resolve(__dirname, '../bundle-stats.json'),
    recommendations: getOptimizationRecommendations()
  };
}

// Optimization recommendations based on common issues
function getOptimizationRecommendations() {
  return {
    treeShaking: [
      'Ensure sideEffects: false in package.json',
      'Use ES6 imports/exports instead of CommonJS',
      'Remove unused dependencies',
      'Configure webpack sideEffects: false'
    ],
    codeSplitting: [
      'Implement route-based code splitting',
      'Split vendor libraries',
      'Use dynamic imports for large components',
      'Configure splitChunks optimization'
    ],
    bundleSize: [
      'Compress images and assets',
      'Use tree shaking for unused code',
      'Minimize CSS and JavaScript',
      'Remove duplicate dependencies'
    ],
    performance: [
      'Enable gzip compression',
      'Implement service worker caching',
      'Use CDN for static assets',
      'Optimize chunk loading strategy'
    ]
  };
}

// Export configurations
module.exports = {
  bundleAnalyzerConfig,
  optimizationConfig,
  performanceBudgets,
  analyzeBundle,
  getOptimizationRecommendations
};
