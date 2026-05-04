import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, storage } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [hasUser, setHasUser] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const status = await api('/api/auth/status');
        setHasUser(status.hasUser);
        if (!status.hasUser) {
          storage.clear();
          setUser(null);
        } else if (storage.getToken()) {
          setUser(status.user || { username: 'User' });
        } else {
          setUser(null);
        }
      } catch {
        storage.clear();
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (username, password, isRegister = false) => {
    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
    const data = await api(endpoint, { method: 'POST', body: JSON.stringify({ username, password }) });
    storage.setToken(data.token);
    setUser(data.user);
    setHasUser(true);
  };

  const logout = () => {
    storage.clear();
    setUser(null);
  };

  const value = useMemo(() => ({ user, hasUser, loading, login, logout }), [user, hasUser, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
