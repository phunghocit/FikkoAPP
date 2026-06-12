import { useState, useEffect, FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Lock, 
  Unlock, 
  Copy, 
  Check, 
  AlertTriangle, 
  RefreshCw, 
  ShieldCheck, 
  ShieldAlert
} from 'lucide-react';

interface IPCheckResponse {
  success: boolean;
  allowed: boolean;
  clientIp?: string;
  allowedIpValue?: string;
  appsheetUrl?: string;
  msg?: string;
  error?: string;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<IPCheckResponse | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // Sign-in states for Admin Bypass
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isBypassed, setIsBypassed] = useState(false);

  const checkAccess = async (retryMode = false) => {
    if (retryMode) {
      setIsRetrying(true);
      setErrorText(null);
    } else {
      setLoading(true);
    }

    try {
      // Step 1: Detect the real public network WAN IPv4 first using ipify API
      let publicIp = "";
      try {
        const ipifyRes = await fetch("https://api.ipify.org?format=json");
        if (ipifyRes.ok) {
          const ipifyData = await ipifyRes.json();
          if (ipifyData && ipifyData.ip) {
            publicIp = ipifyData.ip;
          }
        }
      } catch (ipifyErr) {
        console.warn("Không thể lấy IP mạng từ ipify client-side. Hệ thống sẽ tự động chuyển sang cơ chế phát hiện từ server:", ipifyErr);
      }

      // Step 2: Query security gateway with client_ip if detected
      const apiUrl = publicIp ? `/api/check-ip?client_ip=${encodeURIComponent(publicIp)}` : "/api/check-ip";
      const res = await fetch(apiUrl);
      if (!res.ok) {
        throw new Error(`Cổng bảo mật phản hồi lỗi hệ thống (HTTP ${res.status})`);
      }
      const data: IPCheckResponse = await res.json();
      setResult(data);
      
      if (!data.success && data.error) {
        setErrorText(data.error);
      }
    } catch (err: any) {
      console.error(err);
      setErrorText(err.message || "Không thể kết nối đến máy chủ xác minh bảo mật.");
      setResult({
        success: false,
        allowed: false,
        error: err.message
      });
    } finally {
      setLoading(false);
      setIsRetrying(false);
    }
  };

  useEffect(() => {
    checkAccess();
  }, []);

  // Periodic network health / IP verification heartbeat
  useEffect(() => {
    // Only monitor if the user gained access purely through workplace IP matching (not Admin bypass)
    if (!result?.allowed || isBypassed) return;

    const intervalId = setInterval(async () => {
      try {
        let currentIp = "";
        try {
          const ipifyRes = await fetch("https://api.ipify.org?format=json");
          if (ipifyRes.ok) {
            const ipifyData = await ipifyRes.json();
            if (ipifyData && ipifyData.ip) {
              currentIp = ipifyData.ip;
            }
          }
        } catch (_) {
          // If public endpoint is blocked, the server checks the network headers anyway
        }

        const apiUrl = currentIp ? `/api/check-ip?client_ip=${encodeURIComponent(currentIp)}` : "/api/check-ip";
        const res = await fetch(apiUrl);
        if (res.ok) {
          const data = await res.json();
          // If the office IP is no longer present or valid, immediately strip access and lock the gateway
          if (!data.allowed) {
            console.warn("[CỔNG BẢO MẬT] Thiết bị vừa di chuyển ra ngoài phạm vi IP cho phép! Hủy quyền truy cập.");
            setResult(data);
          }
        }
      } catch (err) {
        console.error("Lỗi xác thực IP ngầm định:", err);
      }
    }, 45000); // Verify once every 45 seconds

    return () => clearInterval(intervalId);
  }, [result?.allowed, isBypassed]);

  const handleCopyIp = () => {
    if (result?.clientIp) {
      navigator.clipboard.writeText(result.clientIp);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRetry = () => {
    setIsBypassed(false);
    checkAccess(true);
  };

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setLoginError("Vui lòng điền đầy đủ tài khoản và mật khẩu.");
      return;
    }
    setLoginError(null);
    setIsLoggingIn(true);

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password })
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Không thể đăng nhập vào hệ thống.");
      }

      // Automatically bypass security check with allowed appsheet link!
      setResult({
        success: true,
        allowed: true,
        appsheetUrl: data.appsheetUrl,
        clientIp: result?.clientIp || "ADMIN_BYPASS",
        msg: data.msg
      });
      setIsBypassed(true);
    } catch (err: any) {
      console.error(err);
      setLoginError(err.message || "Tài khoản hoặc mật khẩu không chính xác.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  // IF ALLOWED: Instantly render the FULL-SCREEN embedded appsheet iframe with absolutely zero wrapper footprint, headers or panels!
  if (!loading && result?.allowed && result?.appsheetUrl) {
    return (
      <iframe
        src={result.appsheetUrl}
        title="AppSheet Application"
        className="w-screen h-screen border-0"
        allow="geolocation; microphone; camera; midi; encrypted-media;"
        referrerPolicy="no-referrer"
        id="appsheet-iframe"
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 flex flex-col font-sans overflow-x-hidden relative antialiased selection:bg-indigo-500/30 selection:text-indigo-200" id="main-wrapper">
      {/* Background Mesh Gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[20%] right-[10%] w-[30%] h-[40%] bg-purple-600/10 rounded-full blur-[100px] pointer-events-none" />

      <AnimatePresence mode="wait">
        {/* Loading Screen */}
        {loading && (
          <motion.div
            key="loading-screen"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex-1 flex flex-col items-center justify-center p-6 z-10 overflow-hidden relative"
            id="loading-container"
          >
            <div className="relative text-center flex flex-col items-center max-w-md w-full bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[32px] p-8 md:p-10 shadow-2xl shadow-indigo-950/20" id="loading-card">
              <div className="relative w-20 h-20 mb-6 flex items-center justify-center">
                <motion.div 
                   className="absolute inset-0 rounded-full border border-indigo-500/25 animate-ping"
                />
                <div className="w-12 h-12 rounded-full bg-slate-900/80 border border-indigo-500/30 flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                  <Lock className="w-5 h-5 text-indigo-400 animate-pulse" />
                </div>
              </div>

              <h1 className="text-xl font-extrabold text-white mb-2 tracking-tight uppercase">
                Đang Xác Thực Quyền...
              </h1>
              <p className="text-slate-400 text-sm mb-4 max-w-xs mx-auto leading-relaxed">
                Đang so khớp dữ liệu bảo mật IP của thiết bị với cổng hệ thống...
              </p>
            </div>
          </motion.div>
        )}

        {/* Access Denied: Screen for unauthorized IPs or setup errors with login form */}
        {!loading && !result?.allowed && (
          <motion.div
            key="denied-screen"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 relative z-10"
            id="denied-container"
          >
            <div className="max-w-md w-full bg-slate-950/40 backdrop-blur-2xl border border-white/10 rounded-[32px] p-6 md:p-8 shadow-2xl shadow-black/40 text-center" id="denied-card">
              
              {/* Header Icon & Branding */}
              <div className="flex flex-col items-center pb-5 mb-5 border-b border-white/10" id="denied-header">
                <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-5 shadow-[0_0_20px_rgba(239,68,68,0.15)]">
                  <ShieldAlert className="w-8 h-8 text-rose-500 animate-pulse" />
                </div>
                <div className="px-3 py-1 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-full text-[10px] font-bold uppercase tracking-widest inline-block mb-3.5">
                  TRUY CẬP BỊ TỪ CHỐI
                </div>
                
                {/* Clean user failure message */}
                <h1 className="text-lg md:text-xl font-extrabold tracking-normal text-white px-2 leading-relaxed font-sans" id="denied-main-msg">
                  Bạn chỉ có thể truy cập khi làm việc tại nơi làm việc
                </h1>
              </div>

              {/* Core IP display box */}
              <div className="bg-white/5 rounded-2xl p-4 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between mb-5 gap-3" id="ip-info-box">
                <div className="space-y-0.5 text-left">
                  <span className="text-[9px] font-bold uppercase text-slate-500 tracking-widest font-mono">
                    IP mạng hiện tại
                  </span>
                  <div className="text-lg font-mono font-extrabold text-white tracking-tight" id="visitor-ip">
                    {result?.clientIp || "0.0.0.0"}
                  </div>
                </div>
                <button
                  onClick={handleCopyIp}
                  disabled={!result?.clientIp}
                  className="flex items-center justify-center space-x-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 font-bold py-2 px-3.5 rounded-xl border border-indigo-500/20 transition-all text-xs cursor-pointer active:scale-95 disabled:opacity-50"
                  id="copy-ip-btn"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Đã chép!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Sao chép IP</span>
                    </>
                  )}
                </button>
              </div>

              {/* Admin login Bypass section */}
              <div className="border border-white/10 bg-slate-900/50 rounded-2xl p-4 mb-5 text-left" id="admin-login-bypass">
                <div className="flex items-center space-x-2 mb-3">
                  <Unlock className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-bold text-slate-300 tracking-wide uppercase">Cổng xác thực Quản trị viên</span>
                </div>

                <form onSubmit={handleLoginSubmit} className="space-y-3">
                  <div>
                    <input
                      type="text"
                      placeholder="Tài khoản Admin"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full bg-slate-950/80 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all"
                      id="bypass-username"
                      disabled={isLoggingIn}
                    />
                  </div>
                  <div>
                    <input
                      type="password"
                      placeholder="Mật khẩu"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-slate-950/80 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all"
                      id="bypass-password"
                      disabled={isLoggingIn}
                    />
                  </div>

                  {loginError && (
                    <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2 flex items-start space-x-1.5 font-sans">
                      <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                      <span>{loginError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isLoggingIn}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl shadow-lg shadow-indigo-600/15 transition-all text-xs flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
                    id="login-btn"
                  >
                    {isLoggingIn ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Đang xác thực...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Đăng nhập Bypass</span>
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Main Action Buttons */}
              <div className="flex items-center justify-center" id="actions-panel">
                <button
                  onClick={handleRetry}
                  disabled={isRetrying}
                  className="w-full bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 font-bold py-3 px-6 rounded-xl transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 active:scale-95 text-xs uppercase tracking-wider"
                  id="retry-connection-btn"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? "animate-spin" : ""}`} />
                  <span>{isRetrying ? "Đang thử lại..." : "Thử lại kết nối IP"}</span>
                </button>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
