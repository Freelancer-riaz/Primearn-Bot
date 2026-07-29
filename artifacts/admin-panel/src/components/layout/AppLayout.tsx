import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, ListTree, LogOut, Shield } from "lucide-react";
import { useAuth } from "@/lib/auth";

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="min-h-screen flex w-full bg-background" data-testid="layout-container">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 bg-sidebar border-r border-sidebar-border text-sidebar-foreground flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border bg-sidebar-accent/50">
          <Shield className="h-6 w-6 text-sidebar-primary mr-3" />
          <span className="font-semibold text-lg tracking-tight">PrimeEarn Admin</span>
        </div>
        
        <div className="flex-1 py-6 px-4 space-y-1">
          <Link href="/dashboard" className="block w-full" data-testid="link-dashboard">
            <div className={`flex items-center px-3 py-2.5 rounded-md transition-colors ${
              location === '/dashboard' 
                ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium' 
                : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            }`}>
              <LayoutDashboard className="h-5 w-5 mr-3" />
              Overview
            </div>
          </Link>
          
          <Link href="/categories" className="block w-full" data-testid="link-categories">
            <div className={`flex items-center px-3 py-2.5 rounded-md transition-colors ${
              location === '/categories' 
                ? 'bg-sidebar-primary text-sidebar-primary-foreground font-medium' 
                : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            }`}>
              <ListTree className="h-5 w-5 mr-3" />
              Categories
            </div>
          </Link>
        </div>

        <div className="p-4 border-t border-sidebar-border">
          <button
            onClick={handleLogout}
            className="flex w-full items-center px-3 py-2.5 rounded-md text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            data-testid="button-signout"
          >
            <LogOut className="h-5 w-5 mr-3" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 flex items-center justify-between px-8 border-b border-border bg-card">
          <h1 className="text-xl font-semibold text-foreground tracking-tight" data-testid="text-page-title">
            {location === '/dashboard' ? 'Dashboard' : location === '/categories' ? 'Categories' : 'Admin'}
          </h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 bg-secondary px-3 py-1.5 rounded-full">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
              <span className="font-medium">System Online</span>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
