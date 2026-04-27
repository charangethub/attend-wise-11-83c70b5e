import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const HEARTBEAT_INTERVAL = 120_000; // 2 min

export function usePresence() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const upsert = async () => {
      if (document.hidden) return;
      await supabase.from("user_presence").upsert(
        {
          user_id: user.id,
          user_email: user.email ?? "",
          user_name: user.user_metadata?.full_name ?? user.email ?? "",
          last_seen_at: new Date().toISOString(),
          is_online: true,
        } as any,
        { onConflict: "user_id" }
      );
    };

    upsert();
    const interval = setInterval(upsert, HEARTBEAT_INTERVAL);

    const setOffline = async () => {
      await supabase.from("user_presence").update({ is_online: false } as any).eq("user_id", user.id);
    };

    window.addEventListener("beforeunload", setOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", setOffline);
      setOffline();
    };
  }, [user]);
}
