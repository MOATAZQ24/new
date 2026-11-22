/**
 * ==============================================================================
 * Investor Gate OS (IGOS) - Technical Operations Platform
 * Original Developer: Moataz Qasem (2026)
 * Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
 * ==============================================================================
 */

"use client";

import { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";

export type RoleCategory = "employee" | "technician" | "manager" | "admin";

export interface UserRoleInfo {
  roleCategory: RoleCategory;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isTechnician: boolean;
  isEmployee: boolean;
  
  // Permissions & Capabilities
  canManageTasks: boolean;
  canAssignTasks: boolean;
  canApprove: boolean;
  canManageAssets: boolean;
  canViewFinancials: boolean;
  canConfigureSystem: boolean;
  canManageUsers: boolean;
  canManageCompanies: boolean;
  
  // Display Helpers
  primaryRoleTitleAr: string;
  primaryRoleTitleEn: string;
}

export function useUserRole(): UserRoleInfo {
  const { user } = useAuth();

  return useMemo(() => {
    const isSuperAdmin = Boolean(user?.is_superadmin);
    const roles = user?.roles || [];
    
    const hasAdminRole = isSuperAdmin || roles.some((r) => 
      ["Super Admin", "Company Admin", "Admin", "admin", "superadmin"].includes(r)
    );
    
    const hasManagerRole = hasAdminRole || roles.some((r) => 
      ["IT Manager", "Manager", "manager", "it_manager"].includes(r)
    );
    
    const hasTechnicianRole = hasManagerRole || roles.some((r) => 
      ["IT Technician", "Technician", "technician", "it_technician"].includes(r)
    );

    let roleCategory: RoleCategory = "employee";
    let primaryRoleTitleAr = "موظف";
    let primaryRoleTitleEn = "Employee";

    if (isSuperAdmin) {
      roleCategory = "admin";
      primaryRoleTitleAr = "مدير النظام العام";
      primaryRoleTitleEn = "Super Admin";
    } else if (roles.includes("Company Admin") || roles.includes("Admin")) {
      roleCategory = "admin";
      primaryRoleTitleAr = "مدير الشركة";
      primaryRoleTitleEn = "Company Admin";
    } else if (roles.includes("IT Manager") || roles.includes("Manager")) {
      roleCategory = "manager";
      primaryRoleTitleAr = "مدير العمليات والتقنية";
      primaryRoleTitleEn = "IT Manager";
    } else if (roles.includes("IT Technician") || roles.includes("Technician")) {
      roleCategory = "technician";
      primaryRoleTitleAr = "فني الدعم والعمليات";
      primaryRoleTitleEn = "IT Technician";
    }

    return {
      roleCategory,
      isSuperAdmin,
      isAdmin: hasAdminRole,
      isManager: hasManagerRole,
      isTechnician: hasTechnicianRole,
      isEmployee: !hasAdminRole && !hasManagerRole && !hasTechnicianRole,

      // Capabilities
      canManageTasks: hasTechnicianRole,
      canAssignTasks: hasManagerRole,
      canApprove: hasManagerRole,
      canManageAssets: hasTechnicianRole,
      canViewFinancials: hasManagerRole,
      canConfigureSystem: hasAdminRole,
      canManageUsers: hasAdminRole,
      canManageCompanies: isSuperAdmin,

      primaryRoleTitleAr,
      primaryRoleTitleEn,
    };
  }, [user]);
}
