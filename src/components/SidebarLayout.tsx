import React from "react";
import { Users } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useAutoSync } from "@/hooks/useAutoSync";
import { usePresence } from "@/hooks/usePresence";
import { ThemeToggle } from "@/components/ThemeToggle";

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  useAutoSync();
  usePresence();
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="h-14 flex items-center justify-between gap-3 border-b border-border bg-card px-4 shrink-0">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                  <Users className="h-4 w-4 text-primary-foreground" />
                </div>
                <span className="text-base font-bold text-foreground">Vedantu Attendance</span>
              </div>
            </div>
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto w-full">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
