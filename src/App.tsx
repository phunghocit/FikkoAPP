import React, { useState } from 'react';
import { AlertCircle, Sparkles, Layers } from 'lucide-react';

export default function App() {
  // Helper to resolve URL from build-time env or query param
  const getInitialUrl = (): string => {
    const params = new URLSearchParams(window.location.search);
    const queryUrl = params.get('url');
    if (queryUrl) return queryUrl;

    return (
      import.meta.env.VITE_APPSCRIPT_URL ||
      (import.meta.env as any).APPSCRIPT_URL ||
      (import.meta.env as any).SCRIPT_URL ||
      ''
    );
  };

  const [url, setUrl] = useState<string>(getInitialUrl());
  const [inputUrl, setInputUrl] = useState<string>('');

  const handleCustomUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputUrl.trim()) {
      let formattedUrl = inputUrl.trim();
      if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
        formattedUrl = `https://${formattedUrl}`;
      }
      setUrl(formattedUrl);
    }
  };

  // If no URL is set, show configuration screen
  if (!url) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 antialiased selection:bg-indigo-500/30 selection:text-indigo-200">
        {/* Decorative Background Elements */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-lg w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
              <Layers className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-100">Apps Script Iframe Wrapper</h1>
              <p className="text-xs text-slate-400">Trình nhúng ứng dụng Google Apps Script Web App</p>
            </div>
          </div>

          <div className="space-y-4 mb-6 text-sm text-slate-300">
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-0.5">Chưa có liên kết Apps Script</p>
                <p className="text-amber-300/80">
                  Vui lòng thêm biến <code className="bg-slate-800 px-1.5 py-0.5 rounded text-amber-200 font-mono text-[11px]">VITE_APPSCRIPT_URL</code> vào file <code className="bg-slate-800 px-1.5 py-0.5 rounded text-amber-200 font-mono text-[11px]">.env</code> hoặc phần Environment Variables trên Git/Platform.
                </p>
              </div>
            </div>

            <form onSubmit={handleCustomUrlSubmit} className="space-y-3">
              <label className="block text-xs font-medium text-slate-300">
                Nhập liên kết Web App (dạng script.google.com):
              </label>
              <input
                type="url"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                required
              />
              <button
                type="submit"
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Mở ứng dụng Apps Script
              </button>
            </form>
          </div>

          <div className="border-t border-slate-800/80 pt-4 text-xs text-slate-500 text-center">
            FikkoAPP &bull; Apps Script High-Performance Iframe Shell
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen overflow-hidden bg-slate-950">
      <iframe
        src={url}
        title="Google Apps Script Application"
        className="w-full h-full border-0 block"
        allow="geolocation; microphone; camera; midi; encrypted-media; clipboard-write; display-capture;"
        sandbox="allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-top-navigation allow-downloads"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}