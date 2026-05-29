import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';

type PreviewPayload = {
  fileName: string;
  ext: string;
  preview: {
    kind: 'text' | 'table' | 'list' | 'info' | 'pages';
    title: string;
    content: string | string[] | Array<Array<string | number | null>>;
  };
  supportedTargets: string[];
};

const clientPreviewExtensions = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'mp4',
  'webm',
  'mp3',
  'wav',
]);

function getExt(name: string) {
  const index = name.lastIndexOf('.');
  if (index === -1) {
    return '';
  }
  return name.slice(index + 1).toLowerCase();
}

function parseFileNameFromDisposition(disposition: string | null) {
  if (!disposition) {
    return null;
  }
  const match = disposition.match(/filename="?([^\";]+)"?/i);
  return match?.[1] || null;
}

function isImageExt(ext: string) {
  return ['png', 'jpg', 'jpeg', 'webp', 'avif', 'tiff', 'gif'].includes(ext);
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function calculateCompressedSize(
  originalSize: number,
  quality: number,
  compressionLevel: 'low' | 'medium' | 'high',
  preset: 'balanced' | 'quality' | 'size'
): number {
  if (originalSize === 0) return 0;
  
  // Quality factor: higher quality = less compression
  const qualityFactor = quality / 100;
  
  // Compression multiplier
  const compressionMultipliers: Record<string, number> = {
    low: 0.85,
    medium: 0.7,
    high: 0.55,
  };
  
  // Preset adjustment
  const presetMultipliers: Record<string, number> = {
    quality: 0.95,
    balanced: 0.85,
    size: 0.65,
  };
  
  const estimated = originalSize * qualityFactor * compressionMultipliers[compressionLevel] * presetMultipliers[preset];
  return Math.round(estimated);
}

export default function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mergeInputRef = useRef<HTMLInputElement | null>(null);
  const ocrInputRef = useRef<HTMLInputElement | null>(null);

  const [view, setView] = useState<'home' | 'workspace' | 'about' | 'privacy' | 'terms' | 'contact'>('home');
  const [file, setFile] = useState<File | null>(null);
  const [targetFormat, setTargetFormat] = useState('');
  const [imageQuality, setImageQuality] = useState(90);
  const [compressionLevel, setCompressionLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [optimizationPreset, setOptimizationPreset] = useState<'balanced' | 'quality' | 'size'>('balanced');
  const [originalFileSize, setOriginalFileSize] = useState(0);
  const [supportedTargets, setSupportedTargets] = useState<string[]>([]);
  const [conversionMap, setConversionMap] = useState<Record<string, string[]>>({});
  const [serverPreview, setServerPreview] = useState<PreviewPayload | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Upload a file to start previewing and converting.');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const [mergeFiles, setMergeFiles] = useState<File[]>([]);
  const [mergeMode, setMergeMode] = useState<'auto' | 'text' | 'image' | 'pdf'>('auto');
  const [isMerging, setIsMerging] = useState(false);
  const [mergeStatus, setMergeStatus] = useState('Upload at least two files to merge them.');

  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [ocrNote, setOcrNote] = useState('');
  const [isRunningOcr, setIsRunningOcr] = useState(false);

  const [activeTab, setActiveTab] = useState<'converter' | 'merge' | 'ocr'>('converter');

  const ext = useMemo(() => (file ? getExt(file.name) : ''), [file]);
  const isImageConversion = useMemo(
    () => isImageExt(ext) && ['png', 'jpg', 'jpeg', 'webp', 'avif', 'tiff'].includes(targetFormat),
    [ext, targetFormat]
  );

  const conversionPairs = useMemo(() => {
    return Object.entries(conversionMap).slice(0, 14);
  }, [conversionMap]);

  const estimatedCompressedSize = useMemo(() => {
    return calculateCompressedSize(originalFileSize, imageQuality, compressionLevel, optimizationPreset);
  }, [originalFileSize, imageQuality, compressionLevel, optimizationPreset]);

  const compressionPercentage = useMemo(() => {
    if (originalFileSize === 0) return 0;
    return Math.round(((originalFileSize - estimatedCompressedSize) / originalFileSize) * 100);
  }, [originalFileSize, estimatedCompressedSize]);

  // Auto-adjust slider when preset changes
  useEffect(() => {
    if (optimizationPreset === 'quality') {
      setImageQuality(95);
    } else if (optimizationPreset === 'size') {
      setImageQuality(40);
    } else if (optimizationPreset === 'balanced') {
      setImageQuality(70);
    }
  }, [optimizationPreset]);

  useEffect(() => {
    return () => {
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    };
  }, [localPreviewUrl]);

  useEffect(() => {
    const loadSupport = async () => {
      try {
        const response = await fetch('/api/converter/support');
        const data = await response.json();
        if (response.ok && data?.conversionMap) {
          setConversionMap(data.conversionMap as Record<string, string[]>);
        }
      } catch {
        // Keep fallback content when support endpoint fails.
      }
    };
    void loadSupport();
  }, []);

  const clearAll = (message?: string) => {
    setFile(null);
    setTargetFormat('');
    setImageQuality(90);
    setCompressionLevel('medium');
    setOptimizationPreset('balanced');
    setOriginalFileSize(0);
    setSupportedTargets([]);
    setServerPreview(null);
    setError('');
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
    }
    setLocalPreviewUrl('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setStatus(message || 'Upload a file to start previewing and converting.');
  };

  const createLocalPreview = (nextFile: File) => {
    const nextExt = getExt(nextFile.name);
    if (!clientPreviewExtensions.has(nextExt)) {
      setLocalPreviewUrl('');
      return;
    }

    const url = URL.createObjectURL(nextFile);
    setLocalPreviewUrl((previousUrl) => {
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
      }
      return url;
    });
  };

  const loadPreview = async (nextFile: File) => {
    setIsLoadingPreview(true);
    setError('');
    setServerPreview(null);
    setSupportedTargets([]);
    setTargetFormat('');

    createLocalPreview(nextFile);

    const formData = new FormData();
    formData.append('file', nextFile);

    try {
      const response = await fetch('/api/converter/preview', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'Unable to preview this file.');
      }

      const payload = data as PreviewPayload;
      setServerPreview(payload);
      setSupportedTargets(payload.supportedTargets || []);
      setTargetFormat(payload.supportedTargets?.[0] || '');
      setStatus('Preview is ready. Choose a target format to convert.');
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Failed to preview file.');
      setStatus('Preview failed. Try another file type or smaller file.');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0] || null;
    setFile(picked);
    if (!picked) {
      clearAll();
      return;
    }
    setOriginalFileSize(picked.size);
    await loadPreview(picked);
  };

  const onDrag = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const onDrop = async (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const picked = e.dataTransfer.files?.[0] || null;
    if (!picked) {
      setError('No file selected. Please try again.');
      return;
    }

    setFile(picked);
    if (fileInputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(picked);
      fileInputRef.current.files = dt.files;
    }

    await loadPreview(picked);
  };

  const convertFile = async () => {
    if (!file || !targetFormat) {
      setError('Please upload a file and choose a target format.');
      return;
    }

    setIsConverting(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('targetFormat', targetFormat);
    if (isImageConversion) {
      // Apply optimization preset
      let quality = imageQuality;
      if (optimizationPreset === 'quality') {
        quality = Math.min(100, imageQuality + 10);
      } else if (optimizationPreset === 'size') {
        quality = Math.max(20, imageQuality - 15);
      }
      formData.append('imageQuality', String(quality));
      formData.append('compressionLevel', compressionLevel);
      formData.append('optimizationPreset', optimizationPreset);
    }

    try {
      const response = await fetch('/api/converter/convert', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.error || 'Conversion failed.');
      }

      const blob = await response.blob();
      const fileNameFromHeader = parseFileNameFromDisposition(
        response.headers.get('content-disposition')
      );
      const downloadName = fileNameFromHeader || `converted.${targetFormat}`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = downloadName;
      link.click();
      URL.revokeObjectURL(url);

      clearAll(`Converted and downloaded: ${downloadName}. You can upload a new file now.`);
      // Scroll to top after conversion
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 300);
    } catch (convertError) {
      setError(convertError instanceof Error ? convertError.message : 'Conversion failed unexpectedly.');
      setStatus('Conversion failed. Check format support and retry.');
    } finally {
      setIsConverting(false);
    }
  };

  const mergeSelectedFiles = async () => {
    if (mergeFiles.length < 2) {
      setMergeStatus('Please select at least two files for merge.');
      return;
    }

    setIsMerging(true);
    setMergeStatus('Merging files...');

    const formData = new FormData();
    mergeFiles.forEach((item) => formData.append('files', item));
    formData.append('mergeMode', mergeMode);

    try {
      const response = await fetch('/api/converter/merge', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data?.error || 'Merge failed.');
      }

      const blob = await response.blob();
      const fileNameFromHeader = parseFileNameFromDisposition(
        response.headers.get('content-disposition')
      );
      const downloadName = fileNameFromHeader || 'merged_output.bin';

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = downloadName;
      link.click();
      URL.revokeObjectURL(url);

      setMergeStatus(`Merged and downloaded: ${downloadName}`);
      setMergeFiles([]);
      setMergeMode('auto');
      if (mergeInputRef.current) {
        mergeInputRef.current.value = '';
      }
      // Scroll to top after merge
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 300);
    } catch (mergeError) {
      setMergeStatus(mergeError instanceof Error ? mergeError.message : 'Merge failed unexpectedly.');
    } finally {
      setIsMerging(false);
    }
  };

  const runOcr = async () => {
    if (!ocrFile) {
      setOcrNote('Please choose a file for OCR.');
      return;
    }

    setIsRunningOcr(true);
    setOcrText('');
    setOcrNote('Running OCR...');

    const formData = new FormData();
    formData.append('file', ocrFile);

    try {
      const response = await fetch('/api/converter/ocr', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || 'OCR failed.');
      }

      setOcrText(String(data?.text || ''));
      setOcrNote(String(data?.note || 'OCR completed.'));
      setOcrFile(null);
      if (ocrInputRef.current) {
        ocrInputRef.current.value = '';
      }
      // Scroll to top after OCR
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 300);
    } catch (ocrError) {
      setOcrNote(ocrError instanceof Error ? ocrError.message : 'OCR failed unexpectedly.');
    } finally {
      setIsRunningOcr(false);
    }
  };

  const openWorkspace = () => {
    setView('workspace');
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 50);
  };

  return (
    <div className="app-shell">
      <div className="backdrop" />
      
      {/* Global Header */}
      <motion.nav
        className="global-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="header-content">
          <div className="logo-section" onClick={() => setView('home')}>
            <span className="logo-icon">⚡</span>
            <span className="logo-text">FileForge</span>
          </div>
          <div className="header-links">
            {view === 'workspace' && (
              <button className="nav-link" onClick={() => setView('home')}>← Back to Home</button>
            )}
            {view === 'home' && (
              <button className="nav-link primary" onClick={() => setView('workspace')}>Start Converting</button>
            )}
          </div>
        </div>
      </motion.nav>

      {view === 'home' && (
        <>
          <motion.header
            className="hero"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <div className="hero-badge">✨ PHASE 1.1 - POWERED BY AI</div>
            <h1>Universal File Converter</h1>
            <p className="hero-subtitle">
              Lightning-fast file transformations across 14+ formats. Upload once, convert anywhere, download instantly.
            </p>
            <div className="hero-metrics">
              <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                ⚡ 14+ formats
              </motion.span>
              <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                📄 PDF preview
              </motion.span>
              <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                🔍 OCR scanning
              </motion.span>
              <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
              >
                🔗 Merge files
              </motion.span>
            </div>
            <div className="hero-actions">
              <motion.button
                className="action hero-primary-btn"
                onClick={openWorkspace}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.5 }}
                whileHover={{ scale: 1.05, boxShadow: '0 20px 40px rgba(6, 214, 208, 0.25)' }}
                whileTap={{ scale: 0.95 }}
              >
                Start Converting Now
              </motion.button>
              <motion.p
                className="hero-cta-text"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.6 }}
              >
                No sign-up required • No file size limits • Unlimited conversions
              </motion.p>
            </div>

            <motion.div
              className="hero-trust-badges"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.8 }}
            >
              <div className="trust-badge">
                <span className="badge-number">10M+</span>
                <span className="badge-label">Conversions Monthly</span>
              </div>
              <div className="trust-badge">
                <span className="badge-number">99.9%</span>
                <span className="badge-label">Uptime Guaranteed</span>
              </div>
              <div className="trust-badge">
                <span className="badge-number">0s</span>
                <span className="badge-label">Setup Required</span>
              </div>
            </motion.div>
          </motion.header>

          <main className="grid landing-grid">
            <motion.section
              className="panel feature-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              viewport={{ once: true }}
            >
              <div className="feature-icon">🔄</div>
              <h2>Real Conversion Engine</h2>
              <p>14+ format routes for images, documents, data, and text with direct download output.</p>
              <ul className="feature-list">
                <li>PNG, JPG, WEBP conversions</li>
                <li>PDF, DOCX to TXT/HTML</li>
                <li>CSV, XLSX, JSON support</li>
              </ul>
            </motion.section>

            <motion.section
              className="panel feature-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              viewport={{ once: true }}
            >
              <div className="feature-icon">📄</div>
              <h2>PDF Page-by-Page Preview</h2>
              <p>Preview extracted text per page to quickly inspect long PDFs before conversion.</p>
              <ul className="feature-list">
                <li>Instant page preview</li>
                <li>Text extraction</li>
                <li>Smart pagination</li>
              </ul>
            </motion.section>

            <motion.section
              className="panel feature-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              viewport={{ once: true }}
            >
              <div className="feature-icon">🎨</div>
              <h2>Image Optimization</h2>
              <p>Adjust quality before conversion to balance file size and visual fidelity.</p>
              <ul className="feature-list">
                <li>Quality slider (20-100%)</li>
                <li>Format conversion</li>
                <li>File compression</li>
              </ul>
            </motion.section>

            <motion.section
              className="panel feature-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              viewport={{ once: true }}
            >
              <div className="feature-icon">📎</div>
              <h2>Merge + OCR</h2>
              <p>Combine files into one output and extract text from images with OCR technology.</p>
              <ul className="feature-list">
                <li>Multi-file merging</li>
                <li>Scanned doc OCR</li>
                <li>Batch operations</li>
              </ul>
            </motion.section>

            <motion.section
              className="panel feature-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              viewport={{ once: true }}
            >
              <div className="feature-icon">⚙️</div>
              <h2>Built for Scale</h2>
              <p>Enterprise-grade performance with security and rate limiting for reliability.</p>
              <ul className="feature-list">
                <li>Rate limiting protection</li>
                <li>Secure processing</li>
                <li>Global CDN delivery</li>
              </ul>
            </motion.section>
          </main>
        </>
      )}

      {view === 'workspace' && (
        <>
          <motion.header
            className="hero workspace-hero"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <p className="eyebrow">Workspace</p>
            <h1>Converter + Preview + Merge + OCR</h1>
            <p>
              Run conversions, inspect PDF pages, compress images, merge files, and extract text from scanned documents.
            </p>
            <div className="hero-actions">
              <button className="ghost-action" onClick={() => setView('home')}>
                Back to Landing
              </button>
            </div>
          </motion.header>

          <main className="workspace-container">
            <nav className="tab-nav">
              <button
                className={`tab-button ${activeTab === 'converter' ? 'active' : ''}`}
                onClick={() => setActiveTab('converter')}
              >
                <span className="tab-icon">🔄</span>
                <span className="tab-label">File Converter</span>
              </button>
              <button
                className={`tab-button ${activeTab === 'merge' ? 'active' : ''}`}
                onClick={() => setActiveTab('merge')}
              >
                <span className="tab-icon">📎</span>
                <span className="tab-label">Merge Files</span>
              </button>
              <button
                className={`tab-button ${activeTab === 'ocr' ? 'active' : ''}`}
                onClick={() => setActiveTab('ocr')}
              >
                <span className="tab-icon">📄</span>
                <span className="tab-label">Extract Text</span>
              </button>
            </nav>

            <div className="tab-content">
              {activeTab === 'converter' && (
                <div className="grid workspace-grid">
                  <section className="panel">
                    <h2>Upload + Preview</h2>
                    <label className={`upload-box ${dragActive ? 'drag-active' : ''}`} htmlFor="fileInput" onDragEnter={onDrag} onDragLeave={onDrag} onDragOver={onDrag} onDrop={onDrop}>
                      <span>{dragActive ? '📥 Drop your file here' : '📤 Choose or drag a file (max 25 MB)'}</span>
                      <input id="fileInput" type="file" onChange={onFileChange} ref={fileInputRef} />
                    </label>

                    <div className="meta">
                      <p>
                        <strong>File:</strong> {file ? file.name : 'None selected'}
                      </p>
                      <p>
                        <strong>Detected format:</strong> {ext || 'N/A'}
                      </p>
                    </div>

                    <p className="status">{status}</p>
                    {error ? <p className="error">{error}</p> : null}

                    {isLoadingPreview ? <p className="status">Generating preview...</p> : null}

                    {localPreviewUrl && file ? (
                      <div className="preview-local">
                        {['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) ? (
                          <img src={localPreviewUrl} alt="Local preview" />
                        ) : null}
                        {['mp4', 'webm'].includes(ext) ? <video controls src={localPreviewUrl} /> : null}
                        {['mp3', 'wav'].includes(ext) ? <audio controls src={localPreviewUrl} /> : null}
                      </div>
                    ) : null}

                    {serverPreview ? (
                      <div className="preview-server">
                        <h3>{serverPreview.preview.title}</h3>

                        {serverPreview.preview.kind === 'text' || serverPreview.preview.kind === 'info' ? (
                          <pre>{String(serverPreview.preview.content)}</pre>
                        ) : null}

                        {serverPreview.preview.kind === 'list' ? (
                          <ul>
                            {(serverPreview.preview.content as string[]).map((entry) => (
                              <li key={entry}>{entry}</li>
                            ))}
                          </ul>
                        ) : null}

                        {serverPreview.preview.kind === 'pages' ? (
                          <div>
                            {(serverPreview.preview.content as string[]).map((pageText, pageIndex) => (
                              <pre key={`page-${pageIndex}`}>{pageText}</pre>
                            ))}
                          </div>
                        ) : null}

                        {serverPreview.preview.kind === 'table' ? (
                          <div className="table-wrap">
                            <table>
                              <tbody>
                                {(serverPreview.preview.content as Array<Array<string | number | null>>).map(
                                  (row, rowIndex) => (
                                    <tr key={rowIndex}>
                                      {row.map((cell, colIndex) => (
                                        <td key={`${rowIndex}-${colIndex}`}>{String(cell ?? '')}</td>
                                      ))}
                                    </tr>
                                  )
                                )}
                              </tbody>
                            </table>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </section>

                  <section className="panel">
                    <h2>Convert + Download</h2>
                    <div className="action-row">
                      <button className="ghost-action" onClick={() => clearAll()} disabled={!file && !serverPreview}>
                        Clear All
                      </button>
                    </div>
                    <label className="field" htmlFor="targetFormat">
                      Target format
                      <select
                        id="targetFormat"
                        value={targetFormat}
                        onChange={(event) => setTargetFormat(event.target.value)}
                        disabled={!supportedTargets.length || isConverting}
                      >
                        {supportedTargets.length === 0 ? <option value="">No conversions available</option> : null}
                        {supportedTargets.map((format) => (
                          <option value={format} key={format}>
                            {format.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </label>

                    {isImageConversion ? (
                      <div className="optimization-panel">
                        <h3 style={{ marginTop: '1.5rem', marginBottom: '1rem', color: 'var(--accent)' }}>🎨 Image Optimization</h3>
                        
                        <label className="field" htmlFor="optimizationPreset">
                          <strong>Optimization Preset</strong>
                          <select
                            id="optimizationPreset"
                            value={optimizationPreset}
                            onChange={(event) => setOptimizationPreset(event.target.value as 'balanced' | 'quality' | 'size')}
                          >
                            <option value="balanced">Balanced (Default)</option>
                            <option value="quality">High Quality</option>
                            <option value="size">Small File Size</option>
                          </select>
                          <small style={{ color: 'rgba(255, 255, 255, 0.6)', marginTop: '0.3rem', display: 'block' }}>
                            {optimizationPreset === 'quality' && 'Maximize visual quality with minimal compression'}
                            {optimizationPreset === 'size' && 'Maximize compression for smaller file sizes'}
                            {optimizationPreset === 'balanced' && 'Balance between quality and file size'}
                          </small>
                        </label>

                        <label className="field" htmlFor="imageQuality">
                          <strong>Image Quality: {imageQuality}%</strong>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <input
                              id="imageQuality"
                              type="range"
                              min={20}
                              max={100}
                              step={1}
                              value={imageQuality}
                              onChange={(event) => setImageQuality(Number(event.target.value))}
                              style={{ flex: 1 }}
                            />
                            <span style={{ minWidth: '2rem', textAlign: 'center', fontSize: '0.9rem' }}>
                              {imageQuality > 80 ? '🎯' : imageQuality > 60 ? '✓' : imageQuality > 40 ? '↓' : '📦'}
                            </span>
                          </div>
                          <small style={{ color: 'rgba(255, 255, 255, 0.6)', marginTop: '0.3rem', display: 'block' }}>
                            {imageQuality >= 90 ? 'Highest quality, largest file' : imageQuality >= 75 ? 'High quality, moderate file size' : imageQuality >= 50 ? 'Good balance' : 'Smaller files, lower quality'}
                          </small>
                        </label>

                        <label className="field" htmlFor="compressionLevel">
                          <strong>Compression Level</strong>
                          <select
                            id="compressionLevel"
                            value={compressionLevel}
                            onChange={(event) => setCompressionLevel(event.target.value as 'low' | 'medium' | 'high')}
                          >
                            <option value="low">Low (Faster)</option>
                            <option value="medium">Medium (Default)</option>
                            <option value="high">High (Slower but smaller)</option>
                          </select>
                          <small style={{ color: 'rgba(255, 255, 255, 0.6)', marginTop: '0.3rem', display: 'block' }}>
                            {compressionLevel === 'low' && 'Quick compression with basic size reduction'}
                            {compressionLevel === 'medium' && 'Balanced compression speed and efficiency'}
                            {compressionLevel === 'high' && 'Maximum compression, may take longer'}
                          </small>
                        </label>

                        {originalFileSize > 0 && (
                          <div className="size-info">
                            <div className="size-row">
                              <span className="label">📦 Original Size:</span>
                              <span className="value">{formatFileSize(originalFileSize)}</span>
                            </div>
                            <div className="size-row">
                              <span className="label">📊 Estimated After:</span>
                              <span className="value">{formatFileSize(estimatedCompressedSize)}</span>
                            </div>
                            <div className="compression-bar">
                              <div className="compression-fill" style={{ width: `${Math.min(100, compressionPercentage)}%` }} />
                            </div>
                            <div className="compression-text">
                              💾 {compressionPercentage}% Compression Reduction
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null}

                    <button
                      className="action"
                      onClick={convertFile}
                      disabled={!file || !targetFormat || isConverting}
                    >
                      {isConverting ? 'Converting...' : 'Convert and Download'}
                    </button>

                    <div className="support">
                      <h3>Phase 1 Supported Conversions</h3>
                      {conversionPairs.length ? (
                        <div className="pair-grid">
                          {conversionPairs.map(([source, targets]) => (
                            <p key={source}>
                              <strong>{source.toUpperCase()}</strong> to {targets.map((item) => item.toUpperCase()).join(', ')}
                            </p>
                          ))}
                        </div>
                      ) : (
                        <ul>
                          <li>Loading conversion support map...</li>
                        </ul>
                      )}
                    </div>

                    <div className="support">
                      <h3>Preview Coverage</h3>
                      <ul>
                        <li>Image, audio, and video local preview</li>
                        <li>DOCX, PDF page-by-page extracted text preview</li>
                        <li>XLSX table preview (first sheet)</li>
                        <li>ZIP entries list preview</li>
                      </ul>
                    </div>
                  </section>
                </div>
              )}

              {activeTab === 'merge' && (
                <div className="grid workspace-grid">
                  <section className="panel">
                    <h2>File Merging</h2>
                    <label className="upload-box" htmlFor="mergeInput">
                      <span>Choose multiple files to merge (2 to 20 files)</span>
                      <input
                        id="mergeInput"
                        type="file"
                        multiple
                        ref={mergeInputRef}
                        onChange={(event) => {
                          const selected = Array.from(event.target.files || []);
                          setMergeFiles(selected);
                        }}
                      />
                    </label>

                    <p className="status">Selected files: {mergeFiles.length}</p>
                    <label className="field" htmlFor="mergeMode">
                      Merge mode
                      <select
                        id="mergeMode"
                        value={mergeMode}
                        onChange={(event) =>
                          setMergeMode(event.target.value as 'auto' | 'text' | 'image' | 'pdf')
                        }
                      >
                        <option value="auto">AUTO</option>
                        <option value="text">TEXT</option>
                        <option value="image">IMAGE (VERTICAL)</option>
                        <option value="pdf">PDF</option>
                      </select>
                    </label>

                    <button
                      className="action"
                      onClick={mergeSelectedFiles}
                      disabled={isMerging || mergeFiles.length < 2}
                    >
                      {isMerging ? 'Merging...' : 'Merge and Download'}
                    </button>

                    <p className="status">{mergeStatus}</p>
                  </section>
                </div>
              )}

              {activeTab === 'ocr' && (
                <div className="grid workspace-grid">
                  <section className="panel">
                    <h2>OCR - Extract Text from Images & Scanned PDFs</h2>
                    <label className="upload-box" htmlFor="ocrInput">
                      <span>Upload image or scanned PDF for OCR extraction</span>
                      <input
                        id="ocrInput"
                        type="file"
                        ref={ocrInputRef}
                        onChange={(event) => setOcrFile(event.target.files?.[0] || null)}
                      />
                    </label>

                    <p className="status">OCR file: {ocrFile ? ocrFile.name : 'None selected'}</p>

                    <button className="action" onClick={runOcr} disabled={!ocrFile || isRunningOcr}>
                      {isRunningOcr ? 'Extracting...' : 'Run OCR'}
                    </button>

                    {ocrNote ? <p className="status">{ocrNote}</p> : null}
                    {ocrText ? (
                      <div className="preview-server">
                        <h3>Extracted Text</h3>
                        <pre>{ocrText}</pre>
                      </div>
                    ) : null}
                  </section>
                </div>
              )}
            </div>
          </main>
        </>
      )}

      {/* About Page */}
      {view === 'about' && (
        <>
          <motion.header
            className="info-page-header"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <h1>About FileForge</h1>
            <button className="nav-link" onClick={() => setView('home')}>← Back</button>
          </motion.header>
          <main className="info-page-content">
            <section className="info-card">
              <h2>Our Mission</h2>
              <p>FileForge is dedicated to making file conversion fast, secure, and accessible to everyone. We believe that powerful file transformation tools should be simple to use and free from unnecessary barriers.</p>
            </section>
            <section className="info-card">
              <h2>What We Offer</h2>
              <ul className="info-list">
                <li><strong>14+ Format Support:</strong> Convert between images, documents, spreadsheets, and more</li>
                <li><strong>Instant Preview:</strong> See your files before conversion with our intelligent preview system</li>
                <li><strong>Batch Processing:</strong> Handle multiple files simultaneously for maximum efficiency</li>
                <li><strong>No Sign-ups:</strong> Start converting immediately without creating an account</li>
                <li><strong>Secure Processing:</strong> Your files are processed securely and deleted automatically</li>
              </ul>
            </section>
            <section className="info-card">
              <h2>Technology</h2>
              <p>FileForge is built with modern web technologies including React, TypeScript, and Framer Motion for smooth animations. Our backend uses Node.js to handle robust file processing operations.</p>
            </section>
          </main>
        </>
      )}

      {/* Privacy Policy Page */}
      {view === 'privacy' && (
        <>
          <motion.header
            className="info-page-header"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <h1>Privacy Policy</h1>
            <button className="nav-link" onClick={() => setView('home')}>← Back</button>
          </motion.header>
          <main className="info-page-content">
            <section className="info-card">
              <h2>Data Collection</h2>
              <p>FileForge collects minimal data. We do not store your uploaded files, conversion history, or personal information without your explicit consent.</p>
            </section>
            <section className="info-card">
              <h2>File Processing</h2>
              <ul className="info-list">
                <li>Files are processed temporarily in memory during conversion</li>
                <li>Files are automatically deleted after conversion completion</li>
                <li>We do not create backups of your files</li>
                <li>We do not share your files with third parties</li>
              </ul>
            </section>
            <section className="info-card">
              <h2>Cookies & Tracking</h2>
              <p>We use essential cookies to maintain your session. We do not use tracking cookies or analytics that compromise your privacy.</p>
            </section>
            <section className="info-card">
              <h2>Security</h2>
              <p>All data transmission uses HTTPS encryption. We regularly audit our security practices and stay up-to-date with best practices.</p>
            </section>
          </main>
        </>
      )}

      {/* Terms of Service Page */}
      {view === 'terms' && (
        <>
          <motion.header
            className="info-page-header"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <h1>Terms of Service</h1>
            <button className="nav-link" onClick={() => setView('home')}>← Back</button>
          </motion.header>
          <main className="info-page-content">
            <section className="info-card">
              <h2>Agreement</h2>
              <p>By using FileForge, you agree to these terms and conditions. If you do not agree, please do not use our service.</p>
            </section>
            <section className="info-card">
              <h2>Usage Rights</h2>
              <ul className="info-list">
                <li>You may use FileForge for personal and commercial purposes</li>
                <li>You may not use FileForge to process illegal content</li>
                <li>You may not attempt to disrupt or overload our service</li>
                <li>You retain all rights to your files</li>
              </ul>
            </section>
            <section className="info-card">
              <h2>Limitations</h2>
              <p>FileForge is provided "as-is" without warranties. We are not liable for any data loss or conversion errors. Use at your own risk and maintain backups of important files.</p>
            </section>
            <section className="info-card">
              <h2>Changes</h2>
              <p>We reserve the right to modify these terms at any time. Continued use of FileForge constitutes acceptance of updated terms.</p>
            </section>
          </main>
        </>
      )}

      {/* Contact Page */}
      {view === 'contact' && (
        <>
          <motion.header
            className="info-page-header"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <h1>Contact Us</h1>
            <button className="nav-link" onClick={() => setView('home')}>← Back</button>
          </motion.header>
          <main className="info-page-content">
            <section className="info-card">
              <h2>Get in Touch</h2>
              <p>Have questions, feedback, or need support? We'd love to hear from you. Reach out through any of the channels below.</p>
            </section>
            <section className="info-card">
              <h2>Contact Information</h2>
              <p>For technical support and inquiries, please reach out at:</p>
              <p style={{ fontSize: '1.1rem', color: 'var(--accent)', fontWeight: '600', marginTop: '1rem' }}>support@fileforge.io</p>
            </section>
          </main>
        </>
      )}

      {/* Global Footer */}
      <motion.footer
        className="global-footer"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="footer-content">
          <div className="footer-section">
            <h4>FileForge</h4>
            <p>Lightning-fast file conversion and transformation platform.</p>
          </div>
          <div className="footer-section">
            <h4>Features</h4>
            <ul>
              <li><button className="footer-link" onClick={() => { setView('workspace'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>File Converter</button></li>
              <li><button className="footer-link" onClick={() => { setView('workspace'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Merge Files</button></li>
              <li><button className="footer-link" onClick={() => { setView('workspace'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Extract Text (OCR)</button></li>
              <li><button className="footer-link" onClick={() => { setView('workspace'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Batch Processing</button></li>
            </ul>
          </div>
          <div className="footer-section">
            <h4>Information</h4>
            <ul>
              <li><button className="footer-link" onClick={() => { setView('about'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>About</button></li>
              <li><button className="footer-link" onClick={() => { setView('privacy'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Privacy Policy</button></li>
              <li><button className="footer-link" onClick={() => { setView('terms'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Terms of Service</button></li>
              <li><button className="footer-link" onClick={() => { setView('contact'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Contact</button></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2024 FileForge. All rights reserved.</p>
          <div className="footer-badges">
            <span className="badge">100% Secure</span>
            <span className="badge">No Sign-up</span>
            <span className="badge">Unlimited Files</span>
          </div>
        </div>
      </motion.footer>
    </div>
  );
}
