import { createContext, useContext, useEffect, useState } from "react";
import { getMe } from "../api/auth";

interface AuthContextType {
  user: any | null;
  setUser: React.Dispatch<React.SetStateAction<any | null>>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any | null>(null);

  useEffect(() => {
    getMe().then((res) => {
      if (res.user) setUser(res.user);
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};
