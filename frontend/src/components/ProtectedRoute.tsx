import type { ReactElement } from "react";
import { Navigate } from "react-router-dom";

type ProtectedRouteProps = {
  token: string | null;
  children: ReactElement;
};

export default function ProtectedRoute({ token, children }: ProtectedRouteProps) {
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
