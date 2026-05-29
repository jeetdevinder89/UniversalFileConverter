import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import './Phase2Tools.css';

type Phase2Tab = 'pdf-tools' | 'archive' | 'batch' | 'utils';

export default function Phase2Tools() {
  const [activeTab, setActiveTab] = useState<Phase2Tab>('pdf-tools');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfStartPage, setPdfStartPage] = useState(1);
  const [pdfEndPage, setPdfEndPage] = useState(1);
  const [archiveFiles, setArchiveFiles] = useState<File[]>([]);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchFormat, setBatchFormat] = useState('pdf');
  const [textInput, setTextInput] = useState('');
  const [textOutput, setTextOutput] = useState('');
  const [textStats, setTextStats] = useState<any>(null);
  const [qrInput, setQrInput] = useState('');
  const [base64Input, setBase64Input] = useState('');
  const [base64Output, setBase64Output] = useState('');
  const [base64Mode, setBase64Mode] = useState<'encode' | 'decode'>('encode');
  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const archiveInputRef = useRef<HTMLInputElement | null>(null);
  const batchInputRef = useRef<HTMLInputElement | null>(null);

  // PDF Tools: Split PDF pages
  const handlePdfSplit = async () => {
    if (!pdfFile) {
      alert('Please upload a PDF file');
      return;
    }
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', pdfFile);
      formData.append('startPage', String(pdfStartPage));
      formData.append('endPage', String(pdfEndPage));

      const response = await fetch('http://localhost:8787/api/pdf/split', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `split_${pdfStartPage}_${pdfEndPage}.pdf`;
        a.click();
        setSuccessMsg('✅ PDF split successfully!');
        setTimeout(() => setSuccessMsg(''), 3000);
      } else {
        const error = await response.json();
        alert('Error: ' + (error.error || 'Failed to split PDF'));
      }
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  // PDF Tools: Compress PDF
  const handlePdfCompress = async () => {
    if (!pdfFile) {
      alert('Please upload a PDF file');
      return;
    }
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', pdfFile);

      const response = await fetch('http://localhost:8787/api/pdf/compress', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'compressed.pdf';
        a.click();
        setSuccessMsg('✅ PDF compressed successfully!');
        setTimeout(() => setSuccessMsg(''), 3000);
      } else {
        const error = await response.json();
        alert('Error: ' + (error.error || 'Failed to compress PDF'));
      }
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  // Archive: Create ZIP
  const handleCreateZip = async () => {
    if (archiveFiles.length === 0) {
      alert('Please select files to archive');
      return;
    }
    setIsLoading(true);
    try {
      const formData = new FormData();
      archiveFiles.forEach((file) => {
        formData.append('files', file);
      });

      const response = await fetch('http://localhost:8787/api/archive/create-zip', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'archive.zip';
        a.click();
        setSuccessMsg('✅ ZIP archive created successfully!');
        setArchiveFiles([]);
        setTimeout(() => setSuccessMsg(''), 3000);
      } else {
        const error = await response.json();
        alert('Error: ' + (error.error || 'Failed to create archive'));
      }
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  // Batch: Convert multiple files
  const handleBatchConvert = async () => {
    if (batchFiles.length === 0) {
      alert('Please select files to convert');
      return;
    }
    if (!batchFormat) {
      alert('Please select target format');
      return;
    }
    setIsLoading(true);
    try {
      const formData = new FormData();
      batchFiles.forEach((file) => {
        formData.append('files', file);
      });
      formData.append('targetFormat', batchFormat);

      const response = await fetch('http://localhost:8787/api/batch/convert', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'batch_converted.zip';
        a.click();
        setSuccessMsg('✅ Batch conversion completed!');
        setBatchFiles([]);
        setTimeout(() => setSuccessMsg(''), 3000);
      } else {
        const error = await response.json();
        alert('Error: ' + (error.error || 'Failed to convert files'));
      }
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  // Utils: Calculate text stats
  const handleTextStats = async () => {
    if (!textInput) {
      alert('Please enter some text');
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:8787/api/utils/text-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: textInput,
      });

      if (response.ok) {
        const stats = await response.json();
        setTextStats(stats);
      } else {
        alert('Failed to calculate stats');
      }
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  // Utils: Base64 encode/decode
  const handleBase64Transform = async () => {
    if (!base64Input) {
      alert('Please enter text');
      return;
    }
    setIsLoading(true);
    try {
      const endpoint = base64Mode === 'encode' ? 'base64-encode' : 'base64-decode';
      const response = await fetch(`http://localhost:8787/api/utils/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: base64Input,
      });

      if (response.ok) {
        const result = await response.json();
        setBase64Output(result.encoded || result.decoded);
      } else {
        alert('Transformation failed');
      }
    } catch (error) {
      alert('Error: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="phase2-container"
    >
      {/* Phase 2 Tab Navigation */}
      <div className="phase2-tabs">
        <button
          onClick={() => setActiveTab('pdf-tools')}
          className={`phase2-tab-btn ${activeTab === 'pdf-tools' ? 'active' : ''}`}
        >
          <span>📄</span>
          <span>PDF Tools</span>
        </button>
        <button
          onClick={() => setActiveTab('archive')}
          className={`phase2-tab-btn ${activeTab === 'archive' ? 'active' : ''}`}
        >
          <span>📦</span>
          <span>Archive</span>
        </button>
        <button
          onClick={() => setActiveTab('batch')}
          className={`phase2-tab-btn ${activeTab === 'batch' ? 'active' : ''}`}
        >
          <span>⚡</span>
          <span>Batch Convert</span>
        </button>
        <button
          onClick={() => setActiveTab('utils')}
          className={`phase2-tab-btn ${activeTab === 'utils' ? 'active' : ''}`}
        >
          <span>🛠️</span>
          <span>Text Tools</span>
        </button>
      </div>

      {successMsg && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="phase2-success"
        >
          {successMsg}
        </motion.div>
      )}

      {/* PDF Tools */}
      {activeTab === 'pdf-tools' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="phase2-content"
        >
          <div className="phase2-panel">
            <h3>📄 PDF Tools</h3>

            <div
              className="phase2-upload-box"
              onClick={() => pdfInputRef.current?.click()}
              style={{ cursor: 'pointer' }}
            >
              <span>
                📁 {pdfFile ? pdfFile.name : 'Click to upload PDF'}
              </span>
            </div>
            <input
              ref={pdfInputRef}
              type="file"
              accept=".pdf"
              onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
              style={{ display: 'none' }}
            />

            {pdfFile && (
              <>
                <div className="phase2-input-group">
                  <h4 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: 'rgba(255, 255, 255, 0.9)' }}>✂️ Split PDF Pages</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                      <label>Start Page</label>
                      <input
                        type="number"
                        min="1"
                        value={pdfStartPage}
                        onChange={(e) => setPdfStartPage(Number(e.target.value))}
                        className="phase2-input"
                      />
                    </div>
                    <div>
                      <label>End Page</label>
                      <input
                        type="number"
                        min="1"
                        value={pdfEndPage}
                        onChange={(e) => setPdfEndPage(Number(e.target.value))}
                        className="phase2-input"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handlePdfSplit}
                    disabled={isLoading}
                    className="phase2-button"
                  >
                    {isLoading ? '⏳ Processing...' : '✂️ Extract Pages'}
                  </button>
                </div>

                <button
                  onClick={handlePdfCompress}
                  disabled={isLoading}
                  className="phase2-button phase2-button-secondary"
                >
                  {isLoading ? '⏳ Compressing...' : '🗜️ Compress PDF'}
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}

      {/* Archive Tools */}
      {activeTab === 'archive' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="phase2-content"
        >
          <div className="phase2-panel">
            <h3>📦 Create ZIP Archive</h3>

            <div
              className="phase2-upload-box"
              onClick={() => archiveInputRef.current?.click()}
              style={{ textAlign: 'center', paddingTop: '2rem', paddingBottom: '2rem', cursor: 'pointer' }}
            >
              <span>
                📁 {archiveFiles.length > 0 ? `${archiveFiles.length} files selected` : 'Click to select files'}
              </span>
            </div>
            <input
              ref={archiveInputRef}
              type="file"
              multiple
              onChange={(e) => setArchiveFiles(Array.from(e.target.files || []))}
              style={{ display: 'none' }}
            />

            {archiveFiles.length > 0 && (
              <>
                <div className="phase2-file-list">
                  {archiveFiles.map((file, i) => (
                    <div key={i} className="phase2-file-item">
                      • {file.name}
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleCreateZip}
                  disabled={isLoading}
                  className="phase2-button"
                >
                  {isLoading ? '⏳ Creating ZIP...' : '📦 Create ZIP Archive'}
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}

      {/* Batch Convert */}
      {activeTab === 'batch' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="phase2-content"
        >
          <div className="phase2-panel">
            <h3>⚡ Batch Convert Files</h3>

            <div
              className="phase2-upload-box"
              onClick={() => batchInputRef.current?.click()}
              style={{ textAlign: 'center', paddingTop: '2rem', paddingBottom: '2rem', cursor: 'pointer' }}
            >
              <span>
                📁 {batchFiles.length > 0 ? `${batchFiles.length} files selected` : 'Click to select files'}
              </span>
            </div>
            <input
              ref={batchInputRef}
              type="file"
              multiple
              onChange={(e) => setBatchFiles(Array.from(e.target.files || []))}
              style={{ display: 'none' }}
            />

            {batchFiles.length > 0 && (
              <>
                <div className="phase2-input-group">
                  <label>Target Format</label>
                  <select
                    value={batchFormat}
                    onChange={(e) => setBatchFormat(e.target.value)}
                    className="phase2-select"
                  >
                    <option value="">Select format...</option>
                    <option value="pdf">PDF</option>
                    <option value="txt">TXT</option>
                    <option value="jpg">JPG</option>
                    <option value="png">PNG</option>
                  </select>
                </div>
                <div className="phase2-file-list">
                  {batchFiles.slice(0, 5).map((file, i) => (
                    <div key={i} className="phase2-file-item">
                      • {file.name}
                    </div>
                  ))}
                  {batchFiles.length > 5 && (
                    <div className="phase2-file-item" style={{ color: 'rgba(255, 255, 255, 0.4)' }}>
                      + {batchFiles.length - 5} more...
                    </div>
                  )}
                </div>
                <button
                  onClick={handleBatchConvert}
                  disabled={isLoading}
                  className="phase2-button"
                >
                  {isLoading ? '⏳ Converting...' : '⚡ Convert All Files'}
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}

      {/* Text Utilities */}
      {activeTab === 'utils' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="phase2-content"
        >
          <div className="phase2-grid">
            {/* Text Stats */}
            <div className="phase2-panel">
              <h4>📊 Text Statistics</h4>
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Enter text here..."
                className="phase2-textarea"
              />
              <button
                onClick={handleTextStats}
                disabled={isLoading}
                className="phase2-button"
              >
                {isLoading ? '⏳ Analyzing...' : '📊 Analyze'}
              </button>
              {textStats && (
                <div className="phase2-info-box">
                  <div>📝 Characters: <strong style={{ color: '#06d6d0' }}>{textStats.characters}</strong></div>
                  <div>📝 Words: <strong style={{ color: '#06d6d0' }}>{textStats.words}</strong></div>
                  <div>📝 Lines: <strong style={{ color: '#06d6d0' }}>{textStats.lines}</strong></div>
                  <div>📝 Avg Word Length: <strong style={{ color: '#06d6d0' }}>{textStats.averageWordLength}</strong></div>
                </div>
              )}
            </div>

            {/* Base64 Transform */}
            <div className="phase2-panel">
              <h4>🔐 Base64</h4>
              <div className="phase2-button-mode-selector">
                <button
                  onClick={() => setBase64Mode('encode')}
                  className={`phase2-button-mode ${base64Mode === 'encode' ? 'active' : ''}`}
                >
                  Encode
                </button>
                <button
                  onClick={() => setBase64Mode('decode')}
                  className={`phase2-button-mode ${base64Mode === 'decode' ? 'active' : ''}`}
                >
                  Decode
                </button>
              </div>
              <textarea
                value={base64Input}
                onChange={(e) => setBase64Input(e.target.value)}
                placeholder={base64Mode === 'encode' ? 'Text to encode...' : 'Base64 to decode...'}
                className="phase2-textarea"
              />
              {base64Output && (
                <textarea
                  value={base64Output}
                  readOnly
                  className="phase2-textarea"
                  style={{ marginTop: '0.8rem', opacity: 0.9 }}
                />
              )}
              <button
                onClick={handleBase64Transform}
                disabled={isLoading}
                className="phase2-button"
                style={{ marginTop: '0.8rem' }}
              >
                {isLoading ? '⏳ Processing...' : '🔐 ' + (base64Mode === 'encode' ? 'Encode' : 'Decode')}
              </button>
            </div>

            {/* QR Code Info */}
            <div className="phase2-panel">
              <h4>📱 QR Code Generator</h4>
              <input
                type="text"
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
                placeholder="Enter text or URL..."
                className="phase2-input"
              />
              {qrInput && (
                <div className="phase2-info-box" style={{ marginTop: '1rem', textAlign: 'center' }}>
                  <div style={{ color: 'rgba(6, 214, 208, 0.9)', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                    📱 QR Code Ready
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.6)' }}>
                    For: {qrInput.substring(0, 40)}{qrInput.length > 40 ? '...' : ''}
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
