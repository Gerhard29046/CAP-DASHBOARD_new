import React, { createContext, useState, useContext, useEffect } from "react";

const AuthContext = createContext();

const API_URL = import.meta.env.VITE_API_BASE_URL;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    checkUserAuth();
  }, []);

  const checkUserAuth = async () => {
    const token = localStorage.getItem("auth_token");

    if (!token) {
      setUser(null);
      setIsAuthenticated(false);
      setIsLoadingAuth(false);
      setAuthChecked(true);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/me`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Session expired");
      }

      const data = await response.json();

      setUser(data.user);
      setIsAuthenticated(true);
    } catch (error) {
      localStorage.removeItem("auth_token");
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  const login = async (email, password) => {
    setAuthError(null);

    try {
      const response = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setAuthError({
          type: "invalid_credentials",
          message:
            data?.message ||
            data?.errors?.email?.[0] ||
            "Invalid email or password",
        });

        return false;
      }

      localStorage.setItem("auth_token", data.token);
      setUser(data.user);
      setIsAuthenticated(true);

      return true;
    } catch (error) {
      setAuthError({
        type: "server_error",
        message: "Could not connect to the login server.",
      });

      return false;
    }
  };

  const logout = async () => {
    const token = localStorage.getItem("auth_token");

    try {
      if (token) {
        await fetch(`${API_URL}/logout`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
      }
    } catch (error) {
      console.error("Logout failed:", error);
    }

    localStorage.removeItem("auth_token");
    setUser(null);
    setIsAuthenticated(false);
    window.location.href = "/login";
  };

  const navigateToLogin = () => {
    window.location.href = "/login";
  };

  const hasPermission = (key) => user?.effective_permissions?.includes(key) ?? false;
  const hasAnyPermission = (keys) => keys.some(hasPermission);
  const hasAllPermissions = (keys) => keys.every(hasPermission);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings: false,
        authError,
        appPublicSettings: null,
        authChecked,
        login,
        logout,
        navigateToLogin,
        checkUserAuth,
        refreshCurrentUser: checkUserAuth,
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
        checkAppState: async () => {},
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
