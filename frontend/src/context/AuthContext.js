import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cacheSet, cacheRead } from "@/lib/offline";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("sk_token");
    if (!token) return setLoading(false);
    api.get("/auth/me")
      .then((r) => { setUser(r.data); cacheSet("me", r.data); })
      .catch(async (e) => {
        if (e.response?.status === 401 || e.response?.status === 403) {
          localStorage.removeItem("sk_token");
        } else {
          const cached = await cacheRead("me");
          if (cached) setUser(cached);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("sk_token", data.token);
    cacheSet("me", data.user);
    setUser(data.user);
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    localStorage.setItem("sk_token", data.token);
    cacheSet("me", data.user);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem("sk_token");
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
