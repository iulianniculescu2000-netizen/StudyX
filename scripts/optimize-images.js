const sharp = require('sharp');
const imagemin = require('imagemin');
const imageminWebp = require('imagemin-webp');
const imageminMozjpeg = require('imagemin-mozjpeg');
const imageminPngquant = require('imagemin-pngquant');
const imageminSvgo = require('imagemin-svgo');
const path = require('path');
const fs = require('fs').promises;

// Image optimization configuration
const OPTIMIZATION_CONFIG = {
  // JPEG optimization
  jpeg: {
    quality: 85,
    progressive: true,
    mozjpeg: {
      quality: 85,
      progressive: true
    }
  },
  
  // PNG optimization
  png: {
    quality: [0.6, 0.8],
    pngquant: {
      quality: [0.6, 0.8],
      speed: 4
    }
  },
  
  // WebP optimization
  webp: {
    quality: 85,
    method: 6,
    effort: 6
  },
  
  // SVG optimization
  svg: {
    plugins: [
      {
        name: 'preset-default',
        params: {
          overrides: {
            removeViewBox: false,
            cleanupIDs: false
          }
        }
      }
    ]
  },
  
  // Responsive image sizes
  responsiveSizes: [
    { name: 'small', width: 320, quality: 80 },
    { name: 'medium', width: 768, quality: 85 },
    { name: 'large', width: 1024, quality: 90 },
    { name: 'xlarge', width: 1920, quality: 85 }
  ]
};

// Main optimization function
async function optimizeImages(inputDir, outputDir, options = {}) {
  const config = { ...OPTIMIZATION_CONFIG, ...options };
  const startTime = Date.now();
  
  console.log('Starting image optimization...');
  console.log(`Input: ${inputDir}`);
  console.log(`Output: ${outputDir}`);
  
  try {
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });
    
    // Find all image files
    const imageFiles = await findImageFiles(inputDir);
    console.log(`Found ${imageFiles.length} image files`);
    
    const results = {
      optimized: [],
      errors: [],
      originalSize: 0,
      optimizedSize: 0,
      compressionRatio: 0
    };
    
    // Process each image
    for (const filePath of imageFiles) {
      try {
        const result = await processImage(filePath, inputDir, outputDir, config);
        results.optimized.push(result);
        results.originalSize += result.originalSize;
        results.optimizedSize += result.optimizedSize;
      } catch (error) {
        console.error(`Failed to process ${filePath}:`, error);
        results.errors.push({ file: filePath, error: error.message });
      }
    }
    
    // Calculate compression ratio
    if (results.originalSize > 0) {
      results.compressionRatio = ((results.originalSize - results.optimizedSize) / results.originalSize) * 100;
    }
    
    // Generate optimization report
    await generateOptimizationReport(results, outputDir);
    
    const duration = Date.now() - startTime;
    console.log(`Optimization completed in ${duration}ms`);
    console.log(`Compression ratio: ${results.compressionRatio.toFixed(2)}%`);
    console.log(`Errors: ${results.errors.length}`);
    
    return results;
    
  } catch (error) {
    console.error('Image optimization failed:', error);
    throw error;
  }
}

// Find all image files in directory
async function findImageFiles(dir) {
  const files = [];
  const extensions = ['.jpg', '.jpeg', '.png', '.svg', '.webp'];
  
  async function scanDirectory(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        await scanDirectory(fullPath);
      } else if (extensions.some(ext => entry.name.toLowerCase().endsWith(ext))) {
        files.push(fullPath);
      }
    }
  }
  
  await scanDirectory(dir);
  return files;
}

// Process individual image
async function processImage(filePath, inputDir, outputDir, config) {
  const ext = path.extname(filePath).toLowerCase();
  const relativePath = path.relative(inputDir, filePath);
  const name = path.basename(filePath, ext);
  const outputSubDir = path.dirname(path.join(outputDir, relativePath));
  
  // Ensure output subdirectory exists
  await fs.mkdir(outputSubDir, { recursive: true });
  
  // Get original file stats
  const originalStats = await fs.stat(filePath);
  const originalSize = originalStats.size;
  
  const result = {
    originalPath: filePath,
    outputPath: '',
    originalSize,
    optimizedSize: 0,
    format: ext.slice(1),
    variants: []
  };
  
  // Process based on format
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      await processJPEG(filePath, outputSubDir, name, config, result);
      break;
      
    case '.png':
      await processPNG(filePath, outputSubDir, name, config, result);
      break;
      
    case '.svg':
      await processSVG(filePath, outputSubDir, name, config, result);
      break;
      
    case '.webp':
      await processWebP(filePath, outputSubDir, name, config, result);
      break;
      
    default:
      throw new Error(`Unsupported format: ${ext}`);
  }
  
  return result;
}

// Process JPEG images
async function processJPEG(filePath, outputDir, name, config, result) {
  // Create optimized JPEG
  const optimizedJPEG = await imagemin([filePath], {
    destination: outputDir,
    plugins: [
      imageminMozjpeg(config.jpeg.mozjpeg)
    ]
  });
  
  if (optimizedJPEG.length > 0) {
    result.optimizedSize += optimizedJPEG[0].data.length;
    result.outputPath = path.join(outputDir, `${name}.jpg`);
    result.variants.push({
      format: 'jpeg',
      path: result.outputPath,
      size: optimizedJPEG[0].data.length
    });
  }
  
  // Create WebP version
  await createWebPVariant(filePath, outputDir, name, config.webp, result);
  
  // Create responsive variants
  if (config.createResponsive) {
    await createResponsiveVariants(filePath, outputDir, name, config, 'jpeg', result);
  }
}

// Process PNG images
async function processPNG(filePath, outputDir, name, config, result) {
  // Create optimized PNG
  const optimizedPNG = await imagemin([filePath], {
    destination: outputDir,
    plugins: [
      imageminPngquant(config.png.pngquant)
    ]
  });
  
  if (optimizedPNG.length > 0) {
    result.optimizedSize += optimizedPNG[0].data.length;
    result.outputPath = path.join(outputDir, `${name}.png`);
    result.variants.push({
      format: 'png',
      path: result.outputPath,
      size: optimizedPNG[0].data.length
    });
  }
  
  // Create WebP version
  await createWebPVariant(filePath, outputDir, name, config.webp, result);
  
  // Create responsive variants
  if (config.createResponsive) {
    await createResponsiveVariants(filePath, outputDir, name, config, 'png', result);
  }
}

// Process SVG images
async function processSVG(filePath, outputDir, name, config, result) {
  // Create optimized SVG
  const optimizedSVG = await imagemin([filePath], {
    destination: outputDir,
    plugins: [
      imageminSvgo(config.svg)
    ]
  });
  
  if (optimizedSVG.length > 0) {
    result.optimizedSize += optimizedSVG[0].data.length;
    result.outputPath = path.join(outputDir, `${name}.svg`);
    result.variants.push({
      format: 'svg',
      path: result.outputPath,
      size: optimizedSVG[0].data.length
    });
  }
}

// Process WebP images
async function processWebP(filePath, outputDir, name, config, result) {
  // Create optimized WebP
  const optimizedWebP = await imagemin([filePath], {
    destination: outputDir,
    plugins: [
      imageminWebp(config.webp)
    ]
  });
  
  if (optimizedWebP.length > 0) {
    result.optimizedSize += optimizedWebP[0].data.length;
    result.outputPath = path.join(outputDir, `${name}.webp`);
    result.variants.push({
      format: 'webp',
      path: result.outputPath,
      size: optimizedWebP[0].data.length
    });
  }
}

// Create WebP variant
async function createWebPVariant(filePath, outputDir, name, config, result) {
  const webpVariant = await imagemin([filePath], {
    destination: outputDir,
    plugins: [
      imageminWebp(config)
    ]
  });
  
  if (webpVariant.length > 0) {
    result.optimizedSize += webpVariant[0].data.length;
    result.variants.push({
      format: 'webp',
      path: path.join(outputDir, `${name}.webp`),
      size: webpVariant[0].data.length
    });
  }
}

// Create responsive variants
async function createResponsiveVariants(filePath, outputDir, name, config, format, result) {
  for (const size of config.responsiveSizes) {
    const variantName = `${name}-${size.name}`;
    const variantPath = path.join(outputDir, `${variantName}.${format}`);
    
    try {
      const resized = await sharp(filePath)
        .resize(size.width, null, { 
          withoutEnlargement: true,
          fit: 'inside'
        })
        .jpeg({ quality: size.quality })
        .toBuffer();
      
      await fs.writeFile(variantPath, resized);
      
      result.optimizedSize += resized.length;
      result.variants.push({
        format,
        path: variantPath,
        size: resized.length,
        width: size.width,
        variant: size.name
      });
    } catch (error) {
      console.error(`Failed to create ${size.name} variant for ${name}:`, error);
    }
  }
}

// Generate optimization report
async function generateOptimizationReport(results, outputDir) {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalFiles: results.optimized.length,
      errors: results.errors.length,
      originalSize: results.originalSize,
      optimizedSize: results.optimizedSize,
      compressionRatio: results.compressionRatio
    },
    files: results.optimized.map(file => ({
      originalPath: file.originalPath,
      originalSize: file.originalSize,
      optimizedSize: file.optimizedSize,
      compressionRatio: ((file.originalSize - file.optimizedSize) / file.originalSize) * 100,
      format: file.format,
      variants: file.variants
    })),
    errors: results.errors
  };
  
  // Save JSON report
  const reportPath = path.join(outputDir, 'optimization-report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  
  // Generate HTML report
  const htmlReport = generateHTMLReport(report);
  const htmlPath = path.join(outputDir, 'optimization-report.html');
  await fs.writeFile(htmlPath, htmlReport);
  
  console.log(`Reports generated:`);
  console.log(`  JSON: ${reportPath}`);
  console.log(`  HTML: ${htmlPath}`);
}

// Generate HTML report
function generateHTMLReport(report) {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Image Optimization Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .summary { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
    .file-item { border: 1px solid #ddd; margin: 10px 0; padding: 15px; border-radius: 5px; }
    .error { color: red; }
    .success { color: green; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #f2f2f2; }
  </style>
</head>
<body>
  <h1>Image Optimization Report</h1>
  <p>Generated: ${report.timestamp}</p>
  
  <div class="summary">
    <h2>Summary</h2>
    <p>Total Files: ${report.summary.totalFiles}</p>
    <p>Errors: ${report.summary.errors}</p>
    <p>Original Size: ${formatBytes(report.summary.originalSize)}</p>
    <p>Optimized Size: ${formatBytes(report.summary.optimizedSize)}</p>
    <p>Compression Ratio: ${report.summary.compressionRatio.toFixed(2)}%</p>
  </div>
  
  <h2>Optimized Files</h2>
  <table>
    <thead>
      <tr>
        <th>File</th>
        <th>Format</th>
        <th>Original Size</th>
        <th>Optimized Size</th>
        <th>Compression</th>
        <th>Variants</th>
      </tr>
    </thead>
    <tbody>
      ${report.files.map(file => `
        <tr>
          <td>${path.basename(file.originalPath)}</td>
          <td>${file.format}</td>
          <td>${formatBytes(file.originalSize)}</td>
          <td>${formatBytes(file.optimizedSize)}</td>
          <td class="${file.compressionRatio > 0 ? 'success' : ''}">${file.compressionRatio.toFixed(2)}%</td>
          <td>${file.variants.map(v => `${v.format}${v.variant ? ` (${v.variant})` : ''}`).join(', ')}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  
  ${report.errors.length > 0 ? `
    <h2>Errors</h2>
    <div class="error">
      ${report.errors.map(error => `<p>${error.file}: ${error.error}</p>`).join('')}
    </div>
  ` : ''}
</body>
</html>`;
}

// Format bytes to human readable format
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const inputDir = args[0] || 'src/assets/images';
  const outputDir = args[1] || 'public/optimized-images';
  const options = {
    createResponsive: args.includes('--responsive')
  };
  
  optimizeImages(inputDir, outputDir, options)
    .then(() => {
      console.log('Image optimization completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Image optimization failed:', error);
      process.exit(1);
    });
}

module.exports = {
  optimizeImages,
  processImage,
  generateOptimizationReport,
  OPTIMIZATION_CONFIG
};
