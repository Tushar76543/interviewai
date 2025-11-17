import { useState } from "react";
import { signup } from "../api/auth";
import { useAuth } from "../auth/AuthContext";
import { useNavigate } from "react-router-dom";

export default function Signup() {
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    const res = await signup(name, email, password);
    if (res.message) {
      setErr(res.message);
    } else {
      setUser(res.user);
      navigate("/dashboard");
    }
  };

  return (
    <div>
      <h1>Signup</h1>

      <form onSubmit={submit}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" />
        <button>Signup</button>
      </form>

      {err && <p style={{ color: "red" }}>{err}</p>}
    </div>
  );
}
