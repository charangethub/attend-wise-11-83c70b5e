import {
  Users, LayoutDashboard, ClipboardCheck, AlertTriangle,
  BarChart3, FileText, Shield, LogOut, RefreshCw, ExternalLink, CalendarDays,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const mainItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Mark Attendance", url: "/attendance", icon: ClipboardCheck },
  { title: "Absentee Report", url: "/absentees", icon: AlertTriangle },
  { title: "Attendance Records", url: "/records", icon: BarChart3 },
  { title: "Daily Report", url: "/daily-report", icon: FileText },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const { user, userRole, userStatus, pageAccess, adminPanelAccess, signOut } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const { data: settings } = useSystemSettings();

  const visibleMainItems = mainItems.filter((item) => {
    if (userRole === "owner") return true;
    if (userStatus !== "active") return false;
    return pageAccess?.[item.title] ?? false;
  });

  const handleSignOut = async () => { await signOut(); navigate("/login"); };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-google-sheet");
      if (error) throw error;
      toast.success(`Synced ${data?.synced ?? 0} students from Google Sheet`);
    } catch (err: any) {
      toast.error("Sync failed: " + (err.message || "Unknown error"));
    }
    setSyncing(false);
  };

  const linkedApps = [
    { url: settings?.linked_app_url_1, label: settings?.linked_app_url_1_label },
    { url: settings?.linked_app_url_2, label: settings?.linked_app_url_2_label },
  ].filter((app) => app.url);

  return (
    <Sidebar collapsible="icon">
      <SidebarContent className="bg-sidebar-background">
        <div className="flex items-center gap-3 border-b border-sidebar-border px-4 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary">
            <Users className="h-5 w-5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <span className="text-sm font-bold text-sidebar-foreground leading-tight">
              Vedantu Attendance<br />
              <span className="text-[10px] font-normal text-sidebar-foreground/60">Management System</span>
            </span>
          )}
        </div>

        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-sidebar-foreground/70 px-3 py-4 text-xs uppercase tracking-wider">
              Navigation
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold"
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {(userRole === "owner" || adminPanelAccess) && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/admin"
                      end
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold"
                    >
                      <Shield className="h-5 w-5 shrink-0" />
                      {!collapsed && <span>Admin Panel</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {linkedApps.length > 0 && (
          <SidebarGroup>
            {!collapsed && (
              <SidebarGroupLabel className="text-sidebar-foreground/70 px-3 py-2 text-xs uppercase tracking-wider">
                Linked Apps
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {linkedApps.map((app, i) => (
                  <SidebarMenuItem key={i}>
                    <SidebarMenuButton asChild>
                      <a href={app.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
                        <ExternalLink className="h-5 w-5 shrink-0" />
                        {!collapsed && <span>{app.label || "External App"}</span>}
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="bg-sidebar-background border-t border-sidebar-border p-3">
        {(userRole === "owner" || userRole === "admin") && (
          <Button variant="ghost" size="sm" onClick={handleSync} disabled={syncing}
            className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent">
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {!collapsed && "Sync Sheet"}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={handleSignOut}
          className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:text-destructive hover:bg-sidebar-accent">
          <LogOut className="h-4 w-4" />
          {!collapsed && "Logout"}
        </Button>
        {!collapsed && (
          <p className="mt-1 truncate px-2 text-xs text-sidebar-foreground/50">{user?.email}</p>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
