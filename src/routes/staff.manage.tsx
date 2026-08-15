import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserPlus, Users, ShieldCheck, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/uh/app-shell";
import { Button } from "@/components/ui/button";
import { StaffRoute } from "@/components/uh/route-guards";
import { api, type StaffAccountData } from "@/lib/api";

export const Route = createFileRoute("/staff/manage")({

  head: () => ({
    meta: [
      { title: "Manage Staff — UrHealth Command Center" },
      { name: "description", content: "Provision and manage hospital coordinators, triage staff, and ambulance crew accounts." },
    ],
  }),
  component: StaffManageGuarded,
});

function StaffManageGuarded() {
  return (
    <StaffRoute allowedRoles={["district_admin"]}>
      <StaffManageScreen />
    </StaffRoute>
  );
}

function StaffManageScreen() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("hospital_coordinator");
  const [hospitalId, setHospitalId] = useState<string>("h3");
  const [unitId, setUnitId] = useState<string>("u2");

  const accountsQuery = useQuery({
    queryKey: ["staff-accounts"],
    queryFn: api.getStaffAccounts,
  });

  const createMutation = useMutation({
    mutationFn: api.createStaffAccount,
    onSuccess: (newAcc) => {
      toast.success(`Provisioned staff account for @${newAcc.username}`);
      qc.invalidateQueries({ queryKey: ["staff-accounts"] });
      setEmail("");
      setUsername("");
      setPassword("");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create staff account");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      email: email.trim(),
      username: username.trim(),
      password,
      role,
      hospital_id: role === "hospital_coordinator" ? hospitalId : null,
      unit_id: role === "ambulance_crew" ? unitId : null,
    });
  };

  const accounts = accountsQuery.data ?? [];

  return (
    <AppShell
      role="District Admin"
      title="Staff Account Provisioning"
      subtitle="Create and manage authentication credentials for hospital coordinators, triage staff, and ambulance units."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        {/* Create Account Panel */}
        <div className="panel p-5">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <UserPlus className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Provision New Staff Account</h2>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Email Address
              </label>
              <input
                type="email"
                required
                placeholder="coordinator.h3@urhealth.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Username
              </label>
              <input
                type="text"
                required
                placeholder="coord_h3"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Password
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Assigned Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="hospital_coordinator">Hospital Coordinator</option>
                <option value="ambulance_crew">Ambulance Crew</option>
                <option value="triage_staff">Triage Staff</option>
                <option value="district_admin">District Admin</option>
              </select>
            </div>

            {role === "hospital_coordinator" && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Assigned Hospital
                </label>
                <select
                  value={hospitalId}
                  onChange={(e) => setHospitalId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="h1">h1 — City General Hospital</option>
                  <option value="h2">h2 — St. Jude Trauma Center</option>
                  <option value="h3">h3 — Metro Emergency Center</option>
                  <option value="h4">h4 — Eastside Medical Hub</option>
                  <option value="h5">h5 — Northern District Care</option>
                </select>
              </div>
            )}

            {role === "ambulance_crew" && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Assigned Ambulance Unit
                </label>
                <select
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="u1">u1 — Rapid Response Alpha</option>
                  <option value="u2">u2 — Trauma Transport Bravo</option>
                  <option value="u3">u3 — Critical Care Charlie</option>
                </select>
              </div>
            )}

            <Button type="submit" disabled={createMutation.isPending} className="w-full mt-2">
              <UserPlus className="mr-2 h-4 w-4" />
              {createMutation.isPending ? "Creating Account..." : "Provision Account"}
            </Button>
          </form>
        </div>

        {/* Existing Accounts Table Panel */}
        <div className="panel p-5">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">Active Staff Roster ({accounts.length})</h2>
            </div>
            {accountsQuery.isFetching && <span className="text-xs text-muted-foreground animate-pulse">Refreshing...</span>}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">User</th>
                  <th className="py-2 pr-3 font-semibold">Role</th>
                  <th className="py-2 pr-3 font-semibold">Scope</th>
                  <th className="py-2 pr-3 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {accounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-muted/40 transition-colors">
                    <td className="py-3 pr-3">
                      <div className="font-medium font-mono text-foreground">{acc.username}</div>
                      <div className="text-xs text-muted-foreground">{acc.email}</div>
                    </td>
                    <td className="py-3 pr-3">
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        {acc.role}
                      </span>
                    </td>
                    <td className="py-3 pr-3 font-mono text-xs text-muted-foreground">
                      {acc.hospital_id ? (
                        <Link to="/hospital/$hospitalId" params={{ hospitalId: acc.hospital_id }} className="hover:underline text-primary">
                          {acc.hospital_id}
                        </Link>
                      ) : acc.unit_id ? (
                        <Link to="/ambulance/$unitId" params={{ unitId: acc.unit_id }} className="hover:underline text-primary">
                          {acc.unit_id}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3 pr-3 text-xs text-muted-foreground">
                      {new Date(acc.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
