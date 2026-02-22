import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

type PanelState = {
  sidebarOpen: boolean;
  chatOpen: boolean;
  toggleSidebar: () => void;
  toggleChat: () => void;
  openSidebar: () => void;
  closeSidebar: () => void;
  openChat: () => void;
  closeChat: () => void;
};

const PanelContext = createContext<PanelState | null>(null);

export function PanelProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const openSidebar = useCallback(() => setSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((p) => !p), []);

  const openChat = useCallback(() => setChatOpen(true), []);
  const closeChat = useCallback(() => setChatOpen(false), []);
  const toggleChat = useCallback(() => setChatOpen((p) => !p), []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        // Only allow Escape in input fields
        if (e.key !== "Escape") return;
      }

      if (e.key === "b" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        toggleSidebar();
      } else if (e.key === "j" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        toggleChat();
      } else if (e.key === "Escape") {
        if (chatOpen) {
          setChatOpen(false);
        } else if (sidebarOpen) {
          setSidebarOpen(false);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sidebarOpen, chatOpen, toggleSidebar, toggleChat]);

  return (
    <PanelContext.Provider
      value={{
        sidebarOpen,
        chatOpen,
        toggleSidebar,
        toggleChat,
        openSidebar,
        closeSidebar,
        openChat,
        closeChat,
      }}
    >
      {children}
    </PanelContext.Provider>
  );
}

export function usePanels() {
  const ctx = useContext(PanelContext);
  if (!ctx) throw new Error("usePanels must be used within a PanelProvider");
  return ctx;
}
