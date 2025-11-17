import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div style={{ textAlign: "center", marginTop: 40 }}>
      <h1>Welcome {user?.name || user?.email}</h1>

      <button
        onClick={() => navigate("/interview")}
        style={{
          marginTop: 20,
          padding: "10px 20px",
          borderRadius: 8,
          background: "#2563eb",
          color: "white",
          border: "none",
        }}
      >
        Start Interview
      </button>
    </div>
  );
}
