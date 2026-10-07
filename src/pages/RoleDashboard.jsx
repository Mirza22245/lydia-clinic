import React from "react";
import { useAuth } from "@/lib/AuthContext";
import AdminDashboard from "@/pages/AdminDashboard";
import StaffDashboard from "@/pages/StaffDashboard";

export default function RoleDashboard() {
  const { user } = useAuth();
  const role = String(user?.role || "").toLowerCase();
  const staffRole = String(user?.staff_role || user?.data?.staff_role || "").toLowerCase();
  if (role === "admin" || role === "administratör") return <AdminDashboard />;
  return <StaffDashboard staffRole={staffRole} />;
}
