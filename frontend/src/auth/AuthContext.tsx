import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getMe, logout as logoutApi } from "../api/auth";

interface User {
  _id: string;
  name: string;
  email: string;
  role?: string;
  createdAt?: string;
}

interface AuthContextType {
  user: User | null;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then((res) => {
        if (res.user) setUser(res.user);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutApi();
    } finally {
      localStorage.removeItem("token");
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};

