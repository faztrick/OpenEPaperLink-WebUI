// OpenEPL ESP32 - Canvas Rendering Engine
// Handles all canvas drawing operations and image rendering

/**
 * Canvas Renderer Class
 * Handles drawing operations, image rendering, and canvas optimizations
 */
class CanvasRenderer {
    constructor() {
        this.canvasCache = new Map();
        this.imageCache = new Map();
        this.drawingQueue = [];
        this.isDrawing = false;
        this.canvasPool = [];
        this.maxPoolSize = 5;
        
        this.initializeDefaults();
    }

    /**
     * Initialize default settings
     */
    initializeDefaults() {
        this.defaultFont = '16px Arial';
        this.defaultTextColor = '#000000';
        this.defaultBackgroundColor = '#FFFFFF';
        this.dithering = false;
        this.rotation = 0;
    }

    /**
     * Create or get cached canvas
     */
    getCanvas(width, height, key = null) {
        const cacheKey = key || `${width}x${height}`;
        
        if (this.canvasCache.has(cacheKey)) {
            return this.canvasCache.get(cacheKey);
        }
        
        const canvas = this.createCanvas(width, height);
        this.canvasCache.set(cacheKey, canvas);
        
        return canvas;
    }

    /**
     * Create new canvas element
     */
    createCanvas(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        // Set up 2D context with optimizations
        const ctx = canvas.getContext('2d', {
            alpha: false,
            willReadFrequently: true
        });
        
        // Apply default settings
        ctx.fillStyle = this.defaultBackgroundColor;
        ctx.fillRect(0, 0, width, height);
        ctx.font = this.defaultFont;
        ctx.fillStyle = this.defaultTextColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        
        return canvas;
    }

    /**
     * Clear canvas with background color
     */
    clearCanvas(canvas, backgroundColor = null) {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = backgroundColor || this.defaultBackgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    /**
     * Draw text on canvas with advanced options
     */
    drawText(canvas, text, x, y, options = {}) {
        const ctx = canvas.getContext('2d');
        
        // Save current state
        ctx.save();
        
        // Apply text options
        if (options.font) ctx.font = options.font;
        if (options.fillStyle) ctx.fillStyle = options.fillStyle;
        if (options.strokeStyle) ctx.strokeStyle = options.strokeStyle;
        if (options.textAlign) ctx.textAlign = options.textAlign;
        if (options.textBaseline) ctx.textBaseline = options.textBaseline;
        if (options.maxWidth) ctx.maxWidth = options.maxWidth;
        
        // Handle rotation
        if (options.rotation) {
            ctx.translate(x, y);
            ctx.rotate(options.rotation * Math.PI / 180);
            x = 0;
            y = 0;
        }
        
        // Draw text
        if (options.strokeStyle && options.lineWidth) {
            ctx.lineWidth = options.lineWidth;
            ctx.strokeText(text, x, y, options.maxWidth);
        }
        
        ctx.fillText(text, x, y, options.maxWidth);
        
        // Restore state
        ctx.restore();
    }

    /**
     * Draw image on canvas with scaling and positioning
     */
    async drawImage(canvas, imageSource, options = {}) {
        try {
            const img = await this.loadImage(imageSource);
            const ctx = canvas.getContext('2d');
            
            const {
                x = 0,
                y = 0,
                width = img.width,
                height = img.height,
                rotation = 0,
                opacity = 1,
                scalingMode = 'smooth'
            } = options;
            
            ctx.save();
            
            // Set image smoothing
            ctx.imageSmoothingEnabled = scalingMode === 'smooth';
            ctx.imageSmoothingQuality = scalingMode === 'smooth' ? 'high' : 'low';
            
            // Apply opacity
            if (opacity < 1) {
                ctx.globalAlpha = opacity;
            }
            
            // Handle rotation
            if (rotation) {
                ctx.translate(x + width / 2, y + height / 2);
                ctx.rotate(rotation * Math.PI / 180);
                ctx.drawImage(img, -width / 2, -height / 2, width, height);
            } else {
                ctx.drawImage(img, x, y, width, height);
            }
            
            ctx.restore();
            return true;
            
        } catch (error) {
            console.error('Error drawing image:', error);
            return false;
        }
    }

    /**
     * Load and cache image
     */
    async loadImage(source) {
        if (this.imageCache.has(source)) {
            return this.imageCache.get(source);
        }
        
        return new Promise((resolve, reject) => {
            const img = new Image();
            
            img.onload = () => {
                this.imageCache.set(source, img);
                resolve(img);
            };
            
            img.onerror = () => {
                reject(new Error(`Failed to load image: ${source}`));
            };
            
            // Handle different source types
            if (source instanceof File || source instanceof Blob) {
                img.src = URL.createObjectURL(source);
            } else if (source instanceof ImageData) {
                // Convert ImageData to canvas then to blob
                const tempCanvas = this.createCanvas(source.width, source.height);
                tempCanvas.getContext('2d').putImageData(source, 0, 0);
                tempCanvas.toBlob(blob => {
                    img.src = URL.createObjectURL(blob);
                });
            } else {
                img.src = source;
            }
        });
    }

    /**
     * Draw rectangle with advanced styling
     */
    drawRect(canvas, x, y, width, height, options = {}) {
        const ctx = canvas.getContext('2d');
        
        ctx.save();
        
        if (options.fillStyle) {
            ctx.fillStyle = options.fillStyle;
            ctx.fillRect(x, y, width, height);
        }
        
        if (options.strokeStyle) {
            ctx.strokeStyle = options.strokeStyle;
            if (options.lineWidth) ctx.lineWidth = options.lineWidth;
            ctx.strokeRect(x, y, width, height);
        }
        
        ctx.restore();
    }

    /**
     * Draw line with styling
     */
    drawLine(canvas, x1, y1, x2, y2, options = {}) {
        const ctx = canvas.getContext('2d');
        
        ctx.save();
        
        if (options.strokeStyle) ctx.strokeStyle = options.strokeStyle;
        if (options.lineWidth) ctx.lineWidth = options.lineWidth;
        if (options.lineCap) ctx.lineCap = options.lineCap;
        
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        
        ctx.restore();
    }

    /**
     * Apply dithering to canvas for e-paper display
     */
    applyDithering(canvas, method = 'floyd-steinberg') {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        switch (method) {
            case 'floyd-steinberg':
                this.floydSteinbergDithering(imageData);
                break;
            case 'ordered':
                this.orderedDithering(imageData);
                break;
            case 'atkinson':
                this.atkinsonDithering(imageData);
                break;
            default:
                console.warn('Unknown dithering method:', method);
                return;
        }
        
        ctx.putImageData(imageData, 0, 0);
    }

    /**
     * Floyd-Steinberg dithering algorithm
     */
    floydSteinbergDithering(imageData) {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                
                // Convert to grayscale
                const gray = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
                
                // Quantize to black or white
                const newGray = gray < 128 ? 0 : 255;
                const error = gray - newGray;
                
                // Set pixel to black or white
                data[idx] = data[idx + 1] = data[idx + 2] = newGray;
                
                // Distribute error to neighboring pixels
                this.distributeError(data, width, height, x, y, error);
            }
        }
    }

    /**
     * Distribute dithering error to neighboring pixels
     */
    distributeError(data, width, height, x, y, error) {
        const neighbors = [
            [x + 1, y, 7/16],
            [x - 1, y + 1, 3/16],
            [x, y + 1, 5/16],
            [x + 1, y + 1, 1/16]
        ];
        
        for (const [nx, ny, weight] of neighbors) {
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const idx = (ny * width + nx) * 4;
                const adjustment = error * weight;
                
                data[idx] = Math.max(0, Math.min(255, data[idx] + adjustment));
                data[idx + 1] = Math.max(0, Math.min(255, data[idx + 1] + adjustment));
                data[idx + 2] = Math.max(0, Math.min(255, data[idx + 2] + adjustment));
            }
        }
    }

    /**
     * Convert canvas to specific format for e-paper display
     */
    convertToEPaperFormat(canvas, format = 'BW') {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        switch (format) {
            case 'BW':
                this.convertToBlackWhite(data);
                break;
            case 'BWR':
                this.convertToBlackWhiteRed(data);
                break;
            case 'BWY':
                this.convertToBlackWhiteYellow(data);
                break;
            default:
                console.warn('Unknown e-paper format:', format);
                return canvas;
        }
        
        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }

    /**
     * Convert to black and white
     */
    convertToBlackWhite(data) {
        for (let i = 0; i < data.length; i += 4) {
            const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
            const bw = gray < 128 ? 0 : 255;
            data[i] = data[i + 1] = data[i + 2] = bw;
        }
    }

    /**
     * Convert to black, white, and red
     */
    convertToBlackWhiteRed(data) {
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            // Check if pixel is predominantly red
            if (r > g + b && r > 128) {
                data[i] = 255;  // Red
                data[i + 1] = 0;
                data[i + 2] = 0;
            } else {
                // Convert to grayscale and then black/white
                const gray = r * 0.299 + g * 0.587 + b * 0.114;
                const bw = gray < 128 ? 0 : 255;
                data[i] = data[i + 1] = data[i + 2] = bw;
            }
        }
    }

    /**
     * Resize canvas maintaining aspect ratio
     */
    resizeCanvas(sourceCanvas, targetWidth, targetHeight, maintainAspect = true) {
        let newWidth = targetWidth;
        let newHeight = targetHeight;
        
        if (maintainAspect) {
            const aspectRatio = sourceCanvas.width / sourceCanvas.height;
            const targetAspectRatio = targetWidth / targetHeight;
            
            if (aspectRatio > targetAspectRatio) {
                newHeight = targetWidth / aspectRatio;
            } else {
                newWidth = targetHeight * aspectRatio;
            }
        }
        
        const resizedCanvas = this.createCanvas(newWidth, newHeight);
        const ctx = resizedCanvas.getContext('2d');
        
        ctx.drawImage(sourceCanvas, 0, 0, newWidth, newHeight);
        
        return resizedCanvas;
    }

    /**
     * Create composite canvas from multiple sources
     */
    createComposite(sources, targetWidth, targetHeight) {
        const composite = this.createCanvas(targetWidth, targetHeight);
        
        for (const source of sources) {
            if (source.canvas) {
                this.drawImage(composite, source.canvas, source.options || {});
            } else if (source.text) {
                this.drawText(composite, source.text, source.x || 0, source.y || 0, source.options || {});
            } else if (source.rect) {
                this.drawRect(composite, source.x || 0, source.y || 0, 
                             source.width || 10, source.height || 10, source.options || {});
            }
        }
        
        return composite;
    }

    /**
     * Export canvas as various formats
     */
    exportCanvas(canvas, format = 'png', quality = 0.9) {
        switch (format.toLowerCase()) {
            case 'png':
                return canvas.toDataURL('image/png');
            case 'jpeg':
            case 'jpg':
                return canvas.toDataURL('image/jpeg', quality);
            case 'webp':
                return canvas.toDataURL('image/webp', quality);
            case 'blob':
                return new Promise(resolve => {
                    canvas.toBlob(resolve, 'image/png');
                });
            case 'imagedata':
                return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
            default:
                console.warn('Unknown export format:', format);
                return canvas.toDataURL('image/png');
        }
    }

    /**
     * Get optimized canvas pool
     */
    getPooledCanvas(width, height) {
        for (let i = 0; i < this.canvasPool.length; i++) {
            const poolCanvas = this.canvasPool[i];
            if (poolCanvas.width >= width && poolCanvas.height >= height) {
                this.canvasPool.splice(i, 1);
                
                // Resize if needed
                if (poolCanvas.width !== width || poolCanvas.height !== height) {
                    poolCanvas.width = width;
                    poolCanvas.height = height;
                }
                
                this.clearCanvas(poolCanvas);
                return poolCanvas;
            }
        }
        
        return this.createCanvas(width, height);
    }

    /**
     * Return canvas to pool for reuse
     */
    returnToPool(canvas) {
        if (this.canvasPool.length < this.maxPoolSize) {
            this.clearCanvas(canvas);
            this.canvasPool.push(canvas);
        }
    }

    /**
     * Clear all caches and reset
     */
    clearCaches() {
        this.canvasCache.clear();
        this.imageCache.clear();
        this.canvasPool = [];
    }

    /**
     * Measure text dimensions
     */
    measureText(text, font = null) {
        const tempCanvas = this.getPooledCanvas(1, 1);
        const ctx = tempCanvas.getContext('2d');
        
        if (font) ctx.font = font;
        const metrics = ctx.measureText(text);
        
        this.returnToPool(tempCanvas);
        
        return {
            width: metrics.width,
            height: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
        };
    }
}

// Create global canvas renderer instance
window.canvasRenderer = new CanvasRenderer();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CanvasRenderer;
}
