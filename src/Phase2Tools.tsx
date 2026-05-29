import { useState, useRef } from 'react';
import { motion } from 'framer-motion';

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

  const tabClass = 'px-4 py-2 rounded-lg font-medium transition-all duration-300';
  const activeTabClass = 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white shadow-lg';
  const inactiveTabClass = 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/50 border border-gray-700';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-6xl mx-auto px-4"
    >
      {/* Phase 2 Tab Navigation */}
      <div className="flex flex-wrap gap-2 mb-8">
        <button
          onClick={() => setActiveTab('pdf-tools')}
          className={`${tabClass} ${activeTab === 'pdf-tools' ? activeTabClass : inactiveTabClass}`}
        >
          📄 PDF Tools
        </button>
        <button
          onClick={() => setActiveTab('archive')}
          className={`${tabClass} ${activeTab === 'archive' ? activeTabClass : inactiveTabClass}`}
        >
          📦 Archive
        </button>
        <button
          onClick={() => setActiveTab('batch')}
          className={`${tabClass} ${activeTab === 'batch' ? activeTabClass : inactiveTabClass}`}
        >
          ⚡ Batch Convert
        </button>
        <button
          onClick={() => setActiveTab('utils')}
          className={`${tabClass} ${activeTab === 'utils' ? activeTabClass : inactiveTabClass}`}
        >
          🛠️ Text Tools
        </button>
      </div>

      {successMsg && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="mb-4 p-3 bg-green-500/20 border border-green-500/50 rounded-lg text-green-300 text-center"
        >
          {successMsg}
        </motion.div>
      )}

      {/* PDF Tools */}
      {activeTab === 'pdf-tools' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6"
        >
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="text-2xl font-bold mb-4 text-cyan-400">🔧 PDF Tools</h3>

            {/* PDF Upload */}
            <div className="mb-6">
              <label
                className="block px-4 py-3 bg-gray-800/50 border-2 border-dashed border-cyan-500/30 rounded-lg cursor-pointer hover:bg-gray-700/50 transition-all"
                onClick={() => pdfInputRef.current?.click()}
              >
                <span className="text-cyan-400 font-medium">
                  📁 {pdfFile ? pdfFile.name : 'Click to upload PDF'}
                </span>
              </label>
              <input
                ref={pdfInputRef}
                type="file"
                accept=".pdf"
                onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                className="hidden"
              />
            </div>

            {pdfFile && (
              <>
                {/* Split PDF */}
                <div className="mb-6 p-4 bg-gray-800/30 rounded-lg border border-gray-700">
                  <h4 className="font-bold mb-3 text-purple-300">✂️ Split PDF Pages</h4>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="text-sm text-gray-400 block mb-1">Start Page</label>
                      <input
                        type="number"
                        min="1"
                        value={pdfStartPage}
                        onChange={(e) => setPdfStartPage(Number(e.target.value))}
                        className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-gray-400 block mb-1">End Page</label>
                      <input
                        type="number"
                        min="1"
                        value={pdfEndPage}
                        onChange={(e) => setPdfEndPage(Number(e.target.value))}
                        className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handlePdfSplit}
                    disabled={isLoading}
                    className="w-full bg-gradient-to-r from-purple-600 to-cyan-500 hover:from-purple-700 hover:to-cyan-600 disabled:opacity-50 px-4 py-2 rounded-lg font-bold text-white transition-all"
                  >
                    {isLoading ? '⏳ Processing...' : '✂️ Extract Pages'}
                  </button>
                </div>

                {/* Compress PDF */}
                <button
                  onClick={handlePdfCompress}
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-cyan-600 to-purple-500 hover:from-cyan-700 hover:to-purple-600 disabled:opacity-50 px-4 py-3 rounded-lg font-bold text-white transition-all"
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
          className="space-y-6"
        >
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="text-2xl font-bold mb-4 text-green-400">📦 Create ZIP Archive</h3>

            {/* Files Upload */}
            <div className="mb-6">
              <label
                className="block px-4 py-6 bg-gray-800/50 border-2 border-dashed border-green-500/30 rounded-lg cursor-pointer hover:bg-gray-700/50 transition-all text-center"
                onClick={() => archiveInputRef.current?.click()}
              >
                <span className="text-green-400 font-medium">
                  📁 {archiveFiles.length > 0 ? `${archiveFiles.length} files selected` : 'Click to select files'}
                </span>
              </label>
              <input
                ref={archiveInputRef}
                type="file"
                multiple
                onChange={(e) => setArchiveFiles(Array.from(e.target.files || []))}
                className="hidden"
              />
            </div>

            {archiveFiles.length > 0 && (
              <>
                <div className="mb-4 max-h-40 overflow-y-auto">
                  <div className="text-sm text-gray-400 mb-2">Selected files:</div>
                  {archiveFiles.map((file, i) => (
                    <div key={i} className="text-xs text-gray-500 py-1">
                      • {file.name}
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleCreateZip}
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-700 hover:to-emerald-600 disabled:opacity-50 px-4 py-3 rounded-lg font-bold text-white transition-all"
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
          className="space-y-6"
        >
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="text-2xl font-bold mb-4 text-yellow-400">⚡ Batch Convert Files</h3>

            {/* Files Upload */}
            <div className="mb-6">
              <label
                className="block px-4 py-6 bg-gray-800/50 border-2 border-dashed border-yellow-500/30 rounded-lg cursor-pointer hover:bg-gray-700/50 transition-all text-center"
                onClick={() => batchInputRef.current?.click()}
              >
                <span className="text-yellow-400 font-medium">
                  📁 {batchFiles.length > 0 ? `${batchFiles.length} files selected` : 'Click to select files'}
                </span>
              </label>
              <input
                ref={batchInputRef}
                type="file"
                multiple
                onChange={(e) => setBatchFiles(Array.from(e.target.files || []))}
                className="hidden"
              />
            </div>

            {batchFiles.length > 0 && (
              <>
                <div className="mb-4">
                  <label className="text-sm text-gray-400 block mb-2">Target Format</label>
                  <select
                    value={batchFormat}
                    onChange={(e) => setBatchFormat(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">Select format...</option>
                    <option value="pdf">PDF</option>
                    <option value="txt">TXT</option>
                    <option value="jpg">JPG</option>
                    <option value="png">PNG</option>
                  </select>
                </div>
                <div className="mb-4 max-h-32 overflow-y-auto">
                  <div className="text-sm text-gray-400 mb-2">Files: ({batchFiles.length})</div>
                  {batchFiles.slice(0, 5).map((file, i) => (
                    <div key={i} className="text-xs text-gray-500 py-1">
                      • {file.name}
                    </div>
                  ))}
                  {batchFiles.length > 5 && (
                    <div className="text-xs text-gray-600">+ {batchFiles.length - 5} more...</div>
                  )}
                </div>
                <button
                  onClick={handleBatchConvert}
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-yellow-600 to-orange-500 hover:from-yellow-700 hover:to-orange-600 disabled:opacity-50 px-4 py-3 rounded-lg font-bold text-white transition-all"
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
          className="space-y-6"
        >
          <div className="grid md:grid-cols-2 gap-6">
            {/* Text Stats */}
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700">
              <h4 className="text-xl font-bold mb-4 text-blue-400">📊 Text Statistics</h4>
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Enter text here..."
                className="w-full h-32 bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white mb-3 resize-none focus:outline-none focus:border-cyan-500"
              />
              <button
                onClick={handleTextStats}
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 disabled:opacity-50 px-4 py-2 rounded-lg font-bold text-white transition-all"
              >
                {isLoading ? '⏳ Analyzing...' : '📊 Analyze'}
              </button>
              {textStats && (
                <div className="mt-3 space-y-1 text-sm text-gray-300">
                  <div>📝 Characters: <span className="text-cyan-400 font-bold">{textStats.characters}</span></div>
                  <div>📝 Words: <span className="text-cyan-400 font-bold">{textStats.words}</span></div>
                  <div>📝 Lines: <span className="text-cyan-400 font-bold">{textStats.lines}</span></div>
                  <div>📝 Avg Word Length: <span className="text-cyan-400 font-bold">{textStats.averageWordLength}</span></div>
                </div>
              )}
            </div>

            {/* Base64 Transform */}
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700">
              <h4 className="text-xl font-bold mb-4 text-orange-400">🔐 Base64</h4>
              <div className="mb-3 flex gap-2">
                <button
                  onClick={() => setBase64Mode('encode')}
                  className={`flex-1 px-3 py-1 rounded text-sm font-medium transition-all ${
                    base64Mode === 'encode'
                      ? 'bg-orange-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Encode
                </button>
                <button
                  onClick={() => setBase64Mode('decode')}
                  className={`flex-1 px-3 py-1 rounded text-sm font-medium transition-all ${
                    base64Mode === 'decode'
                      ? 'bg-orange-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Decode
                </button>
              </div>
              <textarea
                value={base64Input}
                onChange={(e) => setBase64Input(e.target.value)}
                placeholder={base64Mode === 'encode' ? 'Text to encode...' : 'Base64 to decode...'}
                className="w-full h-20 bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white mb-2 resize-none focus:outline-none focus:border-orange-500"
              />
              {base64Output && (
                <textarea
                  value={base64Output}
                  readOnly
                  className="w-full h-20 bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white mb-2 resize-none focus:outline-none"
                />
              )}
              <button
                onClick={handleBase64Transform}
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-orange-600 to-red-500 hover:from-orange-700 hover:to-red-600 disabled:opacity-50 px-4 py-2 rounded-lg font-bold text-white transition-all text-sm"
              >
                {isLoading ? '⏳ Processing...' : '🔐 ' + (base64Mode === 'encode' ? 'Encode' : 'Decode')}
              </button>
            </div>

            {/* QR Code Generator */}
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700">
              <h4 className="text-xl font-bold mb-4 text-green-400">📱 QR Code Info</h4>
              <input
                type="text"
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
                placeholder="Enter text or URL..."
                className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white mb-3 focus:outline-none focus:border-green-500"
              />
              {qrInput && (
                <div className="bg-gray-900 p-4 rounded text-center">
                  <div className="text-sm text-gray-400">📱 QR Code Ready</div>
                  <div className="text-xs text-gray-500 mt-2">Generated QR code for: {qrInput}</div>
                  <div className="mt-3 p-3 bg-white rounded inline-block">
                    <div className="text-xs font-mono text-black break-all">{qrInput.substring(0, 30)}{qrInput.length > 30 ? '...' : ''}</div>
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
