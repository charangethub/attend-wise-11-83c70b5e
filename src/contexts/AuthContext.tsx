import React, { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type PageAccessMap = Record<string, boolean>;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userRole: string | null;
  userStatus: string | null;
  pageAccess: PageAccessMap | null;
  adminPanelAccess: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null, session: null, loading: true, userRole: null,
  userStatus: null, pageAccess: null, adminPanelAccess: false,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userStatus, setUserStatus] = useState<string | null>(null);
  const [pageAccess, setPageAccess] = useState<PageAccessMap | null>(null);
  const [adminPanelAccess, setAdminPanelAccess] = useState(false);

  useEffect(() => {
    const clearMeta = () => {
      setUserRole(null); setUserStatus(null);
      setPageAccess(null); setAdminPanelAccess(false);
    };

    const fetchUserMeta = async (userId: string) => {
      try {
        const [{ data: roleRow }, { data: statusRow }, { data: accessRows }] = await Promise.all([
          supabase.from("user_roles").select("role, admin_panel_access").eq("user_id", userId).maybeSingle(),
          supabase.from("user_status").select("status").eq("user_id", userId).maybeSingle(),
          supabase.from("page_access").select("page_name,has_access").eq("user_id", userId),
        ]);
        setUserRole((roleRow as any)?.role ?? null);
        setAdminPanelAccess((roleRow as any)?.admin_panel_access ?? false);
        setUserStatus((statusRow as any)?.status ?? null);
        const map: PageAccessMap = {};
        (accessRows ?? []).forEach((r: any) => { map[String(r.page_name)] = !!r.has_access; });
        setPageAccess(map);
      } catch (error) {
        console.error("Failed to load account info:", error);
        toast.error("Failed to load account info. Please refresh.");
      }
    };

    const hydrate = async (nextSession: Session | null) => {
      setLoading(true);
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (nextSession?.user) { await fetchUserMeta(nextSession.user.id); } else { clearMeta(); }
      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void hydrate(nextSession);
    });
    supabase.auth.getSession().then(({ data: { session } }) => { void hydrate(session); });
    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => { await supabase.auth.signOut(); };

  return (
    <AuthContext.Provider value={{ user, session, loading, userRole, userStatus, pageAccess, adminPanelAccess, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
