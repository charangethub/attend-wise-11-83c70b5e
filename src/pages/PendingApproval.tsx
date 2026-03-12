import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Clock, LogOut } from "lucide-react";

const PendingApproval = () => {
  const { signOut, user } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-lg">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-warning/20">
          <Clock className="h-8 w-8 text-warning" />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-foreground">Pending Approval</h1>
        <p className="mb-1 text-sm text-muted-foreground">Your account is awaiting approval from the administrator.</p>
        <p className="mb-6 text-xs text-muted-foreground">Signed in as <span className="font-medium text-foreground">{user?.email}</span></p>
        <p className="mb-8 text-sm text-muted-foreground">Once approved, you'll be able to access the dashboard. Please check back later or contact your admin.</p>
        <Button variant="outline" onClick={signOut} className="gap-2">
          <LogOut className="h-4 w-4" /> Sign Out
        </Button>
      </div>
    </div>
  );
};
export default PendingApproval;
