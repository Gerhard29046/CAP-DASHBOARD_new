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

      const contentType = response.headers.get("content-type") || "";
      const data = contentType.includes("application/json")
        ? await response.json()
        : {};

      if (!response.ok) {
        const validationMessage = data?.errors
          ? Object.values(data.errors).flat().join(" ")
          : null;
        const messages = {
          401: "Incorrect email address or password.",
          403: "This account does not have permission to sign in.",
          404: "Login endpoint not found.",
          419: "Authentication session or CSRF configuration error.",
          429: "Too many login attempts. Please wait a minute and try again.",
        };
        const message = response.status === 422
          ? validationMessage || data?.message || "Please check the login details."
          : response.status >= 500
            ? "The server encountered an error. Please try again."
            : messages[response.status] || data?.message || `Login failed (${response.status}).`;

        if (import.meta.env.DEV) {
          console.error("Login request failed", {
            status: response.status,
            url: response.url,
            errors: data?.errors || null,
          });
        }

        setAuthError({
          type: `http_${response.status}`,
          message,
        });

        return false;
      }

      if (!data?.token || !data?.user) {
        if (import.meta.env.DEV) {
          console.error("Login response was missing the token or user", {
            status: response.status,
            url: response.url,
          });
        }
        setAuthError({
          type: "invalid_server_response",
          message: "The login server returned an invalid response.",
        });
        return false;
      }

      localStorage.setItem("auth_token", data.token);
      setUser(data.user);
      setIsAuthenticated(true);

      return true;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Login network request failed", {
          url: `${API_URL}/login`,
          name: error?.name,
          message: error?.message,
        });
      }
      setAuthError({
        type: "network_error",
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
