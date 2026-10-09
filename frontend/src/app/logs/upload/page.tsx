'use client';

import React, { useState, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { logsApi } from '@/lib/api';
import {
  Upload, FileText, AlertCircle, CheckCircle, Info,
  ArrowLeft, X, RotateCcw, Brain, ArrowRight,
} from 'lucide-react';
import Link from 'next/link';

interface UploadResult {
  batch_id: string;
  filename: string;
  total_records: number;
  logs_stored: number;
  anomalies_detected: number;
  alerts_created: number;
  model_available: boolean;
  parse_errors: string[];
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');

  const handleFile = (f: File) => {
    const allowed = ['.csv', '.json', '.txt', '.log'];
    const ext = '.' + f.name.split('.').pop()?.toLowerCase();
    if (!allowed.includes(ext)) {
      setError(`Unsupported file type: ${ext}. Allowed: ${allowed.join(', ')}`);
      return;
    }
    setFile(f);
    setError('');
    setResult(null);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError('');
    const input = document.getElementById('file-input') as HTMLInputElement | null;
    if (input) input.value = '';
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    setResult(null);
    try {
      const res = await logsApi.upload(file);
      setResult(res.data);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail) || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-2xl space-y-6 pb-12">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/logs"
              className="w-9 h-9 rounded-lg bg-gray-900 border border-gray-800 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
              title="Back to Logs"
            >
              <ArrowLeft size={16} />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Upload Log File</h1>
              <p className="text-gray-400 text-sm mt-0.5">
                Supported formats: CSV, JSON, TXT, LOG • Max 50MB
              </p>
            </div>
          </div>

          {(file || result) && (
            <button
              onClick={handleReset}
              className="btn btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 text-gray-300 hover:text-white border-gray-700"
              title="Clear selection and reset"
            >
              <RotateCcw size={13} />
              <span>Clear / Reset</span>
            </button>
          )}
        </div>

        {/* Sample dataset notice */}
        <div className="flex items-start gap-2.5 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-sm text-blue-300">
          <Info size={18} className="shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-white">Sample Datasets:</span> You can use{' '}
            <code className="font-mono bg-blue-500/20 px-1.5 py-0.5 rounded text-blue-200 text-xs">
              data/normal_logs.csv
            </code>{' '}
            or{' '}
            <code className="font-mono bg-blue-500/20 px-1.5 py-0.5 rounded text-blue-200 text-xs">
              data/anomalous_logs.csv
            </code>{' '}
            from the project directory for rapid testing.
          </div>
        </div>

        {/* Drop zone */}
        {!result ? (
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer relative ${
              dragging
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-gray-800 hover:border-gray-700 bg-gray-900/30'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <input
              id="file-input"
              type="file"
              accept=".csv,.json,.txt,.log"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />

            {file ? (
              <div className="flex flex-col items-center">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-3">
                  <FileText size={24} />
                </div>
                <div className="text-white font-semibold text-base flex items-center gap-2">
                  <span>{file.name}</span>
                </div>
                <div className="text-gray-400 text-xs mt-1">
                  {(file.size / 1024).toFixed(1)} KB • Ready for analysis
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReset();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-medium flex items-center gap-1.5 transition-colors"
                  >
                    <X size={13} />
                    <span>Remove file</span>
                  </button>
                  <span className="text-xs text-gray-500">or click box to replace</span>
                </div>
              </div>
            ) : (
              <div className="py-4">
                <Upload
                  size={36}
                  className={`mx-auto mb-3 transition-transform ${
                    dragging ? 'text-blue-400 scale-110' : 'text-gray-600'
                  }`}
                />
                <div className="text-gray-200 font-medium text-sm">
                  Drag and drop your security log file here
                </div>
                <div className="text-gray-500 text-xs mt-1">or click to browse from device</div>
              </div>
            )}
          </div>
        ) : null}

        {/* Error message */}
        {error && (
          <div className="flex items-start gap-2.5 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <span className="font-semibold block">Upload Failed</span>
              <span className="text-xs text-red-300 mt-0.5 block">{error}</span>
            </div>
          </div>
        )}

        {/* Action button before upload */}
        {file && !result && (
          <div className="flex gap-3">
            <button
              onClick={handleReset}
              className="btn btn-secondary px-4 py-3 text-xs flex items-center gap-1.5 text-gray-400 hover:text-white"
            >
              <X size={15} />
              <span>Cancel</span>
            </button>
            <button
              id="upload-btn"
              onClick={handleUpload}
              disabled={uploading}
              className="btn btn-primary flex-1 justify-center py-3 text-sm font-semibold shadow-xs"
            >
              {uploading ? (
                <>
                  <span className="spinner" />
                  <span>Processing logs through ML pipeline...</span>
                </>
              ) : (
                <>
                  <Upload size={16} />
                  <span>Upload & Analyze Logs</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Upload Result Card */}
        {result && (
          <div className="card p-6 border-green-500/30 bg-gray-900/50 space-y-5">
            <div className="flex items-center justify-between border-b border-gray-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-400">
                  <CheckCircle size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Log Ingestion & Parsing Complete</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    File: <span className="font-mono text-gray-200">{result.filename}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={handleReset}
                className="btn btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 text-gray-300 hover:text-white border-gray-700"
              >
                <RotateCcw size={13} />
                <span>Upload Another</span>
              </button>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Records Parsed', value: result.total_records, color: 'text-blue-400' },
                { label: 'Logs Stored', value: result.logs_stored, color: 'text-cyan-400' },
                { label: 'Anomalies Detected', value: result.anomalies_detected, color: 'text-amber-400' },
                { label: 'Alerts Created', value: result.alerts_created, color: 'text-red-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="p-3.5 rounded-xl bg-gray-950/70 border border-gray-800/80">
                  <div className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">
                    {label}
                  </div>
                  <div className={`text-2xl font-extrabold mt-1.5 font-mono ${color}`}>{value}</div>
                </div>
              ))}
            </div>

            {/* Model Status Warning & Actionable Link */}
            {!result.model_available && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Brain size={18} className="text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-amber-200 block text-sm">
                      ML Detection Engine is not yet trained
                    </span>
                    <span className="text-amber-300/80 mt-0.5 block">
                      Logs were successfully parsed and saved into MongoDB, but unsupervised anomaly scoring is inactive until an Isolation Forest model baseline is fitted.
                    </span>
                  </div>
                </div>
                <Link
                  href="/models"
                  className="btn btn-primary bg-amber-600 hover:bg-amber-500 border-none text-white text-xs px-3.5 py-2 shrink-0 flex items-center gap-1.5 font-semibold"
                >
                  <span>Train Model Now</span>
                  <ArrowRight size={13} />
                </Link>
              </div>
            )}

            {/* Parse Warnings */}
            {result.parse_errors.length > 0 && (
              <div className="p-3 rounded-xl bg-gray-950/60 border border-gray-800">
                <div className="text-xs text-gray-400 font-semibold mb-2 flex items-center gap-1.5">
                  <AlertCircle size={14} className="text-amber-400" />
                  <span>Parse Warnings ({result.parse_errors.length})</span>
                </div>
                <div className="text-xs font-mono text-gray-500 max-h-24 overflow-y-auto space-y-1">
                  {result.parse_errors.map((e, i) => (
                    <div key={i} className="truncate">
                      • {e}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Post-Upload Navigation Links */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={handleReset}
                className="btn btn-secondary flex-1 justify-center py-2.5 text-xs font-semibold flex items-center gap-2 border-gray-700"
              >
                <RotateCcw size={14} />
                <span>Upload Another File</span>
              </button>
              <Link href="/logs" className="btn btn-secondary flex-1 justify-center py-2.5 text-xs font-semibold">
                View All Logs
              </Link>
              <Link href="/anomalies" className="btn btn-primary flex-1 justify-center py-2.5 text-xs font-semibold">
                View Anomalies
              </Link>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
