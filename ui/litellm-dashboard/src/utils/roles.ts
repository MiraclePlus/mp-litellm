// Define admin roles and permissions
export const old_admin_roles = ["Admin", "Admin Viewer"];
export const v2_admin_role_names = [
  "proxy_admin",
  "proxy_admin_viewer",
  "org_admin",
];
export const old_all_custom_user_roles = ["Custom User"];
export const all_custom_user_roles = ["custom_user"];
export const all_admin_roles = [
  ...old_admin_roles,
  ...v2_admin_role_names,
  ...all_custom_user_roles,
  ...old_all_custom_user_roles,
];

export const internalUserRoles = ["Internal User", "Internal Viewer"];
export const rolesAllowedToSeeUsage = [
  "Admin",
  "Admin Viewer",
  "Internal User",
  "Internal Viewer",
];
export const rolesWithWriteAccess = ["Internal User", "Admin"];

// Helper function to check if a role is in all_admin_roles
export const isAdminRole = (role: string): boolean => {
  return all_admin_roles.includes(role);
};
