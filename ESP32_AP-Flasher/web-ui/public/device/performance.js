// OpenEPL ESP32 - Performance Monitor and Optimization
// Performance monitoring, profiling, and optimization utilities

/**
 * Performance Monitor Class
 * Tracks performance metrics and provides optimization insights
 */
class PerformanceMonitor {
    constructor() {
        this.metrics = new Map();
        this.profilers = new Map();
        this.observers = new Map();
        this.benchmarks = new Map();
        this.isMonitoring = false;
        this.reportInterval = 5000; // 5 seconds
        
        this.initializeMonitoring();
    }

    /**
     * Initialize performance monitoring
     */
    initializeMonitoring() {
        // Initialize Web Performance API observers
        this.initializeObservers();
        
        // Start basic monitoring
        this.startMonitoring();
        
        // Memory usage tracking
        this.trackMemoryUsage();
        
        // Network performance tracking
        this.trackNetworkPerformance();
    }

    /**
     * Initialize Performance Observers
     */
    initializeObservers() {
        // Navigation timing
        if ('PerformanceObserver' in window) {
            try {
                const navObserver = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        this.recordMetric('navigation', {
                            type: entry.entryType,
                            name: entry.name,
                            duration: entry.duration,
                            startTime: entry.startTime,
                            timestamp: Date.now()
                        });
                    }
                });
                navObserver.observe({ entryTypes: ['navigation'] });
                this.observers.set('navigation', navObserver);
            } catch (e) {
                console.warn('Navigation observer not supported:', e);
            }

            // Resource timing
            try {
                const resourceObserver = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        this.recordMetric('resource', {
                            name: entry.name,
                            duration: entry.duration,
                            transferSize: entry.transferSize,
                            encodedBodySize: entry.encodedBodySize,
                            decodedBodySize: entry.decodedBodySize,
                            timestamp: Date.now()
                        });
                    }
                });
                resourceObserver.observe({ entryTypes: ['resource'] });
                this.observers.set('resource', resourceObserver);
            } catch (e) {
                console.warn('Resource observer not supported:', e);
            }

            // Long task observer
            try {
                const longTaskObserver = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        this.recordMetric('longtask', {
                            duration: entry.duration,
                            startTime: entry.startTime,
                            attribution: entry.attribution,
                            timestamp: Date.now()
                        });
                        
                        // Warn about long tasks
                        if (entry.duration > 50) {
                            console.warn(`Long task detected: ${entry.duration}ms`);
                        }
                    }
                });
                longTaskObserver.observe({ entryTypes: ['longtask'] });
                this.observers.set('longtask', longTaskObserver);
            } catch (e) {
                console.warn('Long task observer not supported:', e);
            }
        }
    }

    /**
     * Start performance monitoring
     */
    startMonitoring() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        this.monitoringInterval = setInterval(() => {
            this.collectMetrics();
            this.generateReport();
        }, this.reportInterval);
    }

    /**
     * Stop performance monitoring
     */
    stopMonitoring() {
        this.isMonitoring = false;
        
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
        
        // Disconnect observers
        this.observers.forEach(observer => observer.disconnect());
        this.observers.clear();
    }

    /**
     * Record performance metric
     */
    recordMetric(category, data) {
        if (!this.metrics.has(category)) {
            this.metrics.set(category, []);
        }
        
        const metrics = this.metrics.get(category);
        metrics.push({
            ...data,
            timestamp: data.timestamp || Date.now()
        });
        
        // Keep only last 100 entries per category
        if (metrics.length > 100) {
            metrics.splice(0, metrics.length - 100);
        }
    }

    /**
     * Start profiling a function or operation
     */
    startProfiler(name) {
        this.profilers.set(name, {
            startTime: performance.now(),
            memoryStart: this.getMemoryUsage()
        });
    }

    /**
     * End profiling and record results
     */
    endProfiler(name) {
        const profiler = this.profilers.get(name);
        if (!profiler) {
            console.warn(`No profiler found with name: ${name}`);
            return null;
        }
        
        const endTime = performance.now();
        const memoryEnd = this.getMemoryUsage();
        
        const result = {
            name,
            duration: endTime - profiler.startTime,
            memoryUsed: memoryEnd - profiler.memoryStart,
            startTime: profiler.startTime,
            endTime
        };
        
        this.recordMetric('profiler', result);
        this.profilers.delete(name);
        
        return result;
    }

    /**
     * Profile a function execution
     */
    async profileFunction(name, fn, ...args) {
        this.startProfiler(name);
        
        try {
            const result = await fn(...args);
            const profile = this.endProfiler(name);
            
            console.log(`Profile ${name}:`, profile);
            return result;
        } catch (error) {
            this.endProfiler(name);
            throw error;
        }
    }

    /**
     * Create a profiling decorator
     */
    createProfileDecorator(name) {
        return (target, propertyKey, descriptor) => {
            const originalMethod = descriptor.value;
            
            descriptor.value = async function(...args) {
                const profilerName = `${name || target.constructor.name}.${propertyKey}`;
                
                window.performanceMonitor.startProfiler(profilerName);
                try {
                    const result = await originalMethod.apply(this, args);
                    window.performanceMonitor.endProfiler(profilerName);
                    return result;
                } catch (error) {
                    window.performanceMonitor.endProfiler(profilerName);
                    throw error;
                }
            };
            
            return descriptor;
        };
    }

    /**
     * Collect system metrics
     */
    collectMetrics() {
        // Memory metrics
        const memory = this.getMemoryUsage();
        this.recordMetric('memory', {
            used: memory,
            total: this.getTotalMemory(),
            percentage: (memory / this.getTotalMemory()) * 100
        });
        
        // Frame rate (if available)
        if (window.requestAnimationFrame) {
            this.measureFrameRate();
        }
        
        // DOM metrics
        this.recordMetric('dom', {
            elements: document.querySelectorAll('*').length,
            listeners: this.countEventListeners(),
            mutations: this.getMutationCount()
        });
        
        // Network metrics
        this.collectNetworkMetrics();
    }

    /**
     * Get current memory usage
     */
    getMemoryUsage() {
        if ('memory' in performance) {
            return performance.memory.usedJSHeapSize;
        }
        return 0;
    }

    /**
     * Get total available memory
     */
    getTotalMemory() {
        if ('memory' in performance) {
            return performance.memory.totalJSHeapSize;
        }
        return 0;
    }

    /**
     * Measure frame rate
     */
    measureFrameRate() {
        let frames = 0;
        let lastTime = performance.now();
        
        const measureFrame = (currentTime) => {
            frames++;
            
            if (currentTime - lastTime >= 1000) {
                this.recordMetric('framerate', {
                    fps: frames,
                    timestamp: Date.now()
                });
                
                frames = 0;
                lastTime = currentTime;
            }
            
            if (this.isMonitoring) {
                requestAnimationFrame(measureFrame);
            }
        };
        
        requestAnimationFrame(measureFrame);
    }

    /**
     * Track memory usage over time
     */
    trackMemoryUsage() {
        setInterval(() => {
            const usage = this.getMemoryUsage();
            const total = this.getTotalMemory();
            
            if (usage > total * 0.8) {
                console.warn('High memory usage detected:', usage / 1024 / 1024, 'MB');
                this.suggestMemoryOptimizations();
            }
        }, 10000); // Check every 10 seconds
    }

    /**
     * Track network performance
     */
    trackNetworkPerformance() {
        // Override fetch to track network requests
        const originalFetch = window.fetch;
        
        window.fetch = async (...args) => {
            const startTime = performance.now();
            const url = args[0];
            
            try {
                const response = await originalFetch(...args);
                const endTime = performance.now();
                
                this.recordMetric('network', {
                    url,
                    duration: endTime - startTime,
                    status: response.status,
                    size: response.headers.get('content-length'),
                    timestamp: Date.now()
                });
                
                return response;
            } catch (error) {
                const endTime = performance.now();
                
                this.recordMetric('network', {
                    url,
                    duration: endTime - startTime,
                    error: error.message,
                    timestamp: Date.now()
                });
                
                throw error;
            }
        };
    }

    /**
     * Collect network metrics
     */
    collectNetworkMetrics() {
        if ('connection' in navigator) {
            this.recordMetric('connection', {
                effectiveType: navigator.connection.effectiveType,
                downlink: navigator.connection.downlink,
                rtt: navigator.connection.rtt,
                saveData: navigator.connection.saveData
            });
        }
    }

    /**
     * Count event listeners (approximation)
     */
    countEventListeners() {
        // This is an approximation - actual count is hard to determine
        return document.querySelectorAll('[onclick], [onload], [onchange]').length;
    }

    /**
     * Get DOM mutation count
     */
    getMutationCount() {
        // This would need to be tracked separately with MutationObserver
        return 0;
    }

    /**
     * Generate performance report
     */
    generateReport() {
        const report = {
            timestamp: Date.now(),
            memory: this.getLatestMetric('memory'),
            network: this.getAverageMetric('network', 'duration'),
            framerate: this.getLatestMetric('framerate'),
            profilers: this.getActiveProfilers(),
            suggestions: this.generateSuggestions()
        };
        
        // Log critical issues
        this.checkCriticalIssues(report);
        
        return report;
    }

    /**
     * Get latest metric value
     */
    getLatestMetric(category) {
        const metrics = this.metrics.get(category);
        return metrics && metrics.length > 0 ? metrics[metrics.length - 1] : null;
    }

    /**
     * Get average metric value
     */
    getAverageMetric(category, property) {
        const metrics = this.metrics.get(category);
        if (!metrics || metrics.length === 0) return 0;
        
        const values = metrics.map(m => m[property]).filter(v => typeof v === 'number');
        return values.reduce((sum, val) => sum + val, 0) / values.length;
    }

    /**
     * Get active profilers
     */
    getActiveProfilers() {
        return Array.from(this.profilers.keys());
    }

    /**
     * Generate optimization suggestions
     */
    generateSuggestions() {
        const suggestions = [];
        
        // Memory suggestions
        const memory = this.getLatestMetric('memory');
        if (memory && memory.percentage > 80) {
            suggestions.push('High memory usage detected. Consider optimizing data structures.');
        }
        
        // Network suggestions
        const avgNetworkTime = this.getAverageMetric('network', 'duration');
        if (avgNetworkTime > 2000) {
            suggestions.push('Slow network requests detected. Consider caching or request optimization.');
        }
        
        // Frame rate suggestions
        const framerate = this.getLatestMetric('framerate');
        if (framerate && framerate.fps < 30) {
            suggestions.push('Low frame rate detected. Consider reducing animation complexity.');
        }
        
        return suggestions;
    }

    /**
     * Check for critical performance issues
     */
    checkCriticalIssues(report) {
        if (report.memory && report.memory.percentage > 90) {
            console.error('CRITICAL: Memory usage above 90%');
        }
        
        if (report.framerate && report.framerate.fps < 15) {
            console.error('CRITICAL: Frame rate below 15 FPS');
        }
        
        const longTasks = this.metrics.get('longtask') || [];
        const recentLongTasks = longTasks.filter(task => 
            Date.now() - task.timestamp < 60000 && task.duration > 100
        );
        
        if (recentLongTasks.length > 5) {
            console.error('CRITICAL: Multiple long tasks detected');
        }
    }

    /**
     * Suggest memory optimizations
     */
    suggestMemoryOptimizations() {
        const suggestions = [
            'Clear unused variables and references',
            'Remove detached DOM elements',
            'Optimize image sizes and formats',
            'Implement object pooling for frequently created objects',
            'Use WeakMap/WeakSet for temporary references'
        ];
        
        console.log('Memory optimization suggestions:', suggestions);
    }

    /**
     * Create benchmark
     */
    createBenchmark(name, fn, iterations = 100) {
        return async () => {
            const results = [];
            
            for (let i = 0; i < iterations; i++) {
                const start = performance.now();
                await fn();
                const end = performance.now();
                results.push(end - start);
            }
            
            const benchmark = {
                name,
                iterations,
                average: results.reduce((a, b) => a + b) / results.length,
                min: Math.min(...results),
                max: Math.max(...results),
                median: results.sort((a, b) => a - b)[Math.floor(results.length / 2)]
            };
            
            this.benchmarks.set(name, benchmark);
            return benchmark;
        };
    }

    /**
     * Run all benchmarks
     */
    async runBenchmarks() {
        const results = {};
        
        for (const [name, benchmark] of this.benchmarks) {
            results[name] = await benchmark();
        }
        
        return results;
    }

    /**
     * Export performance data
     */
    exportData() {
        return {
            metrics: Object.fromEntries(this.metrics),
            benchmarks: Object.fromEntries(this.benchmarks),
            report: this.generateReport()
        };
    }

    /**
     * Clear all performance data
     */
    clearData() {
        this.metrics.clear();
        this.benchmarks.clear();
        this.profilers.clear();
    }
}

// Performance optimization utilities
class PerformanceOptimizer {
    /**
     * Debounce function calls
     */
    static debounce(func, wait, immediate = false) {
        let timeout;
        
        return function executedFunction(...args) {
            const later = () => {
                timeout = null;
                if (!immediate) func.apply(this, args);
            };
            
            const callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
            
            if (callNow) func.apply(this, args);
        };
    }

    /**
     * Throttle function calls
     */
    static throttle(func, limit) {
        let inThrottle;
        
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    /**
     * Memoize function results
     */
    static memoize(fn, getKey = (...args) => JSON.stringify(args)) {
        const cache = new Map();
        
        return function(...args) {
            const key = getKey(...args);
            
            if (cache.has(key)) {
                return cache.get(key);
            }
            
            const result = fn.apply(this, args);
            cache.set(key, result);
            
            return result;
        };
    }

    /**
     * Lazy load images
     */
    static lazyLoadImages(selector = 'img[data-src]') {
        if ('IntersectionObserver' in window) {
            const imageObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                        imageObserver.unobserve(img);
                    }
                });
            });

            document.querySelectorAll(selector).forEach(img => {
                imageObserver.observe(img);
            });
        }
    }

    /**
     * Optimize DOM queries
     */
    static optimizeQueries() {
        // Cache frequently used elements
        const elementCache = new Map();
        
        const originalQuerySelector = document.querySelector;
        const originalQuerySelectorAll = document.querySelectorAll;
        
        document.querySelector = function(selector) {
            if (elementCache.has(selector)) {
                const cached = elementCache.get(selector);
                if (document.contains(cached)) {
                    return cached;
                }
                elementCache.delete(selector);
            }
            
            const element = originalQuerySelector.call(this, selector);
            if (element) {
                elementCache.set(selector, element);
            }
            
            return element;
        };
    }
}

// Create global performance monitor instance
window.performanceMonitor = new PerformanceMonitor();
window.PerformanceOptimizer = PerformanceOptimizer;

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PerformanceMonitor, PerformanceOptimizer };
}
