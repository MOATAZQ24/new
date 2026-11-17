"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { api } from "@/lib/api";

export interface CompanyInfo {
  id: string;
  name_ar: string;
  name_en: string;
  code: string;
  is_default: boolean;
  company_logo?: string;
  contact_email?: string;
  contact_phone?: string;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  account_status: string;
  is_superadmin: boolean;
  must_change_password?: boolean;
  roles: string[];
  companies: CompanyInfo[];
  active_company_id?: string;
  employee_id?: string;
  full_name?: string;
  job_title?: string;
  employee?: {
    full_name?: string;
    job_title?: string;
    phone?: string;
  };
}

interface AuthContextType {
  user: UserProfile | null;
  activeCompany: CompanyInfo | null;
  currentCompany: CompanyInfo | null;
  activeCompanyId: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setActiveCompanyId: (companyId: string) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchProfile = async () => {
    try {
      const res = await api.get<{ user: UserProfile }>("/auth/me");
      const u: UserProfile = res.data.user;
      setUser(u);

      const savedCid = localStorage.getItem("active_company_id");
      if (savedCid && u.companies.some((c) => c.id === savedCid)) {
        setActiveCompanyIdState(savedCid);
      } else if (u.active_company_id) {
        setActiveCompanyIdState(u.active_company_id);
        localStorage.setItem("active_company_id", u.active_company_id);
      } else if (u.companies.length > 0) {
        setActiveCompanyIdState(u.companies[0].id);
        localStorage.setItem("active_company_id", u.companies[0].id);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const t = window.setTimeout(() => {
      void fetchProfile();
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  const setActiveCompanyId = (companyId: string) => {
    setActiveCompanyIdState(companyId);
    localStorage.setItem("active_company_id", companyId);
    // Reload window so all cached data refreshes for new company
    window.location.reload();
  };

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await api.post<{ user: UserProfile }>("/auth/login", { username, password });
      const u: UserProfile = res.data.user;
      setUser(u);
      if (u.active_company_id) {
        setActiveCompanyIdState(u.active_company_id);
        localStorage.setItem("active_company_id", u.active_company_id);
      }
      window.location.href = "/";
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    setUser(null);
    localStorage.removeItem("active_company_id");
    window.location.href = "/login";
  };

  const activeCompany =
    user?.companies.find((c) => c.id === activeCompanyId) ||
    user?.companies[0] ||
    null;

  return (
    <AuthContext.Provider
      value={{
        user,
        activeCompany,
        currentCompany: activeCompany,
        activeCompanyId,
        isLoading,
        login,
        logout,
        setActiveCompanyId,
        refreshUser: fetchProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
