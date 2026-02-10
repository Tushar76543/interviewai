import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import "../App.css";

interface NavHeaderProps {
  showNav?: boolean;
}

export default function NavHeader({ showNav = true }: NavHeaderProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  if (!showNav || !user) return null;

  return (
    <header className="nav-header">
      <div className="nav-inner">
        <Link to="/dashboard" className="nav-logo">
          🧠 Interview AI
        </Link>
        <nav className="nav-links">
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/interview">Interview</Link>
          <Link to="/history">History</Link>
          <span className="nav-user">{user?.name || user?.email?.split("@")[0]}</span>
          <button onClick={handleLogout} className="btn-glass btn-logout">
            Logout
          </button>
        </nav>
      </div>
    </header>
  );
}
