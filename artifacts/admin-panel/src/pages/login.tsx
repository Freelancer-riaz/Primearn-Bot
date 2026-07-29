import { useState } from "react";
import type { FormEvent } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Shield, Lock, Eye, EyeOff, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [secret, setSecret] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  if (isAuthenticated) {
    setLocation("/dashboard");
    return null;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!secret) return;

    setIsSubmitting(true);
    try {
      await login(secret);
      toast({
        title: "Authenticated",
        description: "Welcome to the Primearn Admin Panel.",
      });
      setLocation("/dashboard");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Authentication Failed",
        description: error instanceof Error ? error.message : "Invalid credentials",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-[100dvh] flex flex-col items-center justify-center bg-background px-4 py-8"
      data-testid="page-login"
    >
      {/* Card */}
      <div className="w-full max-w-[430px]">

        {/* Logo + Heading */}
        <div className="flex flex-col items-center mb-8">
          {/* Logo icon — ~20% larger than before (was h-12 w-12, now h-14 w-14) */}
          <div className="h-14 w-14 bg-primary rounded-2xl flex items-center justify-center mb-5 shadow-md border border-primary/20">
            <Shield className="h-7 w-7 text-primary-foreground" />
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Primearn Admin Panel
          </h1>
          <p className="text-sm text-muted-foreground mt-2 text-center max-w-xs">
            Secure administrator access to the Primearn platform.
          </p>
        </div>

        {/* Login card */}
        <div
          className="bg-card border border-border rounded-[18px] shadow-lg p-8"
          style={{ boxShadow: "0 8px 32px 0 rgba(0,0,0,0.10), 0 1.5px 6px 0 rgba(0,0,0,0.06)" }}
        >
          {/* Badge */}
          <div className="flex justify-center mb-6">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium tracking-wide border border-primary/20">
              <Lock className="h-3 w-3" />
              Administrator Login
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Input */}
            <div className="space-y-2">
              <label
                htmlFor="secret"
                className="block text-sm font-medium text-foreground"
              >
                Admin Secret
              </label>

              <div className="relative">
                {/* Lock icon on the left */}
                <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                </span>

                <input
                  id="secret"
                  type={showSecret ? "text" : "password"}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder="Enter your ADMIN_SECRET"
                  disabled={isSubmitting}
                  data-testid="input-secret"
                  autoFocus
                  className="
                    flex h-11 w-full rounded-lg border border-input bg-background
                    pl-10 pr-10 py-2 text-sm text-foreground
                    placeholder:text-muted-foreground
                    transition-colors duration-150
                    focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary
                    disabled:cursor-not-allowed disabled:opacity-50
                  "
                />

                {/* Show / Hide toggle on the right */}
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={showSecret ? "Hide secret" : "Show secret"}
                  onClick={() => setShowSecret((v) => !v)}
                  className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showSecret ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isSubmitting || !secret}
              data-testid="button-submit-login"
              className="
                w-full h-11 flex items-center justify-center gap-2
                rounded-lg bg-primary text-primary-foreground
                text-sm font-semibold tracking-wide
                shadow-sm
                transition-all duration-150
                hover:bg-primary/90 hover:shadow-md
                active:scale-[0.98] active:bg-primary/95
                disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:scale-100
                focus:outline-none focus:ring-2 focus:ring-primary/60 focus:ring-offset-2
              "
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifying…
                </>
              ) : (
                "Sign In"
              )}
            </button>

            {/* Security note */}
            <p className="text-center text-xs text-muted-foreground pt-1">
              🔒 Authorized administrators only.
            </p>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          © 2026 Primearn. All rights reserved.
        </p>
      </div>
    </div>
  );
}
