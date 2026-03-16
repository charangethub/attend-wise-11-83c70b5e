import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Wifi, WifiOff } from "lucide-react";

const ONLINE_THRESHOLD_MS = 60_000; // 60s

const OnlineUsersWidget = () => {
  const [users, setUsers] = useState<any[]>([]);

  const fetchPresence = async () => {
    const { data } = await supabase.from("user_presence").select("*");
    setUsers(data ?? []);
  };

  useEffect(() => {
    fetchPresence();
    const interval = setInterval(fetchPresence, 15_000);

    // Realtime subscription
    const channel = supabase
      .channel("presence-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_presence" }, () => {
        fetchPresence();
      })
      .subscribe();

    return () => { clearInterval(interval); supabase.removeChannel(channel); };
  }, []);

  const now = Date.now();
  const sortedUsers = [...users].sort((a, b) => {
    const aOnline = a.is_online && (now - new Date(a.last_seen_at).getTime()) < ONLINE_THRESHOLD_MS;
    const bOnline = b.is_online && (now - new Date(b.last_seen_at).getTime()) < ONLINE_THRESHOLD_MS;
    if (aOnline === bOnline) return 0;
    return aOnline ? -1 : 1;
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Wifi className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-bold text-foreground">Live User Status</h3>
        <span className="text-xs bg-success/10 text-success px-2 py-0.5 rounded-full font-semibold">
          {users.filter((u) => u.is_online && (now - new Date(u.last_seen_at).getTime()) < ONLINE_THRESHOLD_MS).length} online
        </span>
      </div>
      <div className="rounded-lg border border-border divide-y divide-border">
        {sortedUsers.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No user activity recorded yet</p>
        ) : (
          sortedUsers.map((u) => {
            const isOnline = u.is_online && (now - new Date(u.last_seen_at).getTime()) < ONLINE_THRESHOLD_MS;
            return (
              <div key={u.user_id} className="flex items-center gap-3 px-4 py-3">
                <div className={`h-2.5 w-2.5 rounded-full ${isOnline ? "bg-success animate-pulse" : "bg-muted-foreground/30"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{u.user_name || u.user_email}</p>
                  <p className="text-[10px] text-muted-foreground">{u.user_email}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isOnline ? (
                    <span className="text-xs font-semibold text-success flex items-center gap-1"><Wifi className="h-3 w-3" /> Online</span>
                  ) : (
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><WifiOff className="h-3 w-3" /> {format(new Date(u.last_seen_at), "dd MMM, hh:mm a")}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default OnlineUsersWidget;
