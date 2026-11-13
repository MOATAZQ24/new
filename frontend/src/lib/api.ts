/**
 * API client for interacting with the FastAPI backend.
 * Automatically attaches cookies, X-Company-ID header, and handles errors.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

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
    const errorMsg = jsonResult?.detail || jsonResult?.message || "جلسة العمل منتهية أو غير صالحة";
    throw new Error(errorMsg);
  }

  if (!response.ok) {
    const errorMsg = jsonResult?.detail || jsonResult?.message || "حدث خطأ أثناء تنفيذ الطلب";
    throw new Error(errorMsg);
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
