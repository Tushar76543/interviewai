import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

export default function ProtectedRoute({ children }: { children: React.JSX.Element }) {
  const { user, loading } = useAuth();

  // Show loading while checking authentication
  if (loading) {
    return (
      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        color: "var(--light-100)"
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontSize: "2rem",
            marginBottom: "1rem",
            animation: "pulse 1.5s ease-in-out infinite"
          }}>
            🔄
          </div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!user) return <Navigate to="/login" replace />;

  return children;
}

