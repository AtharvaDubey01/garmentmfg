import React, { createContext, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { screenForPath } from '../utils/screens';

export interface User {
  id: number;
  empid: number;
  username: string; // employee code
  name: string;
  isAdmin: boolean;
  rights: Record<string, string[]>; // { screenKey: ['view', 'create', ...] }, set on Admin > Create Login
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  /** Can the logged-in user do `action` on `screen`? Admins can do everything. */
  can: (screen: string, action: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Check current session from /api/auth/me on initial app mount
  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/me', {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, message: data.message || 'Login failed' };
      }

      setUser(data.user);
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || 'Network error during login' };
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (err) {
      // Ignore network errors on logout
    } finally {
      setUser(null);
    }
  };

  const can = (screen: string, action: string) =>
    !!user && (user.isAdmin || (user.rights?.[screen] || []).includes(action));

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, checkAuth, can }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

/**
 * Rights on the screen of the current page (from its address), e.g. in a list page:
 *   const rights = useScreenRights();  if (rights.delete) ...
 * Pages that don't belong to a screen get all rights (nothing to limit).
 */
export const useScreenRights = () => {
  const { can } = useAuth();
  const screen = screenForPath(useLocation().pathname);
  const has = (action: string) => (screen ? can(screen, action) : true);
  return {
    screen,
    view: has('view'),
    create: has('create'),
    edit: has('edit'),
    delete: has('delete'),
    print: has('print'),
    has,
  };
};
