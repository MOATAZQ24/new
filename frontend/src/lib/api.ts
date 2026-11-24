/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

/**
 * API client for interacting with the FastAPI backend.
 * Automatically attaches cookies, X-Company-ID header, and handles errors.
 */

export const API_BASE = "/api/v1";

export interface ApiResponse<T = unknown> {
  data: T;
  message?: string;
  pagination?: {
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
  };
}

export class ApiError extends Error {
  status: number;
  data: unknown;
  response: { status: number; data: unknown };

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
    this.response = { status, data };
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
  get isTimeout(): boolean {
    return this.status === 408;
  }
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
  get isForbidden(): boolean {
    return this.status === 403;
  }
  get isNotFound(): boolean {
    return this.status === 404;
  }
  get isServerError(): boolean {
    return this.status >= 500;
  }
}

export function parseApiErrorMessage(jsonResult: unknown, status: number = 500): string {
  if (!jsonResult || typeof jsonResult !== "object") {
    return `خطأ في الخادم (رمز الحالة: ${status})`;
  }
  const obj = jsonResult as Record<string, unknown>;

  // 1. Plain string detail
  if (typeof obj.detail === "string" && obj.detail.trim()) {
    return obj.detail;
  }

  // 2. Array of validation errors (Pydantic / FastAPI 422)
  if (Array.isArray(obj.detail) && obj.detail.length > 0) {
    const messages = obj.detail.map((err: unknown) => {
      if (typeof err === "string") return err;
      if (typeof err === "object" && err !== null) {
        const errObj = err as Record<string, unknown>;
        const fieldLoc = Array.isArray(errObj.loc)
          ? errObj.loc.filter((segment) => segment !== "body").map(String).join(".")
          : (errObj.loc ? String(errObj.loc) : "");
        const msg = String(errObj.msg || errObj.message || JSON.stringify(errObj));
        return fieldLoc ? `${fieldLoc}: ${msg}` : msg;
      }
      return String(err);
    });
    return messages.join(" | ");
  }

  // 3. Object detail
  if (typeof obj.detail === "object" && obj.detail !== null) {
    const detailObj = obj.detail as Record<string, unknown>;
    return String(detailObj.message || detailObj.msg || JSON.stringify(detailObj));
  }

  // 4. Plain string message
  if (typeof obj.message === "string" && obj.message.trim()) {
    return obj.message;
  }

  // 5. Object message
  if (typeof obj.message === "object" && obj.message !== null) {
    const msgObj = obj.message as Record<string, unknown>;
    return String(msgObj.detail || JSON.stringify(msgObj));
  }

  // 6. Generic error key
  if (typeof obj.error === "string" && obj.error.trim()) {
    return obj.error;
  }

  return `حدث خطأ أثناء تنفيذ الطلب (رمز الحالة: ${status})`;
}

export interface ApiRequestOptions extends RequestInit {
  timeoutMs?: number;
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<ApiResponse<T>> {
  const url = `${API_BASE}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  // Get active company from localStorage if running in browser
  let activeCompanyId: string | null = null;
  if (typeof window !== "undefined") {
    activeCompanyId = localStorage.getItem("active_company_id");
  }

  const headers: Record<string, string> = {
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string> || {}),
  };

  if (activeCompanyId) {
    headers["X-Company-ID"] = activeCompanyId;
  }

  // Robust timeout handling: prevent infinite skeleton loading on mobile networks (default 15s)
  const timeoutMs = options.timeoutMs ?? 15000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      ...options,
      signal: options.signal || controller.signal,
      headers,
      credentials: "include", // Sends HttpOnly session cookies
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ApiError(
        `انتهت مهلة انتظار استجابة الخادم (${Math.round(timeoutMs / 1000)} ثانية). يرجى التحقق من اتصال الشبكة وإعادة المحاولة.`,
        408,
        { code: "TIMEOUT" }
      );
    }
    const isNetwork =
      err instanceof TypeError ||
      (err instanceof Error &&
        (err.message.toLowerCase().includes("fetch") ||
          err.message.toLowerCase().includes("network") ||
          err.message.toLowerCase().includes("failed")));
    if (isNetwork) {
      throw new ApiError(
        "تعذر الاتصال بالخادم (Network Error). يرجى التأكد من اتصال الهاتف بنفس الشبكة والوصول لعنوان النظام.",
        0,
        { code: "NETWORK_ERROR", original: err instanceof Error ? err.message : String(err) }
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  let jsonResult: unknown;
  try {
    jsonResult = await response.json();
  } catch {
    jsonResult = { message: "حدث خطأ غير متوقع في الخادم" };
  }

  if (response.status === 401) {
    const isLoginEndpoint = endpoint.includes("/auth/login");
    const isDesignLab = typeof window !== "undefined" && window.location.pathname.startsWith("/design");
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login") && !isDesignLab && !isLoginEndpoint) {
      window.location.href = "/login";
    }
    const errorMsg = parseApiErrorMessage(jsonResult, 401) || "جلسة العمل منتهية أو غير صالحة";
    throw new ApiError(errorMsg, 401, jsonResult);
  }

  if (!response.ok) {
    const errorMsg = parseApiErrorMessage(jsonResult, response.status);
    throw new ApiError(errorMsg, response.status, jsonResult);
  }

  return jsonResult as ApiResponse<T>;
}

export const api = {
  get: <T = unknown>(
    url: string,
    options?: { params?: Record<string, string | number | boolean | null | undefined>; headers?: Record<string, string> } | Record<string, string>
  ) => {
    let finalUrl = url;
    let headers: Record<string, string> | undefined;

    if (options && typeof options === "object" && "params" in options && options.params) {
      const searchParams = new URLSearchParams();
      Object.entries(options.params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== "") {
          searchParams.append(key, String(val));
        }
      });
      const queryStr = searchParams.toString();
      if (queryStr) {
        finalUrl += (finalUrl.includes("?") ? "&" : "?") + queryStr;
      }
      headers = (options as { headers?: Record<string, string> }).headers;
    } else if (options) {
      headers = options as Record<string, string>;
    }

    return apiRequest<T>(finalUrl, { method: "GET", headers });
  },
  post: <T = unknown>(url: string, data?: unknown, headers?: Record<string, string>) =>
    apiRequest<T>(url, {
      method: "POST",
      body: data instanceof FormData ? data : data ? JSON.stringify(data) : undefined,
      headers,
    }),
  put: <T = unknown>(url: string, data?: unknown, headers?: Record<string, string>) =>
    apiRequest<T>(url, {
      method: "PUT",
      body: data instanceof FormData ? data : data ? JSON.stringify(data) : undefined,
      headers,
    }),
  patch: <T = unknown>(url: string, data?: unknown, headers?: Record<string, string>) =>
    apiRequest<T>(url, {
      method: "PATCH",
      body: data instanceof FormData ? data : data ? JSON.stringify(data) : undefined,
      headers,
    }),
  delete: <T = unknown>(url: string, headers?: Record<string, string>) =>
    apiRequest<T>(url, { method: "DELETE", headers }),
};

/**
 * Download or open printable report from /api/v1/reports/export using active company & session cookies.
 */
export async function exportReportDownload(
  reportType: string,
  format: "excel" | "csv" | "html" | "pdf",
  companyId?: string | null,
  filename?: string
): Promise<void> {
  const companyParam = companyId ? `&company_id=${encodeURIComponent(companyId)}` : "";
  const url = `${API_BASE}/reports/export?report_type=${encodeURIComponent(reportType)}&format_type=${encodeURIComponent(format)}${companyParam}`;
  const headers: Record<string, string> = {};
  if (typeof window !== "undefined") {
    const cid = companyId || localStorage.getItem("active_company_id");
    if (cid) headers["X-Company-ID"] = cid;
  }

  const res = await fetch(url, {
    method: "GET",
    headers,
    credentials: "include",
  });
  if (!res.ok) {
    let msg = `تعذر تصدير التقرير (${res.status})`;
    try {
      const errJson = await res.json();
      msg = parseApiErrorMessage(errJson, res.status);
    } catch {
      // keep fallback message
    }
    throw new Error(msg);
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  if (format === "html" || format === "pdf") {
    window.open(objectUrl, "_blank");
    setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
    return;
  }
  const link = document.createElement("a");
  link.href = objectUrl;
  link.setAttribute("download", filename || `${reportType}_report.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
}
