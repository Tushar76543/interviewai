import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import "../styles/app-modern.css";

export default function ProtectedRoute({ children }: { children: React.JSX.Element }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-modern-theme">
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "100vh",
            color: "var(--slate-100)",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                margin: "0 auto 1rem",
                border: "3px solid var(--slate-500)",
                borderTopColor: "var(--primary-500)",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return <div className="app-modern-theme">{children}</div>;
}
