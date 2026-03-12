import React from "react";
import { Users } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useAutoSync } from "@/hooks/useAutoSync";

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  useAutoSync();
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="h-14 flex items-center gap-3 border-b border-border bg-card px-4">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Users className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-base font-bold text-foreground">Vedantu Attendance</span>
            </div>
          </header>
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
