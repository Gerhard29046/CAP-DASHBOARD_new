import React, { createContext, useState, useContext, useEffect } from "react";

const AuthContext = createContext();

const demoUsers = [
  {
    id: 1,
    full_name: "Admin User",
    email: "admin@connoisseurauto.co.za",
    password: "admin123",
    role: "Admin",
  },
  {
    id: 2,
    full_name: "Technician User",
    email: "technician@connoisseurauto.co.za",
    password: "tech123",
    role: "Technician",
  },
  {
    id: 3,
    full_name: "Manager User",
    email: "manager@connoisseurauto.co.za",
    password: "manager123",
    role: "Manager",
  },
];

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem("demo_user");

    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      setUser(parsedUser);
      setIsAuthenticated(true);
    }

    setIsLoadingAuth(false);
    setAuthChecked(true);
  }, []);

  const login = async (email, password) => {
    setAuthError(null);

    const foundUser = demoUsers.find(
      (demoUser) =>
        demoUser.email.toLowerCase() === email.toLowerCase() &&
        demoUser.password === password
    );

    if (!foundUser) {
      setAuthError({
        type: "invalid_credentials",
        message: "Invalid email or password",
      });
      return false;
    }

    const { password: _, ...safeUser } = foundUser;

    localStorage.setItem("demo_user", JSON.stringify(safeUser));
    setUser(safeUser);
    setIsAuthenticated(true);

    return true;
  };

  const logout = () => {
    localStorage.removeItem("demo_user");
    setUser(null);
    setIsAuthenticated(false);
  };

  const navigateToLogin = () => {
    window.location.href = "/login";
  };

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
        checkUserAuth: async () => {},
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