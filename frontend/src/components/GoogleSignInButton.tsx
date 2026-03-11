import { useEffect, useRef, useState } from "react";

interface GoogleSignInButtonProps {
  onSuccess: (credential: string) => void;
  disabled?: boolean;
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  theme?: "outline" | "filled_black" | "filled_blue";
  size?: "small" | "medium" | "large";
  shape?: "rectangular" | "pill" | "circle" | "square";
  className?: string;
}

const GOOGLE_SCRIPT_ID = "google-identity-services";
const GOOGLE_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "").trim();

const loadGoogleScript = () =>
  new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      if (window.google?.accounts?.id) {
        resolve();
      } else {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Google script failed to load")), {
          once: true,
        });
      }
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_SCRIPT_ID;
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google script failed to load"));
    document.head.appendChild(script);
  });

export default function GoogleSignInButton({
  onSuccess,
  disabled = false,
  text = "continue_with",
  theme = "outline",
  size = "large",
  shape = "pill",
  className = "",
}: GoogleSignInButtonProps) {
  const buttonContainerRef = useRef<HTMLDivElement | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    let active = true;

    loadGoogleScript()
      .then(() => {
        if (!active || !buttonContainerRef.current || !window.google?.accounts?.id) {
          return;
        }

        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            if (!response.credential) {
              return;
            }
            onSuccess(response.credential);
          },
          cancel_on_tap_outside: true,
        });

        buttonContainerRef.current.innerHTML = "";
        const targetWidth = Math.max(220, Math.min(420, Math.floor(buttonContainerRef.current.clientWidth || 320)));

        window.google.accounts.id.renderButton(buttonContainerRef.current, {
          theme,
          size,
          shape,
          text,
          width: targetWidth,
          logo_alignment: "left",
        });
      })
      .catch(() => {
        if (!active) return;
        setLoadError("Google Sign-In failed to load. Refresh and try again.");
      });

    return () => {
      active = false;
    };
  }, [onSuccess, shape, size, text, theme]);

  if (!GOOGLE_CLIENT_ID) {
    return null;
  }

  return (
    <div className={`oauth-block ${className}`.trim()} aria-disabled={disabled}>
      <div
        ref={buttonContainerRef}
        className="google-button-container"
        style={{ opacity: disabled ? 0.65 : 1, pointerEvents: disabled ? "none" : "auto" }}
      />
      {loadError && <p className="auth-google-error">{loadError}</p>}
    </div>
  );
}
