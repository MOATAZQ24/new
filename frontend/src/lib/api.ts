/**
 * API client for interacting with the FastAPI backend.
 * Automatically attaches cookies, X-Company-ID header, and handles errors.
 */

export const API_BASE = "/api/v1";

export interface ApiResponse<T = any> {
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
  data: any;
  response: { status: number; data: any };

  constructor(message: string, status: number, data: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
    this.response = { status, data };
  }
}

export function parseApiErrorMessage(jsonResult: any, status: number = 500): string {
  if (!jsonResult) {
    return `خطأ في الخادم (رمز الحالة: ${status})`;
  }

  // 1. Plain string detail
  if (typeof jsonResult.detail === "string" && jsonResult.detail.trim()) {
    return jsonResult.detail;
  }

  // 2. Array of validation errors (Pydantic / FastAPI 422)
  if (Array.isArray(jsonResult.detail) && jsonResult.detail.length > 0) {
    const messages = jsonResult.detail.map((err: any) => {
      if (typeof err === "string") return err;
      if (typeof err === "object" && err !== null) {
        const fieldLoc = Array.isArray(err.loc)
          ? err.loc.filter((segment: any) => segment !== "body").join(".")
          : (err.loc ? String(err.loc) : "");
        const msg = err.msg || err.message || JSON.stringify(err);
        return fieldLoc ? `${fieldLoc}: ${msg}` : msg;
      }
      return String(err);
    });
    return messages.join(" | ");
  }

  // 3. Object detail
  if (typeof jsonResult.detail === "object" && jsonResult.detail !== null) {
    return jsonResult.detail.message || jsonResult.detail.msg || JSON.stringify(jsonResult.detail);
  }

  // 4. Plain string message
  if (typeof jsonResult.message === "string" && jsonResult.message.trim()) {
    return jsonResult.message;
  }

  // 5. Object message
  if (typeof jsonResult.message === "object" && jsonResult.message !== null) {
    return jsonResult.message.detail || JSON.stringify(jsonResult.message);
  }

  // 6. Generic error key
  if (typeof jsonResult.error === "string" && jsonResult.error.trim()) {
    return jsonResult.error;
  }

  return `حدث خطأ أثناء تنفيذ الطلب (رمز الحالة: ${status})`;
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
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

  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers,
    credentials: "include", // Sends HttpOnly session cookies
  });

  let jsonResult: any;
  try {
    jsonResult = await response.json();
  } catch {
    jsonResult = { message: "حدث خطأ غير متوقع في الخادم" };
  }

  if (response.status === 401) {
    const isLoginEndpoint = endpoint.includes("/auth/login");
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login") && !isLoginEndpoint) {
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
  get: <T = any>(
    url: string,
    options?: { params?: Record<string, any>; headers?: Record<string, string> } | Record<string, string>
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
  post: <T = any>(url: string, data?: any, headers?: Record<string, string>) =>
    apiRequest<T>(url, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
      headers,
    }),
  put: <T = any>(url: string, data?: any, headers?: Record<string, string>) =>
    apiRequest<T>(url, {
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
      headers,
    }),
  delete: <T = any>(url: string, headers?: Record<string, string>) =>
    apiRequest<T>(url, { method: "DELETE", headers }),
};
