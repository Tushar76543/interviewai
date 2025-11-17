import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// ✅ Import AuthProvider
import { AuthProvider } from "./auth/AuthContext";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Wrap the ENTIRE app */}
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);
