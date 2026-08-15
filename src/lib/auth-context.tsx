import React, { createContext, useContext, useState, useEffect } from "react";

export interface UserSession {
  id: string;
  email: string;
  name?: string;
  username?: string;
  role: "public" | "district_admin" | "hospital_coordinator" | "triage_staff" | "ambulance_crew";
  hospital_id?: string | null;
  unit_id?: string | null;
  picture?: string | null;
}

interface AuthContextType {
  token: string | null;
  user: UserSession | null;
  role: string | null;
  isPublicAuth: boolean;
  isStaffAuth: boolean;
  loginGoogle: (idToken: string) => Promise<UserSession>;
  loginStaff: (usernameOrEmail: string, password: string) => Promise<UserSession>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = "urhealth_auth_token";
const USER_KEY = "urhealth_auth_user";
const API_BASE = (import.meta.env["VITE_API_URL"] as string) || "http://localhost:8000";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      return localStorage.getItem(TOKEN_KEY);
    }
    return null;
  });

  const [user, setUser] = useState<UserSession | null>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      const stored = localStorage.getItem(USER_KEY);
      try {
        return stored ? JSON.parse(stored) : null;
      } catch {
        return null;
      }
    }
    return null;
  });

  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    }
  }, [token]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      if (user) {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(USER_KEY);
      }
    }
  }, [user]);

  const loginGoogle = async (idToken: string): Promise<UserSession> => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: idToken }),
      });

      if (res.ok) {
        const data = await res.json();
        setToken(data.access_token);
        setUser(data.user);
        return data.user;
      }
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || "Google authentication failed.");
    } catch (err: any) {
      if (err.message && !err.message.includes("fetch") && err.message !== "Failed to fetch") {
        throw err;
      }
      throw new Error("Unable to reach the authentication server — please try again");
    }
  };

  const loginStaff = async (usernameOrEmail: string, password: string): Promise<UserSession> => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/staff/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username_or_email: usernameOrEmail, password }),
      });

      if (res.ok) {
        const data = await res.json();
        setToken(data.access_token);
        setUser(data.user);
        return data.user;
      }
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || "Invalid staff credentials.");
    } catch (err: any) {
      if (err.message && !err.message.includes("fetch") && err.message !== "Failed to fetch") {
        throw err;
      }
      throw new Error("Unable to reach the authentication server — please try again");
    }
  };


  const logout = () => {
    setToken(null);
    setUser(null);
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  };

  const role = user?.role || null;
  const isPublicAuth = role === "public";
  const isStaffAuth = role ? ["district_admin", "hospital_coordinator", "triage_staff", "ambulance_crew"].includes(role) : false;

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        role,
        isPublicAuth,
        isStaffAuth,
        loginGoogle,
        loginStaff,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
