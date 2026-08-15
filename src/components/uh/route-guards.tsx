import React, { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "../../lib/auth-context";
import { Activity, ShieldAlert, LogIn, Home } from "lucide-react";
import { toast } from "sonner";

export const PublicAuthRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isPublicAuth, isStaffAuth, loginGoogle } = useAuth();
  const [loading, setLoading] = useState(false);

  if (isPublicAuth || isStaffAuth) {
    return <>{children}</>;
  }

  const handleGoogleSuccess = async (credentialResponse: any) => {
    if (!credentialResponse.credential) {
      toast.error("Google Sign-In failed: No ID token returned");
      return;
    }
    setLoading(true);
    try {
      const session = await loginGoogle(credentialResponse.credential);
      toast.success(`Signed in as ${session.name || session.email}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to authenticate with Google");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="command-surface border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" aria-hidden />
              <span className="font-display text-lg font-semibold tracking-tight">UrHealth</span>
            </Link>
            <Link
              to="/"
              className="flex items-center gap-1.5 rounded-md border border-sidebar-border bg-sidebar-accent/50 px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-sidebar-accent transition-colors"
            >
              <Home className="h-3.5 w-3.5 text-primary" />
              <span>Home</span>
            </Link>
          </div>

          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
            Public Surface
          </span>
        </div>
      </header>

      <main className="mx-auto flex max-w-md flex-col items-center justify-center px-4 py-16 text-center">
        <div className="rounded-full bg-primary/10 p-4 text-primary">
          <Activity className="h-10 w-10" />
        </div>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">Sign in to Search</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          To search for family members or view reunification status, please sign in with Google.
          No password to create or manage — identity verification is required for access auditing.
        </p>

        <div className="mt-8 w-full rounded-xl border border-border bg-card p-6 shadow-sm flex flex-col items-center justify-center min-h-[140px]">
          {loading ? (
            <p className="text-sm font-semibold text-muted-foreground animate-pulse">Verifying Google Identity...</p>
          ) : (
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => toast.error("Google Sign-In prompt failed or closed")}
              useOneTap
              theme="outline"
              size="large"
              width="100%"
            />
          )}

          <p className="mt-6 text-xs text-muted-foreground">
            Staff or Emergency Personnel? <Link to="/staff/login" className="text-primary underline">Log in here</Link>
          </p>
        </div>
      </main>
    </div>
  );
};


export const StaffRoute: React.FC<{
  children: React.ReactNode;
  allowedRoles?: string[];
  requiredHospitalId?: string;
}> = ({ children, allowedRoles, requiredHospitalId }) => {
  const { isStaffAuth, user, role } = useAuth();
  const navigate = useNavigate();

  if (!isStaffAuth || !user || !role) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 text-center">
        <div className="rounded-full bg-destructive/10 p-4 text-destructive">
          <ShieldAlert className="h-10 w-10" />
        </div>
        <h1 className="mt-4 text-2xl font-bold">Staff Access Required</h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          This operation console is restricted to authorized hospital and ambulance staff.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => navigate({ to: "/staff/login" })}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <LogIn className="h-4 w-4" /> Go to Staff Login
          </button>
          <Link
            to="/"
            className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-semibold hover:bg-accent"
          >
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 text-center">
        <div className="rounded-full bg-warning/10 p-4 text-warning">
          <ShieldAlert className="h-10 w-10" />
        </div>
        <h1 className="mt-4 text-2xl font-bold">Unauthorized Role</h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Your role <code className="bg-muted px-1.5 py-0.5 rounded font-mono">{role}</code> does not have access to this screen.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            to="/"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  if (requiredHospitalId && role === "hospital_coordinator" && user.hospital_id && user.hospital_id !== requiredHospitalId) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 text-center">
        <div className="rounded-full bg-warning/10 p-4 text-warning">
          <ShieldAlert className="h-10 w-10" />
        </div>
        <h1 className="mt-4 text-2xl font-bold">Hospital Scope Mismatch</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          You are logged in as Coordinator for hospital <code className="bg-muted px-1.5 py-0.5 rounded font-mono">{user.hospital_id}</code>.
          You cannot manage hospital <code className="bg-muted px-1.5 py-0.5 rounded font-mono">{requiredHospitalId}</code>.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            to={`/hospital/${user.hospital_id}` as any}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Go to My Hospital ({user.hospital_id})
          </Link>
          <Link
            to="/"
            className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-semibold hover:bg-accent"
          >
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
