import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../../context/AuthContext";
import { Spinner } from "../ui/Misc";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="full-page-loader">
        <Spinner label="Loading Matcha" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const editableWhileIncomplete = ["/onboarding", "/settings", "/profile/me"];
  if (!user.complete && !editableWhileIncomplete.includes(location.pathname)) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}

export function GuestRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="full-page-loader">
        <Spinner label="Loading Matcha" />
      </div>
    );
  }
  if (user) return <Navigate to="/discover" replace />;
  return <>{children}</>;
}
