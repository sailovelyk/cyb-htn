'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi } from '@/lib/api';

interface User {
  id: string;
  username: string;
  email: string;
  role: 'ADMIN' | 'ANALYST' | 'VIEWER';
  full_name?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('aegislog_token');
    const storedUser = localStorage.getItem('aegislog_user');
    if (token && storedUser) {
      try {
        // eslint-disable-next-line
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem('aegislog_token');
        localStorage.removeItem('aegislog_user');
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (username: string, password: string) => {
    const res = await authApi.login(username, password);
    const { access_token, user: userData } = res.data;
    localStorage.setItem('aegislog_token', access_token);
    localStorage.setItem('aegislog_user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore — clear state regardless
    }
    localStorage.removeItem('aegislog_token');
    localStorage.removeItem('aegislog_user');
    setUser(null);
    // eslint-disable-next-line
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
