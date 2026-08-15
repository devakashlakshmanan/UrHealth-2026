import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "../lib/auth-context";
import { Activity, ShieldCheck, Lock, UserCheck, Home } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/staff/login")({
  component: StaffLoginComponent,
});

function StaffLoginComponent() {
  const { loginStaff } = useAuth();
  const navigate = useNavigate();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const performLogin = async (u: string, p: string) => {
    setLoading(true);
    try {
      const user = await loginStaff(u, p);
      toast.success(`Logged in as ${user.name || user.username || user.email} (${user.role})`);
      
      // Redirect based on provisioned role
      if (user.role === "district_admin") {
        navigate({ to: "/command-center" });
      } else if (user.role === "hospital_coordinator") {
        navigate({ to: `/hospital/${user.hospital_id || "h1"}` as any });
      } else if (user.role === "triage_staff") {
        navigate({ to: "/triage/new" });
      } else if (user.role === "ambulance_crew") {
        navigate({ to: `/ambulance/${user.unit_id || "u1"}` as any });
      } else {
        navigate({ to: "/" });
      }
    } catch (err: any) {
      toast.error(err.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performLogin(usernameOrEmail, password);
  };

  const setAndLoginDemo = (u: string, p: string) => {
    setUsernameOrEmail(u);
    setPassword(p);
    performLogin(u, p);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="command-surface border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-emerald-300" aria-hidden />
              <span className="font-display text-lg font-semibold tracking-tight text-white">UrHealth Ops</span>
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-bold text-emerald-950 shadow-sm hover:bg-emerald-50 hover:text-emerald-900 transition-all border border-emerald-200"
            >
              <Home className="h-4 w-4 text-emerald-600 stroke-[2.5]" />
              <span>Home</span>
            </Link>
          </div>

          <span className="rounded-full bg-emerald-500/20 border border-emerald-400/40 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-100">
            Staff Portal
          </span>
        </div>
      </header>

      <main className="mx-auto flex max-w-md flex-col items-center justify-center px-4 py-12">
        <div className="rounded-full bg-primary/10 p-4 text-primary">
          <ShieldCheck className="h-10 w-10" />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Staff Credentials Login</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Enter your provisioned hospital or ambulance unit account credentials to access operational consoles.
        </p>

        <div className="mt-6 w-full rounded-xl border border-border bg-card p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="block text-xs font-medium text-muted-foreground uppercase">Username or Email</Label>
              <input
                type="text"
                required
                value={usernameOrEmail}
                onChange={(e) => setUsernameOrEmail(e.target.value)}
                placeholder="e.g. admin or coordinator.h1@urhealth.org"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <Label className="block text-xs font-medium text-muted-foreground uppercase">Password</Label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            >
              <Lock className="h-4 w-4" />
              {loading ? "Authenticating..." : "Sign In to Staff Console"}
            </button>
          </form>

          <div className="mt-8 border-t border-border pt-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <UserCheck className="h-3.5 w-3.5 text-primary" /> Click Any Demo Account to Log In
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setAndLoginDemo("admin", "admin123")}
                className="rounded-md border border-border p-2.5 text-left hover:bg-accent transition-colors"
              >
                <div className="font-semibold text-foreground">District Admin</div>
                <div className="text-muted-foreground text-[11px]">admin / admin123</div>
              </button>

              <button
                type="button"
                onClick={() => setAndLoginDemo("coord_h1", "coord123")}
                className="rounded-md border border-border p-2.5 text-left hover:bg-accent transition-colors"
              >
                <div className="font-semibold text-foreground">Hospital Coord (h1)</div>
                <div className="text-muted-foreground text-[11px]">coord_h1 / coord123</div>
              </button>

              <button
                type="button"
                onClick={() => setAndLoginDemo("triage_staff", "triage123")}
                className="rounded-md border border-border p-2.5 text-left hover:bg-accent transition-colors"
              >
                <div className="font-semibold text-foreground">Triage Staff</div>
                <div className="text-muted-foreground text-[11px]">triage_staff / triage123</div>
              </button>

              <button
                type="button"
                onClick={() => setAndLoginDemo("crew_u1", "crew123")}
                className="rounded-md border border-border p-2.5 text-left hover:bg-accent transition-colors"
              >
                <div className="font-semibold text-foreground">Ambulance Crew</div>
                <div className="text-muted-foreground text-[11px]">crew_u1 / crew123</div>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <label className={className}>{children}</label>;
}
