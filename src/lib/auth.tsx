import React, { createContext, useContext, useEffect, useState } from "react";
import { login as apiLogin, register as apiRegister, ApiUser } from "./api";

type User = ApiUser;

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (email: string, password: string, displayName?: string, username?: string) => Promise<User>;
  logout: () => void;
  setUser: (u: User) => void;
}

const AuthContext = createContext<AuthState | null>(null);

const TOKEN_KEY = "streamio.auth.token";
const USER_KEY = "streamio.auth.user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUserState(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const persist = (t: string, u: User) => {
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setToken(t);
    setUserState(u);
  };

  const login = async (email: string, password: string) => {
    const res = await apiLogin(email, password);
    persist(res.token, res.user);
    return res.user as User;
  };

  const register = async (email: string, password: string, displayName?: string, username?: string) => {
    const res = await apiRegister(email, password, displayName, username);
    persist(res.token, res.user);
    return res.user as User;
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUserState(null);
  };

  const setUser = (u: User) => {
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setUserState(u);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
