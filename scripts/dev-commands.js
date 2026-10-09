// Development commands using npx instead of npm
const { execSync } = require('child_process');
const path = require('path');

// Command configurations
const COMMANDS = {
  // Development
  'dev': 'npx vite',
  'build': 'npx tsc -b && npx vite build',
  'preview': 'npx vite preview',
  
  // Testing
  'test': 'npx vitest',
  'test:ui': 'npx vitest --ui',
  'test:run': 'npx vitest run',
  'test:smoke': 'npx vitest run src/test/smoke/*.test.ts',
  'test:e2e': 'npx playwright test',
  'test:e2e:ui': 'npx playwright test --ui',
  
  // Linting and formatting
  'lint': 'npx eslint .',
  'lint:fix': 'npx eslint . --fix',
  'format': 'npx prettier --write .',
  
  // Bundle analysis
  'analyze': 'node scripts/analyze-bundle.js',
  'analyze:build': 'npx tsc -b && npx vite build && node scripts/analyze-bundle.js',
  'bundle-report': 'npx webpack-bundle-analyzer dist/static/js/*.js',
  
  // Image optimization
  'optimize-images': 'node scripts/optimize-images.js',
  'optimize-images:responsive': 'node scripts/optimize-images.js --responsive',
  
  // Electron
  'electron:dev': 'cross-env NODE_ENV=development npx concurrently "npx vite" "wait-on http://localhost:5173 && npx electron ."',
  'electron:build': 'node scripts/generate-premium-assets.cjs && npx tsc -b && npx vite build && npx electron-builder',
  'electron:build:dir': 'node scripts/generate-premium-assets.cjs && npx tsc -b && npx vite build && npx electron-builder --dir',
  
  // Storybook
  
  // Performance
  'lighthouse': 'npx lighthouse http://localhost:5173 --output=html --output-path=./lighthouse-report',
  'performance:test': 'npx vitest run tests/performance/*.test.ts',
  
  // AI and ML tools
  'ai:test': 'npx vitest run tests/integration/ai-*.test.ts',
  'ai:analyze': 'node scripts/analyze-ai-usage.js',
  
  // Database and storage
  'db:migrate': 'node scripts/migrate-db.js',
  'db:seed': 'node scripts/seed-database.js',
  'db:reset': 'node scripts/reset-database.js',
  
  // Deployment
  'deploy:staging': 'npx vite build && node scripts/deploy-staging.js',
  'deploy:production': 'npx vite build && node scripts/deploy-production.js',
  
  // Utilities
  'clean': 'npx rimraf dist node_modules/.vite',
  'clean:all': 'npx rimraf dist node_modules',
  'deps:check': 'npx npm-check-updates',
  'deps:update': 'npx npm-update',
  
  // Security
  'security:audit': 'npx audit',
  'security:fix': 'npx audit fix',
  'security:check': 'npx snyk test'
};

// Execute command
function executeCommand(commandName) {
  const command = COMMANDS[commandName];
  
  if (!command) {
    console.error(`❌ Command not found: ${commandName}`);
    console.log('\n📋 Available commands:');
    Object.keys(COMMANDS).sort().forEach(key => {
      console.log(`  ${key.padEnd(20)} - ${command}`);
    });
    process.exit(1);
  }
  
  try {
    console.log(`🚀 Running: ${command}`);
    console.log('─'.repeat(50));
    
    execSync(command, { 
      stdio: 'inherit',
      cwd: process.cwd(),
      env: { ...process.env, FORCE_COLOR: '1' }
    });
    
    console.log('─'.repeat(50));
    console.log('✅ Command completed successfully!');
    
  } catch (error) {
    console.error('─'.repeat(50));
    console.error('❌ Command failed!');
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Help command
function showHelp() {
  console.log(`
🎯 StudyX Development Commands

Usage: node scripts/dev-commands.js <command>

📚 Categories:

🔥 Development:
  dev                 - Start development server
  build               - Build for production
  preview             - Preview production build

🧪 Testing:
  test                - Run unit tests
  test:ui            - Run tests with UI
  test:run            - Run tests once
  test:smoke          - Run smoke tests
  test:e2e            - Run E2E tests
  test:e2e:ui         - Run E2E tests with UI

🔍 Code Quality:
  lint                - Run ESLint
  lint:fix            - Fix ESLint issues
  format              - Format code with Prettier

📊 Analysis:
  analyze             - Analyze bundle size
  analyze:build        - Build and analyze
  bundle-report       - Generate bundle report

🖼️ Assets:
  optimize-images      - Optimize images
  optimize-images:responsive - Optimize responsive images

⚡ Performance:
  lighthouse          - Run Lighthouse audit
  performance:test     - Run performance tests

🤖 AI Features:
  ai:test              - Test AI integrations
  ai:analyze           - Analyze AI usage

🗄️ Database:
  db:migrate           - Run database migrations
  db:seed              - Seed database
  db:reset             - Reset database

🚀 Deployment:
  deploy:staging      - Deploy to staging
  deploy:production   - Deploy to production

🔧 Utilities:
  clean               - Clean build artifacts
  clean:all           - Clean everything
  deps:check           - Check for updates
  deps:update           - Update dependencies

🔒 Security:
  security:audit       - Security audit
  security:fix         - Fix security issues
  security:check       - Check vulnerabilities

💡 Examples:
  node scripts/dev-commands.js dev
  node scripts/dev-commands.js build
  node scripts/dev-commands.js test
  node scripts/dev-commands.js analyze:build

🎯 Quick Start:
  1. node scripts/dev-commands.js install-deps
  2. node scripts/dev-commands.js dev
  3. Open http://localhost:5173
`);
}

// Install dependencies command
function installDependencies() {
  console.log('📦 Installing dependencies...');
  
  try {
    execSync('npm install', { stdio: 'inherit' });
    console.log('✅ Dependencies installed successfully!');
  } catch (error) {
    console.error('❌ Failed to install dependencies!');
    process.exit(1);
  }
}

// Main execution
const command = process.argv[2];

if (!command) {
  showHelp();
  process.exit(0);
}

if (command === 'help' || command === '--help' || command === '-h') {
  showHelp();
  process.exit(0);
}

if (command === 'install-deps') {
  installDependencies();
  process.exit(0);
}

executeCommand(command);
