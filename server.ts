import express from "express";
import path from "path";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route to verify client's IP and get the AppsSheet link securely
  app.get("/api/check-ip", async (req, res) => {
    console.log("[/api/check-ip] Nhận yêu cầu từ client");
    // 1. Get client IP (prefer client-side public WAN IP passed in query)
    const queryIp = req.query.client_ip;
    let clientIp = '';

    if (queryIp && typeof queryIp === 'string') {
      clientIp = queryIp.trim();
    } else {
      const xForwardedFor = req.headers['x-forwarded-for'];
      if (xForwardedFor) {
        if (typeof xForwardedFor === 'string') {
          clientIp = xForwardedFor;
        } else if (Array.isArray(xForwardedFor)) {
          clientIp = xForwardedFor.join(', ');
        }
      } else {
        clientIp = req.socket.remoteAddress || '';
      }
    }

    // Extract only standard IPv4 address from the string
    const ipv4Match = clientIp.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
    if (ipv4Match) {
      clientIp = ipv4Match[0];
    } else {
      // Fallback cleanups if no IPv4 pattern was matched
      if (clientIp.startsWith('::ffff:')) {
        clientIp = clientIp.substring(7);
      } else if (clientIp === '::1') {
        clientIp = '127.0.0.1';
      }
    }

    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || '1LI8edTRUQZNqyVxUtD0fj_ZaarcalHoEvrdfa3D7PdI';
    const ipSheetName = process.env.GOOGLE_IP_SHEET_NAME || 'IP';

    // Use the spreadsheet gviz query endpoint which is incredibly direct, doesn't require credentials
    // if the spreadsheet is shared with "Anyone with the link can view".
    const gvizUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(ipSheetName)}`;

    try {
      const response = await fetch(gvizUrl);
      if (!response.ok) {
        throw new Error(`Google Sheets trả về mã lỗi ${response.status}`);
      }
      const rawText = await response.text();

      // Match the JSON string from the google visualization API response
      const match = rawText.match(/google\.visualization\.Query\.setResponse\(([\s\S\w\W]*)\);/);
      if (!match) {
        throw new Error(
          "Không thể phân tách dữ liệu phản hồi từ Google Sheets. " +
          "Hãy chắc chắn rằng trang tính đã được thiết lập quyền chia sẻ: 'Bất kỳ ai có liên kết đều có thể xem'."
        );
      }

      const json = JSON.parse(match[1]);
      if (json.status === "error") {
        const errorDetail = json.errors?.[0]?.detailed_message || 'Lỗi không xác định';
        throw new Error(`Google Sheets API returns error: ${errorDetail}`);
      }

      const table = json.table;
      if (!table || !table.rows || table.rows.length === 0) {
        throw new Error("Không thể tìm thấy bất kỳ hàng dữ liệu nào trong trang tính IP.");
      }

      // Read all IPs from column A and projects from column B & C
      const allowedIps: string[] = [];
      const projects: { name: string; url: string }[] = [];
      for (let i = 0; i < table.rows.length; i++) {
        const row = table.rows[i];
        if (!row || !row.c) continue;

        const ipVal = row.c[0] && row.c[0].v ? String(row.c[0].v).trim() : '';
        // Skip header or empty cells
        if (ipVal && ipVal !== 'IP' && ipVal !== '*') {
          allowedIps.push(ipVal);
        }

        // Projects start from Row 1
        if (i > 0) {
          const urlVal = row.c[1] && row.c[1].v ? String(row.c[1].v).trim() : '';
          if (urlVal) {
            const nameVal = row.c[2] && row.c[2].v ? String(row.c[2].v).trim() : `Dự án ${projects.length + 1}`;
            projects.push({ name: nameVal, url: urlVal });
          }
        }
      }

      if (process.env.NODE_ENV !== 'production' && projects.length === 1) {
        projects.push({ name: "Dự án Mock 2 (Local Demo)", url: "https://example.com" });
      }
      const defaultProj = projects.find(p => p.name.toLowerCase().includes('fikko-app') || p.name.toLowerCase().includes('fikko app') || p.url.includes('AKfycbww')) || projects[0];
      const appsheetUrl = defaultProj?.url || '';

      console.log(`[Google Sheets Auth] Lấy từ sheet "${ipSheetName}": IPs=${allowedIps.join(', ')}, Projects=${JSON.stringify(projects)}`);

      if (allowedIps.length === 0) {
        throw new Error("Không tìm thấy giá trị địa chỉ IP được cấp phép trong cột A của sheet IP.");
      }
      if (projects.length === 0) {
        throw new Error("Không tìm thấy liên kết dự án nào được cấp phép trong cột B của sheet IP.");
      }

      // Check if client IP is allowed.
      const isAllowed = allowedIps.includes(clientIp) || allowedIps.includes("*");

      console.log(`[IP Check] clientIp="${clientIp}", allowedIps=[${allowedIps.join(', ')}], isAllowed=${isAllowed}`);

      if (isAllowed) {
        // IP matches, allow access and send back the AppSheet URL!
        return res.json({
          success: true,
          allowed: true,
          clientIp,
          allowedIpValue: allowedIps.join(", "),
          appsheetUrl: appsheetUrl,
          projects: projects
        });
      } else {
        // IP does not match, block access and don't leak the appsheetUrl!
        return res.json({
          success: true,
          allowed: false,
          clientIp,
          allowedIpValue: allowedIps.join(", "),
          msg: "IP hiện tại của bạn không trùng khớp với danh sách IP được phép trong sheet IP."
        });
      }

    } catch (error: any) {
      console.error("[Cửa ngõ xác minh IP] Lỗi hệ thống:", error);
      return res.status(500).json({
        success: false,
        allowed: false,
        clientIp,
        error: error.message || "Lỗi đọc cấu hình bảo mật từ Google Sheet."
      });
    }
  });

  // Function to normalize Vietnamese characters for searching column headers
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

  // API Route to handle credentials login for Admin Bypass
  app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: "Vui lòng nhập đầy đủ tài khoản và mật khẩu."
      });
    }

    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || '1LI8edTRUQZNqyVxUtD0fj_ZaarcalHoEvrdfa3D7PdI';
    const sheetName = process.env.GOOGLE_SHEET_NAME || 'HeThong_TaiKhoan';
    const gvizUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json&headers=1&sheet=${encodeURIComponent(sheetName)}`;

    try {
      const response = await fetch(gvizUrl);
      if (!response.ok) {
        throw new Error(`Không thể kết nối đến Google Sheets (HTTP ${response.status})`);
      }
      const rawText = await response.text();
      const match = rawText.match(/google\.visualization\.Query\.setResponse\(([\s\S\w\W]*)\);/);
      if (!match) {
        throw new Error("Không thể phân tách dữ liệu phản hồi từ Google Sheets.");
      }

      const json = JSON.parse(match[1]);
      if (json.status === "error") {
        const errorDetail = json.errors?.[0]?.detailed_message || 'Lỗi không xác định';
        throw new Error(`Google Sheets trả về lỗi: ${errorDetail}`);
      }

      const table = json.table;
      if (!table || !table.rows || table.rows.length === 0) {
        throw new Error("Không có dữ liệu trong trang tính 'Tài khoản'.");
      }

      // Default column mapping according to HeThong_TaiKhoan sheet layout:
      // A: Tên đăng nhập, B: Mật khẩu, C: Họ tên, D: Vai trò
      const colIndices = {
        id: 0,        // A
        username: 0,  // A (Tên đăng nhập)
        password: 1,  // B (Mật khẩu)
        name: 2,      // C (Họ tên)
        role: 3,      // D (Vai trò)
        appsheet: 9   // J
      };

      // Detect sheet headers based on values in the first row (Row 0)
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

      // If Row 0 has a header, the data rows start from Index 1. Otherwise, start from Index 0.
      const startIndex = hasHeader ? 1 : 0;
      let authenticatedUser = null;

      // Extract general AppSheet URL from Row 0 (or J1 cell) as fallback
      const defaultAppsheetUrlRaw = table.rows[0]?.c?.[9];
      const defaultAppsheetUrl = defaultAppsheetUrlRaw?.v ? String(defaultAppsheetUrlRaw.v).trim() : '';

      // Calculate SHA-256 of input password for comparison
      const passHash = crypto.createHash('sha256').update(password.trim()).digest('hex');

      // Loop through accounts to match
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

        const userMatch = uVal.toLowerCase() === username.trim().toLowerCase();
        const passMatch = (!pVal) || 
                          pVal === password.trim() || 
                          pVal.toLowerCase() === password.trim().toLowerCase() || 
                          pVal.toLowerCase() === passHash.toLowerCase();

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
        console.warn(`[/api/login] Đăng nhập thất bại cho username="${username}"`);
        return res.status(401).json({
          success: false,
          error: "Tài khoản hoặc mật khẩu không chính xác."
        });
      }

      // Verify Role Is ADMIN (accept admin, administrator, quản trị viên, etc.)
      if (!authenticatedUser.isAdmin) {
        console.warn(`[/api/login] Tài khoản ${authenticatedUser.username} có vai trò "${authenticatedUser.rawRole}" không phải Admin.`);
        return res.status(403).json({
          success: false,
          error: "Chỉ có tài khoản thuộc nhóm Quản trị viên (Admin) mới được phép truy cập."
        });
      }

      // Fetch Projects from IP sheet, not from "Tài khoản" sheet
      const ipSheetName = process.env.GOOGLE_IP_SHEET_NAME || 'IP';
      const ipSheetGvizUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(ipSheetName)}`;

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
              if (process.env.NODE_ENV !== 'production' && projects.length === 1) {
                projects.push({ name: "Dự án Mock 2 (Local Demo)", url: "https://example.com" });
              }
              if (projects.length > 0) {
                appsheetUrl = projects[0].url;
              }
            }
          }
        }
      } catch (err) {
        console.error("[/api/login] Lỗi lấy các dự án từ IP sheet:", err);
      }

      if (projects.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Kho dữ liệu hiện tại không cấu hình liên kết dự án nào trong cột B của sheet IP."
        });
      }

      return res.json({
        success: true,
        allowed: true,
        userName: authenticatedUser.name,
        appsheetUrl: appsheetUrl,
        projects: projects,
        msg: `Chào mừng Quản trị viên: ${authenticatedUser.name}!`
      });

    } catch (err: any) {
      console.error("[Đăng nhập Bypass] Lỗi:", err);
      return res.status(500).json({
        success: false,
        error: err.message || "Không thể tải danh sách tài khoản hợp chuẩn từ Google Sheets."
      });
    }
  });

  // Serve static assets or mount Vite middleware in development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] App bọc bảo mật chạy tại http://0.0.0.0:${PORT}`);
  });
}

startServer();
