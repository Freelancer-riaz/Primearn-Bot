import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, ListTree, LogOut, Shield, Menu, X } from "lucide-react";
import { useAuth } from "@/lib/auth";

// ── Shared sidebar content (used by both desktop sidebar and mobile drawer) ──

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  const { logout } = useAuth();

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-sidebar-border bg-sidebar-accent/50">
        <Shield className="h-6 w-6 text-sidebar-primary mr-3 flex-shrink-0" />
        <span className="font-semibold text-lg tracking-tight">Primearn Admin</span>
      </div>

      {/* Nav links */}
      <div className="flex-1 py-6 px-4 space-y-1">
        <Link
          href="/dashboard"
          className="block w-full"
          data-testid="link-dashboard"
          onClick={onNavigate}
        >
          <div
            className={`flex items-center px-3 py-2.5 rounded-md transition-colors ${
              location === "/dashboard"
                ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            }`}
          >
            <LayoutDashboard className="h-5 w-5 mr-3 flex-shrink-0" />
            Overview
          </div>
        </Link>

        <Link
          href="/categories"
          className="block w-full"
          data-testid="link-categories"
          onClick={onNavigate}
        >
          <div
            className={`flex items-center px-3 py-2.5 rounded-md transition-colors ${
              location === "/categories"
                ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            }`}
          >
            <ListTree className="h-5 w-5 mr-3 flex-shrink-0" />
            Categories
          </div>
        </Link>
      </div>

      {/* Sign out */}
      <div className="p-4 border-t border-sidebar-border">
        <button
          onClick={() => {
            logout();
            onNavigate?.();
          }}
          className="flex w-full items-center px-3 py-2.5 rounded-md text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          data-testid="button-signout"
        >
          <LogOut className="h-5 w-5 mr-3 flex-shrink-0" />
          Sign Out
        </button>
      </div>
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Prevent body scroll while mobile drawer is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // Close drawer whenever the route changes
  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  const pageTitle =
    location === "/dashboard"
      ? "Dashboard"
      : location === "/categories"
        ? "Categories"
        : "Admin";

  return (
    <div
      className="min-h-screen flex w-full bg-background"
      data-testid="layout-container"
    >
      {/* ── Desktop Sidebar (≥1024px) ───────────────────────────────────────── */}
      <aside className="hidden lg:flex w-64 flex-shrink-0 bg-sidebar border-r border-sidebar-border text-sidebar-foreground flex-col">
        <SidebarContent />
      </aside>

      {/* ── Mobile Drawer + Backdrop (<1024px) ─────────────────────────────── */}

      {/* Backdrop — always in DOM, fades in/out */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden transition-opacity duration-200 ${
          mobileOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      {/* Drawer panel — always in DOM, slides in/out */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[280px] bg-sidebar border-r border-sidebar-border text-sidebar-foreground flex flex-col lg:hidden transition-transform duration-200 ease-out ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!mobileOpen}
      >
        {/* Close button inside drawer */}
        <button
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
          className="absolute top-4 right-4 p-1.5 rounded-md text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors z-10"
        >
          <X className="h-5 w-5" />
        </button>

        <SidebarContent onNavigate={() => setMobileOpen(false)} />
      </aside>

      {/* ── Main Content ────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 flex items-center justify-between px-4 sm:px-8 border-b border-border bg-card flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* Hamburger button — mobile only */}
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 rounded-md text-foreground/70 hover:bg-secondary hover:text-foreground transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>

            <h1
              className="text-xl font-semibold text-foreground tracking-tight"
              data-testid="text-page-title"
            >
              {pageTitle}
            </h1>
          </div>

          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 bg-secondary px-3 py-1.5 rounded-full">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
              <span className="font-medium hidden sm:inline">System Online</span>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-4 sm:p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
