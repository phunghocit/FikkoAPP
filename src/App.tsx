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
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  Layers,
  LogOut,
  ExternalLink
} from 'lucide-react';

interface IPCheckResponse {
  success: boolean;
  allowed: boolean;
  clientIp?: string;
  allowedIpValue?: string;
  appsheetUrl?: string;
  projects?: { name: string; url: string }[];
  msg?: string;
  error?: string;
}

// Helper function to normalize Vietnamese characters for matching column headers and values
const cleanString = (str: string): string => {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .trim()
    .replace(/\s+/g, ' ');
};

// Client-side fallback to read Google Sheets directly (useful for static deploys like Vercel)
async function performClientSideCheck(clientIp: string): Promise<IPCheckResponse> {
  const spreadsheetId = import.meta.env.VITE_SPREADSHEET_ID || "1LI8edTRUQZNqyVxUtD0fj_ZaarcalHoEvrdfa3D7PdI";
  const ipSheetName = import.meta.env.VITE_IP_SHEET_NAME || "IP";
  const gvizUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(ipSheetName)}`;

  try {
    const response = await fetch(gvizUrl);
    if (!response.ok) {
      throw new Error(`Google Sheets trả về lỗi mạng (HTTP ${response.status})`);
    }
    const rawText = await response.text();
    const match = rawText.match(/google\.visualization\.Query\.setResponse\(([\s\S\w\W]*)\);/);
    if (!match) {
      throw new Error("Không thể phân tách dữ liệu cấu hình từ Google Sheets. Hãy kiểm tra quyền chia sẻ 'Bất kỳ ai có liên kết đều có thể Xem'.");
    }

    const json = JSON.parse(match[1]);
    if (json.status === "error") {
      const errorDetail = json.errors?.[0]?.detailed_message || 'Lỗi không xác định';
      throw new Error(`Google Sheet báo lỗi: ${errorDetail}`);
    }

    const table = json.table;
    if (!table || !table.rows || table.rows.length === 0) {
      throw new Error("Không có hàng dữ liệu nào được cấu hình trong bảng tính.");
    }

    // Read all IPs from column A and projects from column B & C
    const allowedIps: string[] = [];
    const projects: { name: string; url: string }[] = [];
    for (let i = 0; i < table.rows.length; i++) {
      const row = table.rows[i];
      if (!row || !row.c) continue;

      const ipVal = row.c[0]?.v ? String(row.c[0].v).trim() : '';
      if (ipVal && ipVal !== '*' && ipVal !== 'IP') {  // Skip header or empty
        allowedIps.push(ipVal);
      }

      if (i > 0) {
        const urlVal = row.c[1]?.v ? String(row.c[1].v).trim() : '';
        if (urlVal) {
          const nameVal = row.c[2]?.v ? String(row.c[2].v).trim() : `Dự án ${projects.length + 1}`;
          projects.push({ name: nameVal, url: urlVal });
        }
      }
    }

    if (import.meta.env.DEV && projects.length === 1) {
      projects.push({ name: "Dự án Mock 2 (Local Demo)", url: "https://example.com" });
    }
    const defaultProj = projects.find(p => p.name.toLowerCase().includes('fikko-app') || p.name.toLowerCase().includes('fikko app') || p.url.includes('AKfycbww')) || projects[0];
    const appsheetUrl = defaultProj?.url || '';

    if (allowedIps.length === 0) {
      throw new Error("Không lấy được danh sách địa chỉ IP an toàn ở cột A của sheet IP.");
    }
    if (projects.length === 0) {
      throw new Error("Không lấy được liên kết dự án nào trong cột B của sheet IP.");
    }

    // Check if client IP is in allowed list or wildcard
    const isAllowed = allowedIps.includes(clientIp) || allowedIps.includes("*");

    if (isAllowed) {
      return {
        success: true,
        allowed: true,
        clientIp,
        allowedIpValue: allowedIps.join(", "),
        appsheetUrl,
        projects
      };
    } else {
      return {
        success: true,
        allowed: false,
        clientIp,
        allowedIpValue: allowedIps.join(", "),
        msg: "Bạn chỉ có thể truy cập khi làm việc tại nơi làm việc"
      };
    }
  } catch (err: any) {
    console.error("[Fallback Client Check] Thất bại:", err);
    return {
      success: false,
      allowed: false,
      clientIp,
      error: err.message || "Bị từ chối quyền truy cập trực tiếp."
    };
  }
}

// SHA-256 helper for client-side password verification
async function sha256Hex(message: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    return '';
  }
}

// Client-side fallback to authenticate admin credentials directly
async function performClientSideLogin(usernameInput: string, passwordInput: string): Promise<any> {
  const spreadsheetId = import.meta.env.VITE_SPREADSHEET_ID || "1LI8edTRUQZNqyVxUtD0fj_ZaarcalHoEvrdfa3D7PdI";
  const sheetName = import.meta.env.VITE_SHEET_NAME || "HeThong_TaiKhoan";
  const gvizUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json&headers=1&sheet=${encodeURIComponent(sheetName)}`;

  try {
    const response = await fetch(gvizUrl);
    if (!response.ok) {
      throw new Error(`Google Sheets trả về mã lỗi mạng (HTTP ${response.status})`);
    }
    const rawText = await response.text();
    const match = rawText.match(/google\.visualization\.Query\.setResponse\(([\s\S\w\W]*)\);/);
    if (!match) {
      throw new Error("Không thể đọc danh sách tài khoản từ Google Sheets.");
    }

    const json = JSON.parse(match[1]);
    if (json.status === "error") {
      const errorDetail = json.errors?.[0]?.detailed_message || 'Lỗi không xác định';
      throw new Error(`Google Sheet báo lỗi: ${errorDetail}`);
    }

    const table = json.table;
    if (!table || !table.rows || table.rows.length === 0) {
      throw new Error("Không có bất kỳ tài khoản nào được đăng ký trong bảng tính.");
    }

    // Default columns matching HeThong_TaiKhoan layout (A: Tên đăng nhập, B: Mật khẩu, C: Họ tên, D: Vai trò)
    const colIndices = {
      id: 0,
      username: 0,
      password: 1,
      name: 2,
      role: 3,
      appsheet: 9
    };

    const row0 = table.rows[0];
    let hasHeader = false;

    if (row0 && row0.c) {
      row0.c.forEach((cell: any, idx: number) => {
        const val = cell?.v ? cleanString(String(cell.v)) : '';
        if (val === 'id') {
          colIndices.id = idx;
          hasHeader = true;
        } else if (val.includes('ten dang nhap') || val.includes('dang nhap') || val.includes('tai khoan') || val === 'username' || val === 'user') {
          colIndices.username = idx;
          hasHeader = true;
        } else if (val.includes('mat khau') || val === 'password' || val === 'pass') {
          colIndices.password = idx;
          hasHeader = true;
        } else if (val === 'role' || val.includes('vai tro') || val.includes('chuc vu') || val.includes('quyen')) {
          colIndices.role = idx;
          hasHeader = true;
        } else if (val === 'ten' || val === 'name' || val.includes('ho ten')) {
          colIndices.name = idx;
          hasHeader = true;
        } else if (val.includes('appsheet') || val.includes('link') || val.includes('url')) {
          colIndices.appsheet = idx;
        }
      });
    }

    const startIndex = hasHeader ? 1 : 0;
    let authenticatedUser = null;

    const defaultAppsheetUrlRaw = table.rows[0]?.c?.[9];
    const defaultAppsheetUrl = defaultAppsheetUrlRaw?.v ? String(defaultAppsheetUrlRaw.v).trim() : '';

    const passHash = await sha256Hex(passwordInput.trim());

    for (let i = startIndex; i < table.rows.length; i++) {
      const row = table.rows[i];
      if (!row || !row.c) continue;

      const uValRaw = row.c[colIndices.username];
      const pValRaw = row.c[colIndices.password];
      const rValRaw = row.c[colIndices.role];
      const nValRaw = row.c[colIndices.name];
      const appUrlRaw = row.c[colIndices.appsheet];

      const uVal = uValRaw?.v ? String(uValRaw.v).trim() : '';
      const pVal = pValRaw?.v ? String(pValRaw.v).trim() : '';
      const rVal = rValRaw?.v ? String(rValRaw.v).trim() : '';
      const nVal = nValRaw?.v ? String(nValRaw.v).trim() : '';
      const appUrl = appUrlRaw?.v ? String(appUrlRaw.v).trim() : '';

      const userMatch = uVal.toLowerCase() === usernameInput.trim().toLowerCase();
      const passMatch = (!pVal) || 
                        pVal === passwordInput.trim() || 
                        pVal.toLowerCase() === passwordInput.trim().toLowerCase() || 
                        (passHash && pVal.toLowerCase() === passHash.toLowerCase());

      if (userMatch && passMatch) {
        const roleClean = cleanString(rVal);
        const isAdminRole = roleClean === 'admin' || roleClean.includes('admin') || roleClean.includes('quan tri') || roleClean.includes('administrator');
        authenticatedUser = {
          id: row.c[colIndices.id]?.v ? String(row.c[colIndices.id].v).trim() : '',
          username: uVal,
          role: roleClean,
          isAdmin: isAdminRole,
          rawRole: rVal,
          name: nVal || uVal,
          appsheetUrl: appUrl || defaultAppsheetUrl
        };
        break;
      }
    }

    if (!authenticatedUser) {
      console.warn(`[Client Login Fallback] Không tìm thấy tài khoản hợp lệ cho: "${usernameInput}"`);
      return { success: false, error: "Tài khoản hoặc mật khẩu không chính xác." };
    }

    if (!authenticatedUser.isAdmin) {
      console.warn(`[Client Login Fallback] Tài khoản ${authenticatedUser.username} với vai trò "${authenticatedUser.rawRole}" không được cấp quyền Admin.`);
      return { success: false, error: "Chỉ có tài khoản thuộc nhóm Quản trị viên (Admin) mới được phép truy cập." };
    }

    // Fetch Projects from IP sheet, not from "Tài khoản" sheet
    const ipSheetNameVar = import.meta.env.VITE_IP_SHEET_NAME || "IP";
    const ipSheetGvizUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(ipSheetNameVar)}`;

    let appsheetUrl = '';
    const projects: { name: string; url: string }[] = [];
    try {
      const ipSheetResponse = await fetch(ipSheetGvizUrl);
      if (ipSheetResponse.ok) {
        const ipSheetRawText = await ipSheetResponse.text();
        const ipSheetMatch = ipSheetRawText.match(/google\.visualization\.Query\.setResponse\(([\s\S\w\W]*)\);/);
        if (ipSheetMatch) {
          const ipSheetJson = JSON.parse(ipSheetMatch[1]);
          if (ipSheetJson.table && ipSheetJson.table.rows) {
            const rows = ipSheetJson.table.rows;
            for (let i = 1; i < rows.length; i++) {
              const row = rows[i];
              if (!row || !row.c) continue;
              const urlVal = row.c[1]?.v ? String(row.c[1].v).trim() : '';
              if (urlVal) {
                const nameVal = row.c[2]?.v ? String(row.c[2].v).trim() : `Dự án ${projects.length + 1}`;
                projects.push({ name: nameVal, url: urlVal });
              }
            }
            if (import.meta.env.DEV && projects.length === 1) {
              projects.push({ name: "Dự án Mock 2 (Local Demo)", url: "https://example.com" });
            }
            if (projects.length > 0) {
              const defaultProj = projects.find(p => p.name.toLowerCase().includes('fikko-app') || p.name.toLowerCase().includes('fikko app') || p.url.includes('AKfycbww')) || projects[0];
              appsheetUrl = defaultProj.url;
            }
          }
        }
      }
    } catch (err) {
      console.error("[Fallback Login Check] Lỗi lấy các dự án từ IP sheet:", err);
    }

    if (projects.length === 0) {
      return { success: false, error: "Kho dữ liệu Google Sheets chưa cấu hình liên kết dự án nào trong cột B của sheet IP." };
    }

    return {
      success: true,
      allowed: true,
      appsheetUrl: appsheetUrl,
      projects: projects,
      msg: `Chào mừng Quản trị viên: ${authenticatedUser.name}!`
    };
  } catch (err: any) {
    console.error("[Fallback Login Check] Thất bại:", err);
    return { success: false, error: err.message || "Lỗi tự động xác thực danh tính trực tiếp." };
  }
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

  // States for Projects Switcher
  const [projects, setProjects] = useState<{ name: string; url: string }[]>([]);
  const [activeProjectUrl, setActiveProjectUrl] = useState<string>("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // States for Admin Authentication Modal within Session
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingProjectUrl, setPendingProjectUrl] = useState<string | null>(null);
  const [modalUsername, setModalUsername] = useState("");
  const [modalPassword, setModalPassword] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);
  const [isVerifyingModal, setIsVerifyingModal] = useState(false);

  // State to manage whether the floating project switcher panel is expanded/collapsed
  const [isPanelVisible, setIsPanelVisible] = useState(false);

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
          try {
            const ipifyData = await ipifyRes.json();
            if (ipifyData && ipifyData.ip) {
              publicIp = ipifyData.ip;
            }
          } catch (jsonErr) {
            console.warn("Lỗi đọc JSON từ ipify:", jsonErr);
          }
        }
      } catch (ipifyErr) {
        console.warn("Không thể lấy IP mạng từ ipify client-side. Hệ thống sẽ tự động chuyển sang cơ chế phát hiện từ server:", ipifyErr);
      }

      // Step 2: Query security gateway with client_ip if detected
      const apiUrl = publicIp ? `/api/check-ip?client_ip=${encodeURIComponent(publicIp)}` : "/api/check-ip";

      let data: IPCheckResponse;
      try {
        const res = await fetch(apiUrl);
        const contentType = res.headers.get("content-type");

        if (res.ok && contentType && contentType.includes("application/json")) {
          try {
            data = await res.json();
          } catch (jsonErr) {
            console.warn("[Cổng Bảo Mật] Lỗi parse JSON kết nối IP. Thử fallback Google Sheet...", jsonErr);
            data = await performClientSideCheck(publicIp || "0.0.0.0");
          }
        } else {
          // Fallback to client-side Google Sheet parser if endpoint is unavailable/404 HTML
          console.warn("[Cổng Bảo Mật] REST API không khả dụng. Đang chuyển đổi sang cơ cấu đọc trực tiếp từ Google Sheet...");
          data = await performClientSideCheck(publicIp || "0.0.0.0");
        }
      } catch (apiErr) {
        console.log("[Cổng Bảo Mật] Kết nối REST API thất bại. Chuyển hướng sang cơ chế xác định trực tiếp trên browser:", apiErr);
        data = await performClientSideCheck(publicIp || "0.0.0.0");
      }

      setResult(data);
      if (data.success && data.allowed) {
        if (data.projects && data.projects.length > 0) {
          setProjects(data.projects);
          setActiveProjectUrl(data.appsheetUrl || data.projects[0].url);
        } else if (data.appsheetUrl) {
          setProjects([{ name: "Dự án 1", url: data.appsheetUrl }]);
          setActiveProjectUrl(data.appsheetUrl);
        }
      }

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
            try {
              const ipifyData = await ipifyRes.json();
              if (ipifyData && ipifyData.ip) {
                currentIp = ipifyData.ip;
              }
            } catch (jsonErr) {
              console.warn("Lỗi đọc JSON ipify ngầm định:", jsonErr);
            }
          }
        } catch (_) {
          // If public endpoint is blocked, the server checks the network headers anyway
        }

        const apiUrl = currentIp ? `/api/check-ip?client_ip=${encodeURIComponent(currentIp)}` : "/api/check-ip";

        let data: IPCheckResponse;
        try {
          const res = await fetch(apiUrl);
          const contentType = res.headers.get("content-type");
          if (res.ok && contentType && contentType.includes("application/json")) {
            try {
              data = await res.json();
            } catch (jsonErr) {
              data = await performClientSideCheck(currentIp || "0.0.0.0");
            }
          } else {
            data = await performClientSideCheck(currentIp || "0.0.0.0");
          }
        } catch (err) {
          data = await performClientSideCheck(currentIp || "0.0.0.0");
        }

        // If the office IP is no longer present or valid, immediately strip access and lock the gateway
        if (!data.allowed) {
          console.warn("[CỔNG BẢO MẬT] Thiết bị vừa di chuyển ra ngoài phạm vi IP cho phép! Hủy quyền truy cập.");
          setResult(data);
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
    setIsAdminAuthenticated(false);
    checkAccess(true);
  };

  const handleLogout = () => {
    setIsBypassed(false);
    setIsAdminAuthenticated(false);
    setResult(null);
    setProjects([]);
    setActiveProjectUrl("");
    setIsDropdownOpen(false);
    setShowAuthModal(false);
    setIsPanelVisible(false);
    checkAccess();
  };

  const handleAdminLogout = () => {
    setIsAdminAuthenticated(false);
    setIsDropdownOpen(false);
    setIsPanelVisible(false);
    if (projects.length > 0) {
      setActiveProjectUrl(projects[0].url);
    }
  };

  const handleModalSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!modalUsername.trim() || !modalPassword) {
      setModalError("Vui lòng điền đầy đủ tài khoản và mật khẩu.");
      return;
    }
    setModalError(null);
    setIsVerifyingModal(true);

    try {
      let data;
      try {
        const response = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: modalUsername.trim(), password: modalPassword })
        });

        const contentType = response.headers.get("content-type");
        if (response.ok && contentType && contentType.includes("application/json")) {
          try {
            data = await response.json();
          } catch (jsonErr) {
            data = await performClientSideLogin(modalUsername.trim(), modalPassword);
          }
        } else {
          data = await performClientSideLogin(modalUsername.trim(), modalPassword);
        }
      } catch (apiErr) {
        data = await performClientSideLogin(modalUsername.trim(), modalPassword);
      }

      if (!data || !data.success) {
        throw new Error(data?.error || "Tài khoản hoặc mật khẩu không chính xác.");
      }

      // Successful verification
      setIsAdminAuthenticated(true);
      if (pendingProjectUrl) {
        setActiveProjectUrl(pendingProjectUrl);
      }
      setIsPanelVisible(true);
      setIsDropdownOpen(true);
      setShowAuthModal(false);
      setPendingProjectUrl(null);
    } catch (err: any) {
      console.error(err);
      setModalError(err.message || "Tài khoản hoặc mật khẩu không chính xác.");
    } finally {
      setIsVerifyingModal(false);
    }
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
      let data;
      try {
        const response = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: username.trim(), password })
        });

        const contentType = response.headers.get("content-type");
        if (response.ok && contentType && contentType.includes("application/json")) {
          try {
            data = await response.json();
          } catch (jsonErr) {
            console.warn("[Cổng Bảo Mật] Phân tích JSON login lỗi. Chuyển trực tiếp sang Google Sheets...", jsonErr);
            data = await performClientSideLogin(username.trim(), password);
          }
        } else {
          // Direct client-side login fallback
          console.log("[Cổng Bảo Mật] API Backend không khả dụng. Đang đăng nhập trực tiếp từ Google Sheet trên browser...");
          data = await performClientSideLogin(username.trim(), password);
        }
      } catch (apiErr) {
        console.log("[Cổng Bảo Mật] Kết nối API thất bại. Xác thực trực tiếp trên browser:", apiErr);
        data = await performClientSideLogin(username.trim(), password);
      }

      if (!data || !data.success) {
        throw new Error(data?.error || "Tài khoản hoặc mật khẩu không chính xác.");
      }

      // Automatically bypass security check with allowed appsheet link!
      setResult({
        success: true,
        allowed: true,
        appsheetUrl: data.appsheetUrl,
        clientIp: result?.clientIp || "ADMIN_BYPASS",
        msg: data.msg
      });
      if (data.projects && data.projects.length > 0) {
        setProjects(data.projects);
        setActiveProjectUrl(data.appsheetUrl || data.projects[0].url);
      } else if (data.appsheetUrl) {
        setProjects([{ name: "Dự án 1", url: data.appsheetUrl }]);
        setActiveProjectUrl(data.appsheetUrl);
      }
      setIsBypassed(true);
      setIsAdminAuthenticated(true);
    } catch (err: any) {
      console.error(err);
      setLoginError(err.message || "Tài khoản hoặc mật khẩu không chính xác.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  // IF ALLOWED: Instantly render the FULL-SCREEN embedded appsheet iframe with absolutely zero wrapper footprint, headers or panels!
  if (!loading && result?.allowed && activeProjectUrl) {
    const activeProject = projects.find(p => p.url === activeProjectUrl) || {
      name: "Dự án hiện tại",
      url: activeProjectUrl
    };

    return (
      <div className="relative w-screen h-screen overflow-hidden bg-slate-950">
        <iframe
          src={activeProjectUrl}
          title="AppSheet Application"
          className="w-full h-full border-0"
          allow="geolocation; microphone; camera; midi; encrypted-media;"
          referrerPolicy="no-referrer"
          id="appsheet-iframe"
        />

        {/* Floating Project Switcher & Controller */}
        {(projects.length > 1 || isBypassed) && (
          <div className="absolute top-4 right-4 z-50 flex flex-col items-end gap-2">
            {!isPanelVisible ? (
              <button
                onClick={() => {
                  if (isAdminAuthenticated) {
                    setIsPanelVisible(true);
                    setIsDropdownOpen(true);
                  } else {
                    setPendingProjectUrl(null);
                    setModalUsername("");
                    setModalPassword("");
                    setModalError(null);
                    setShowAuthModal(true);
                  }
                }}
                className="bg-slate-900/85 hover:bg-slate-900 backdrop-blur-md text-slate-200 border border-white/10 rounded-full p-2.5 shadow-lg shadow-black/40 hover:shadow-black/60 transition-all cursor-pointer flex items-center justify-center active:scale-95 relative"
                title="Mở bộ chọn dự án"
              >
                <Layers className="w-4 h-4 text-indigo-400" />
                {!isAdminAuthenticated && projects.length > 1 && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-indigo-500 border border-slate-950 animate-ping" />
                )}
              </button>
            ) : (
              <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-3 duration-200">
                <div className="relative">
                  {/* Trigger Button */}
                  {projects.length > 1 ? (
                    <button
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      className="flex items-center space-x-2 bg-slate-900/85 hover:bg-slate-900 backdrop-blur-md text-slate-200 border border-white/10 rounded-full px-4 py-2.5 shadow-lg shadow-black/40 hover:shadow-black/60 transition-all cursor-pointer font-semibold text-xs active:scale-95 uppercase tracking-wide"
                    >
                      <Layers className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{activeProject.name}</span>
                      {!isAdminAuthenticated && (
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" title="Yêu cầu đăng nhập Admin để chuyển" />
                      )}
                      <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                  ) : (
                    <div className="flex items-center space-x-2 bg-slate-900/85 backdrop-blur-md text-slate-300 border border-white/10 rounded-full px-4 py-2 shadow-lg shadow-black/40 text-xs font-semibold uppercase tracking-wide">
                      <Layers className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{activeProject.name}</span>
                    </div>
                  )}

                  {/* Dropdown Options */}
                  <AnimatePresence>
                    {isDropdownOpen && projects.length > 1 && (
                      <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 mt-2 w-64 bg-slate-900/95 backdrop-blur-lg border border-white/10 rounded-2xl p-2 shadow-2xl shadow-black/80 flex flex-col gap-1"
                      >
                        <div className="px-3 py-1.5 text-[9px] font-bold text-slate-500 tracking-wider uppercase font-mono flex items-center justify-between">
                          <span>Danh sách dự án ({projects.length})</span>
                          {!isAdminAuthenticated && (
                            <span className="text-[8px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 lowercase normal-case tracking-normal">cần admin</span>
                          )}
                        </div>
                        <div className="max-h-60 overflow-y-auto pr-1 flex flex-col gap-0.5 custom-scrollbar">
                          {projects.map((project, idx) => {
                            const isActive = project.url === activeProjectUrl;
                            return (
                              <button
                                key={idx}
                                onClick={() => {
                                  if (isActive) return;
                                  if (!isAdminAuthenticated) {
                                    setPendingProjectUrl(project.url);
                                    setShowAuthModal(true);
                                    setIsDropdownOpen(false);
                                    return;
                                  }
                                  setActiveProjectUrl(project.url);
                                  setIsDropdownOpen(false);
                                }}
                                className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center justify-between group cursor-pointer text-xs ${isActive
                                  ? 'bg-indigo-600 text-white font-semibold'
                                  : 'hover:bg-white/5 text-slate-300'
                                  }`}
                              >
                                <span className="truncate pr-2 font-medium">{project.name}</span>
                                <span className="flex items-center space-x-1">
                                  {!isAdminAuthenticated && !isActive && (
                                    <Lock className="w-3 h-3 text-slate-500 opacity-60 group-hover:opacity-100 transition-opacity" />
                                  )}
                                  <a
                                    href={project.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="p-1 rounded-md hover:bg-white/10 text-slate-400 hover:text-white transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center"
                                    title="Mở trong tab mới"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        {isAdminAuthenticated && (
                          <div className="border-t border-white/10 mt-1.5 pt-1.5">
                            <button
                              onClick={isBypassed ? handleLogout : handleAdminLogout}
                              className="w-full px-3 py-2 rounded-xl text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-all flex items-center space-x-2 cursor-pointer text-xs font-semibold uppercase tracking-wider"
                            >
                              <LogOut className="w-3.5 h-3.5" />
                              <span>Đăng xuất Admin</span>
                            </button>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Collapse Button */}
                <button
                  onClick={() => {
                    setIsPanelVisible(false);
                    setIsDropdownOpen(false);
                  }}
                  className="bg-slate-900/85 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-white/10 rounded-full p-2.5 shadow-lg shadow-black/40 cursor-pointer transition-all active:scale-95 flex items-center justify-center"
                  title="Thu gọn bộ chọn"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Admin Authentication Modal for Switching Projects */}
        <AnimatePresence>
          {showAuthModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" id="auth-modal-overlay">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="max-w-sm w-full bg-slate-950/90 border border-white/10 rounded-3xl p-6 shadow-2xl shadow-black text-left"
                id="auth-modal-card"
              >
                <div className="flex items-center space-x-2.5 pb-4 mb-4 border-b border-white/10">
                  <div className="w-10 h-10 rounded-full bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.15)]">
                    <Unlock className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Xác thực Quyền Admin</h3>
                    <p className="text-[10px] text-slate-400">Vui lòng đăng nhập tài khoản Quản trị để chuyển dự án</p>
                  </div>
                </div>

                <form onSubmit={handleModalSubmit} className="space-y-3.5">
                  <div>
                    <input
                      type="text"
                      placeholder="Tài khoản Admin"
                      value={modalUsername}
                      onChange={(e) => setModalUsername(e.target.value)}
                      className="w-full bg-slate-900/80 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all font-sans"
                      disabled={isVerifyingModal}
                      required
                    />
                  </div>
                  <div>
                    <input
                      type="password"
                      placeholder="Mật khẩu"
                      value={modalPassword}
                      onChange={(e) => setModalPassword(e.target.value)}
                      className="w-full bg-slate-900/80 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all font-sans"
                      disabled={isVerifyingModal}
                      required
                    />
                  </div>

                  {modalError && (
                    <div className="text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2 flex items-start space-x-1.5 font-sans">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0 mt-0.5" />
                      <span>{modalError}</span>
                    </div>
                  )}

                  <div className="flex items-center space-x-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowAuthModal(false)}
                      disabled={isVerifyingModal}
                      className="flex-1 bg-white/5 hover:bg-white/10 text-slate-300 font-bold py-2.5 px-4 rounded-xl transition-all text-xs cursor-pointer active:scale-95 disabled:opacity-50 text-center"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={isVerifyingModal}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl shadow-lg shadow-indigo-600/15 transition-all text-xs flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isVerifyingModal ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Đang xác thực...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4" />
                          <span>Xác nhận</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
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