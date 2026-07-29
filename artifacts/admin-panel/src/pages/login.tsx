import { useState } from "react";
import type { FormEvent } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const [secret, setSecret] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
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
        description: "Welcome to the PrimeEarn Admin Panel.",
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
    <div className="min-h-[100dvh] flex items-center justify-center bg-background" data-testid="page-login">
      <div className="w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="h-12 w-12 bg-primary rounded-xl flex items-center justify-center mb-4 shadow-sm border border-primary/20">
            <Shield className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">PrimeEarn Cockpit</h1>
          <p className="text-sm text-muted-foreground mt-2">Enter admin secret to access the platform</p>
        </div>

        <div className="bg-card border border-border rounded-xl shadow-sm p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="secret" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                Admin Secret
              </label>
              <input
                id="secret"
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Enter secret key..."
                disabled={isSubmitting}
                data-testid="input-secret"
                autoFocus
              />
            </div>
            <Button 
              type="submit" 
              className="w-full" 
              disabled={isSubmitting || !secret}
              data-testid="button-submit-login"
            >
              {isSubmitting ? "Verifying..." : "Authenticate"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
