import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User, AuthState } from '../types';
import { authApi } from '../api/client';
import toast from 'react-hot-toast';

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  isRole: (...roles: string[]) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
  });

  // Load from localStorage on mount
  useEffect(() => {
    const token = localStorage.getItem('acxiom_token');
    const userStr = localStorage.getItem('acxiom_user');
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr) as User;
        setState({ user, token, isAuthenticated: true });
      } catch {
        localStorage.removeItem('acxiom_token');
        localStorage.removeItem('acxiom_user');
      }
    }
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    try {
      const response = await authApi.login({ username, password });
      const { token, user } = response.data;
      localStorage.setItem('acxiom_token', token);
      localStorage.setItem('acxiom_user', JSON.stringify(user));
      setState({ user, token, isAuthenticated: true });
      return true;
    } catch (err: any) {
      const message = err.response?.data?.message || 'Login failed. Please try again.';
      toast.error(message);
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    authApi.logout().catch(() => {});
    localStorage.removeItem('acxiom_token');
    localStorage.removeItem('acxiom_user');
    setState({ user: null, token: null, isAuthenticated: false });
  }, []);

  const isRole = useCallback((...roles: string[]): boolean => {
    if (!state.user) return false;
    return roles.includes(state.user.role);
  }, [state.user]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, isRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
