import type { ReactNode } from "react";
import { PanelProvider, usePanels } from "@/contexts/PanelContext";
import { ChatPanel } from "../chat/ChatPanel";
import { PanelTriggerButton } from "./PanelTriggerButton";
import { Sidebar } from "./Sidebar";

function AppShellInner({ children }: { children: ReactNode }) {
  const { sidebarOpen, chatOpen, closeSidebar, closeChat } = usePanels();

  const anyOpen = sidebarOpen || chatOpen;

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-primary)]">
      <Sidebar />

      {/* Backdrop */}
      {anyOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 transition-opacity"
          onClick={() => {
            closeSidebar();
            closeChat();
          }}
        />
      )}

      {/* Main content with animated margins */}
      <main
        className="flex-1 overflow-y-auto p-6 transition-[margin] duration-300 ease-in-out"
        style={{
          marginLeft: sidebarOpen ? 280 : 0,
          marginRight: chatOpen ? 400 : 0,
        }}
      >
        {children}
      </main>

      <ChatPanel />

      {/* Edge trigger buttons */}
      <PanelTriggerButton side="left" />
      <PanelTriggerButton side="right" />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <PanelProvider>
      <AppShellInner>{children}</AppShellInner>
    </PanelProvider>
  );
}
