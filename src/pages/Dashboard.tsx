import { useAuth } from "@/contexts/AuthContext";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import DashboardAnalytics from "@/components/DashboardAnalytics";
import MonthlyAnalytics from "@/components/MonthlyAnalytics";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowUpRight, Clock } from "lucide-react";
import { format } from "date-fns";

const Dashboard = () => {
  const { user, userRole } = useAuth();
  const { data: settings } = useSystemSettings();

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  };

  const fullName = user?.user_metadata?.full_name || "User";
  const nameParts = fullName.trim().split(" ");
  const displayName = nameParts.length > 1 ? nameParts[nameParts.length - 1].toUpperCase() : nameParts[0].toUpperCase();

  const linkedApps = [
    { url: settings?.linked_app_url_1, label: settings?.linked_app_url_1_label },
    { url: settings?.linked_app_url_2, label: settings?.linked_app_url_2_label },
  ].filter((app) => app.url);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground">
          {greeting()}, {displayName} 👋
        </h2>
        <p className="text-sm text-muted-foreground">
          Your role: <span className="font-semibold text-primary">{userRole ?? "pending approval"}</span>
          {settings?.last_sync_at && (
            <span className="ml-4 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              Last sync: {format(new Date(settings.last_sync_at), "dd MMM yyyy, hh:mm a")}
            </span>
          )}
        </p>
      </div>

      {linkedApps.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Quick Links</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {linkedApps.map((app, i) => {
              let domain = "";
              try { domain = new URL(app.url!).hostname; } catch {}
              return (
                <a key={i} href={app.url} target="_blank" rel="noopener noreferrer">
                  <Card className="group cursor-pointer transition-all hover:border-primary/50 hover:shadow-md">
                    <CardContent className="flex items-center justify-between p-4">
                      <div>
                        <p className="font-medium text-foreground">{app.label || "External App"}</p>
                        {domain && <p className="text-xs text-muted-foreground">{domain}</p>}
                      </div>
                      <ArrowUpRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
                    </CardContent>
                  </Card>
                </a>
              );
            })}
          </div>
        </div>
      )}

      <DashboardAnalytics />
      <div className="mt-8 border-t border-border pt-8">
        <MonthlyAnalytics />
      </div>
    </div>
  );
};

export default Dashboard;
