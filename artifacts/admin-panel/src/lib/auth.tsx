import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { verifyAuth } from "./api";

interface AuthContextType {
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (secret: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem("admin_token");
      if (storedToken) {
        try {
          await verifyAuth(storedToken);
          setToken(storedToken);
          setIsAuthenticated(true);
        } catch (error) {
          console.error("Auth verification failed during initialization:", error);
          localStorage.removeItem("admin_token");
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (secret: string) => {
    try {
      await verifyAuth(secret);
      localStorage.setItem("admin_token", secret);
      setToken(secret);
      setIsAuthenticated(true);
    } catch (error) {
      throw new Error("Invalid ADMIN_SECRET");
    }
  };

  const logout = () => {
    localStorage.removeItem("admin_token");
    setToken(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ token, isAuthenticated, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
