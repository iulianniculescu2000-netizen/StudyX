import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { performance } from 'perf_hooks';

describe('Performance Tests', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    page = await browser.newPage();
    
    // Enable performance monitoring
    await page.coverage.startJSCoverage();
    
    // Monitor network requests
    const requests: any[] = [];
    page.on('request', (request) => {
      requests.push({
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        timestamp: Date.now()
      });
    });
    
    page.on('response', async (response) => {
      const request = requests.find(r => r.url === response.url());
      if (request) {
        request.status = response.status();
        request.responseHeaders = response.headers();
        request.size = await response.body().then((body) => body.length).catch(() => 0);
      }
    });
    
    // Store requests for analysis
    (page as any).requests = requests;
  });

  afterEach(async () => {
    // Stop coverage and collect metrics
    const coverage = await page.coverage.stopJSCoverage();
    
    // Calculate coverage metrics
    const totalFunctions = coverage.reduce((sum, entry) => sum + entry.functions.length, 0);
    const usedFunctions = coverage.reduce((sum, entry) =>
      sum + entry.functions.filter(f => f.ranges.some((range) => range.count > 0)).length, 0);
    const coveragePercentage = totalFunctions > 0 ? (usedFunctions / totalFunctions) * 100 : 0;
    
    console.log(`JavaScript Coverage: ${coveragePercentage.toFixed(2)}%`);
    
    await page.close();
  });

  describe('Page Load Performance', () => {
    it('should load main dashboard within performance budget', async () => {
      const startTime = performance.now();
      
      await page.goto('http://localhost:5173', {
        waitUntil: 'networkidle',
        timeout: 10000
      });
      
      const loadTime = performance.now() - startTime;
      
      // Performance assertions
      expect(loadTime).toBeLessThan(3000); // Should load within 3 seconds
      
      // Check Core Web Vitals
      const metrics = await page.evaluate((): Promise<{
        lcp?: number;
        cls?: number;
        'first-contentful-paint'?: number;
      }> => {
        return new Promise((resolve) => {
          const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const vitals: {
              lcp?: number;
              cls?: number;
              'first-contentful-paint'?: number;
              [key: string]: number | undefined;
            } = {};
            
            entries.forEach((entry) => {
              if (entry.entryType === 'largest-contentful-paint') {
                vitals.lcp = entry.startTime;
              } else if (entry.entryType === 'layout-shift') {
                vitals.cls = (vitals.cls || 0) + (entry as any).value;
              } else if (entry.entryType === 'paint') {
                vitals[entry.name] = entry.startTime;
              }
            });
            
            resolve(vitals);
          });
          
          observer.observe({ entryTypes: ['largest-contentful-paint', 'layout-shift', 'paint'] });
        });
      });
      
      // Core Web Vitals assertions
      expect(metrics.lcp).toBeLessThan(2500); // Largest Contentful Paint < 2.5s
      expect(metrics.cls).toBeLessThan(0.1);   // Cumulative Layout Shift < 0.1
      expect(metrics['first-contentful-paint']).toBeLessThan(1500); // FCP < 1.5s
    });

    it('should handle navigation between pages efficiently', async () => {
      await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
      
      // Navigate to different pages and measure performance
      const pages = ['/quizzes', '/stats', '/flashcards'];
      const navigationTimes: number[] = [];
      
      for (const pagePath of pages) {
        const startTime = performance.now();
        
        await page.goto(`http://localhost:5173${pagePath}`, {
          waitUntil: 'networkidle',
          timeout: 5000
        });
        
        const navigationTime = performance.now() - startTime;
        navigationTimes.push(navigationTime);
        
        // Each navigation should be fast
        expect(navigationTime).toBeLessThan(2000);
      }
      
      // Average navigation time should be reasonable
      const avgNavigationTime = navigationTimes.reduce((a, b) => a + b, 0) / navigationTimes.length;
      expect(avgNavigationTime).toBeLessThan(1500);
    });
  });

  describe('Resource Loading Performance', () => {
    it('should optimize bundle size and loading', async () => {
      await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
      
      const requests = (page as any).requests as any[];
      
      // Analyze JavaScript bundles
      const jsRequests = requests.filter(r => r.resourceType === 'script');
      const totalJSSize = jsRequests.reduce((sum, r) => sum + (r.size || 0), 0);
      
      // Bundle size should be reasonable
      expect(totalJSSize).toBeLessThan(1500000); // Less than 1.5MB
      expect(jsRequests.length).toBeLessThan(20); // Less than 20 JS files
      
      // Check for large individual files
      const largeJSFiles = jsRequests.filter(r => (r.size || 0) > 500000); // > 500KB
      expect(largeJSFiles.length).toBeLessThan(2);
      
      // Analyze CSS bundles
      const cssRequests = requests.filter(r => r.resourceType === 'stylesheet');
      const totalCSSSize = cssRequests.reduce((sum, r) => sum + (r.size || 0), 0);
      
      expect(totalCSSSize).toBeLessThan(200000); // Less than 200KB CSS
    });

    it('should implement efficient caching strategies', async () => {
      // First load
      await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
      const firstLoadRequests = (page as any).requests as any[];
      
      // Clear requests array
      (page as any).requests = [];
      
      // Second load (should use cache)
      await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
      const secondLoadRequests = (page as any).requests as any[];
      
      // Analyze caching effectiveness
      const cachedRequests = secondLoadRequests.filter(r => 
        r.status === 304 || // Not Modified
        r.responseHeaders?.['cache-control']?.includes('hit')
      );
      
      // Should have significant cache hits
      const cacheHitRatio = cachedRequests.length / secondLoadRequests.length;
      expect(cacheHitRatio).toBeGreaterThan(0.3); // At least 30% cache hits
    });
  });

  describe('Memory Performance', () => {
    it('should not have memory leaks during navigation', async () => {
      await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
      
      // Measure initial memory
      const initialMemory = await page.evaluate(() => {
        return (performance as any).memory?.usedJSHeapSize || 0;
      });
      
      // Navigate through multiple pages
      const pages = ['/quizzes', '/stats', '/flashcards', '/knowledge'];
      
      for (let i = 0; i < 3; i++) { // Repeat navigation cycle
        for (const pagePath of pages) {
          await page.goto(`http://localhost:5173${pagePath}`, {
            waitUntil: 'networkidle'
          });
          
          // Simulate user interaction
          await page.mouse.move(100, 100);
          await page.waitForTimeout(100);
        }
      }
      
      // Force garbage collection if available
      await page.evaluate(() => {
        if ((window as any).gc) {
          (window as any).gc();
        }
      });
      
      // Measure final memory
      const finalMemory = await page.evaluate(() => {
        return (performance as any).memory?.usedJSHeapSize || 0;
      });
      
      // Memory growth should be minimal
      const memoryGrowth = finalMemory - initialMemory;
      const memoryGrowthMB = memoryGrowth / (1024 * 1024);
      
      expect(memoryGrowthMB).toBeLessThan(50); // Less than 50MB growth
    });

    it('should handle large datasets efficiently', async () => {
      await page.goto('http://localhost:5173/quizzes', { waitUntil: 'networkidle' });
      
      // Simulate loading large dataset
      await page.evaluate(() => {
        // Create large array of quiz data
        const largeDataset = Array.from({ length: 10000 }, (_, i) => ({
          id: `quiz-${i}`,
          title: `Quiz ${i}`,
          questions: Array.from({ length: 20 }, (_, j) => ({
            id: `q-${i}-${j}`,
            question: `Question ${j}`,
            options: ['A', 'B', 'C', 'D'],
            correct: 'A'
          }))
        }));
        
        // Simulate rendering large list
        const container = document.createElement('div');
        container.innerHTML = largeDataset.map(quiz => 
          `<div class="quiz-item">${quiz.title}</div>`
        ).join('');
        document.body.appendChild(container);
        
        return largeDataset.length;
      });
      
      // Measure rendering performance
      const renderStartTime = performance.now();
      
      // Check if page is still responsive
      const isResponsive = await page.evaluate(() => {
        const startTime = Date.now();
        const button = document.querySelector('button');
        if (button instanceof HTMLElement) {
          button.click();
        }
        return Date.now() - startTime < 100; // Should respond within 100ms
      });
      
      const renderTime = performance.now() - renderStartTime;
      
      expect(isResponsive).toBe(true);
      expect(renderTime).toBeLessThan(1000); // Should render within 1 second
    });
  });

  describe('Animation Performance', () => {
    it('should maintain 60fps during animations', async () => {
      await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
      
      // Monitor frame rate during animations
      const frameRates = await page.evaluate(() => {
        return new Promise<number[]>((resolve) => {
          const frameRates: number[] = [];
          let lastTime = performance.now();
          
          function measureFrame() {
            const currentTime = performance.now();
            const deltaTime = currentTime - lastTime;
            const frameRate = 1000 / deltaTime;
            
            frameRates.push(frameRate);
            lastTime = currentTime;
            
            if (frameRates.length < 60) { // Measure for 60 frames
              requestAnimationFrame(measureFrame);
            } else {
              resolve(frameRates);
            }
          }
          
          // Trigger animation
          const element = document.querySelector('.animated-element');
          if (element) {
            element.classList.add('animate');
          }
          
          requestAnimationFrame(measureFrame);
        });
      });
      
      // Calculate average frame rate
      const avgFrameRate = frameRates.reduce((a, b) => a + b, 0) / frameRates.length;
      const minFrameRate = Math.min(...frameRates);
      
      // Should maintain good frame rate
      expect(avgFrameRate).toBeGreaterThan(55); // Average > 55fps
      expect(minFrameRate).toBeGreaterThan(30); // Minimum > 30fps
    });

    it('should use CSS transforms for smooth animations', async () => {
      await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
      
      // Check if animations use optimized properties
      const hasOptimizedAnimations = await page.evaluate(() => {
        const styles = Array.from(document.styleSheets).flatMap(sheet => {
          try {
            return Array.from(sheet.cssRules || []).map(rule => rule.cssText);
          } catch {
            return [];
          }
        });
        
        // Look for transform-based animations
        const transformAnimations = styles.filter(css => 
          css.includes('transform') || css.includes('translate') || css.includes('scale')
        );
        
        // Look for non-optimized animations
        const nonOptimizedAnimations = styles.filter(css => 
          (css.includes('left') || css.includes('top') || css.includes('margin')) &&
          css.includes('transition')
        );
        
        return {
          optimized: transformAnimations.length,
          nonOptimized: nonOptimizedAnimations.length
        };
      });
      
      // Should prefer optimized animations
      expect(hasOptimizedAnimations.optimized).toBeGreaterThan(0);
      expect(hasOptimizedAnimations.nonOptimized).toBe(0);
    });
  });

  describe('Network Performance', () => {
    it('should minimize API calls and optimize payloads', async () => {
      await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
      
      const requests = (page as any).requests as any[];
      
      // Analyze API calls
      const apiRequests = requests.filter(r => 
        r.url.includes('/api/') || r.resourceType === 'xhr' || r.resourceType === 'fetch'
      );
      
      // Should not make excessive API calls
      expect(apiRequests.length).toBeLessThan(10);
      
      // Check payload sizes
      const largePayloads = apiRequests.filter(r => (r.size || 0) > 100000); // > 100KB
      expect(largePayloads.length).toBe(0); // No large payloads
      
      // Check for request batching opportunities
      const similarRequests = apiRequests.filter(r => r.url.includes('/quizzes'));
      expect(similarRequests.length).toBeLessThan(3); // Should batch similar requests
    });

    it('should implement proper error handling and retry logic', async () => {
      await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
      
      // Simulate network failure
      await page.route('**/*', route => {
        if (route.request().url().includes('/api/')) {
          route.abort('failed');
        } else {
          route.continue();
        }
      });
      
      // Try to trigger API call
      await page.evaluate(() => {
        // Simulate user action that triggers API call
        const button = document.querySelector('[data-testid="refresh-button"]');
        if (button instanceof HTMLElement) {
          button.click();
        }
      });
      
      // Wait for error handling
      await page.waitForTimeout(2000);
      
      // Check if error is handled gracefully
      const hasErrorHandling = await page.evaluate(() => {
        const errorElements = document.querySelectorAll('[data-testid="error-message"]');
        const fallbackElements = document.querySelectorAll('[data-testid="fallback-content"]');
        return errorElements.length > 0 || fallbackElements.length > 0;
      });
      
      expect(hasErrorHandling).toBe(true);
    });
  });

  describe('Accessibility Performance', () => {
    it('should maintain accessibility without performance impact', async () => {
      await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
      
      // Check accessibility features
      const a11yFeatures = await page.evaluate(() => {
        const hasAriaLabels = document.querySelectorAll('[aria-label]').length > 0;
        const hasKeyboardNavigation = document.querySelectorAll('[tabindex]').length > 0;
        const hasSemanticHTML = document.querySelectorAll('main, nav, header, section, article').length > 0;
        
        return {
          ariaLabels: hasAriaLabels,
          keyboardNav: hasKeyboardNavigation,
          semanticHTML: hasSemanticHTML
        };
      });
      
      // Should have accessibility features
      expect(a11yFeatures.ariaLabels).toBe(true);
      expect(a11yFeatures.keyboardNav).toBe(true);
      expect(a11yFeatures.semanticHTML).toBe(true);
      
      // Accessibility should not significantly impact performance
      const loadTime = await page.evaluate(() => {
        const navigation = performance.getEntries().find((entry) => (entry.entryType as string) === 'navigation') as PerformanceNavigationTiming | undefined;
        return navigation ? navigation.loadEventEnd - navigation.startTime : 0;
      });
      
      expect(loadTime).toBeLessThan(3000);
    });
  });
});
