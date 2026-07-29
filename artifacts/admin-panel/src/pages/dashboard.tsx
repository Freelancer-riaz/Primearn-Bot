import { BarChart3, Users, Activity, TrendingUp } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="space-y-8" data-testid="page-dashboard">
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-sm">
          Platform overview and core metrics
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">Total Revenue</h3>
            <div className="p-2 bg-primary/10 rounded-md">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
          </div>
          <p className="text-2xl font-semibold">$0.00</p>
          <div className="mt-2 text-xs text-muted-foreground">Analytics coming soon</div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">Active Users</h3>
            <div className="p-2 bg-primary/10 rounded-md">
              <Users className="h-4 w-4 text-primary" />
            </div>
          </div>
          <p className="text-2xl font-semibold">0</p>
          <div className="mt-2 text-xs text-muted-foreground">Analytics coming soon</div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">Pending Tasks</h3>
            <div className="p-2 bg-primary/10 rounded-md">
              <Activity className="h-4 w-4 text-primary" />
            </div>
          </div>
          <p className="text-2xl font-semibold">0</p>
          <div className="mt-2 text-xs text-muted-foreground">Analytics coming soon</div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">Success Rate</h3>
            <div className="p-2 bg-primary/10 rounded-md">
              <BarChart3 className="h-4 w-4 text-primary" />
            </div>
          </div>
          <p className="text-2xl font-semibold">0%</p>
          <div className="mt-2 text-xs text-muted-foreground">Analytics coming soon</div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground shadow-sm mt-8">
        <Activity className="h-8 w-8 mx-auto mb-3 opacity-50" />
        <h3 className="text-lg font-medium text-foreground mb-1">Detailed Analytics</h3>
        <p className="text-sm max-w-sm mx-auto">
          Comprehensive charting and deeper insights are currently in development.
        </p>
      </div>
    </div>
  );
}
