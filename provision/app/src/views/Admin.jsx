import { getTeam } from '../lib/auth.js';
import { useApiData } from '../lib/useApiData.js';
import { SectionTitle, Empty, Badge } from '../components/ui.jsx';

const ROLE_LABEL = { admin: 'Admin', owner: 'Owner-operator', gm: 'General manager', beverage: 'Beverage director', floor: 'Floor lead' };
const DASH_LABEL = { overview: 'Overview', stock: 'Stock', vips: "Tonight's guests", admin: 'Users & access' };

// Read-only seat directory for the scaffold: who exists, what role, which dashboards they can
// open. Creating and re-permissioning users is the next slice — the store and routes behind
// this (userStore.js) already support it.
export default function Admin() {
  const { data, loading, error } = useApiData(getTeam);

  if (loading && !data) return <div className="t-mut py-10">Loading…</div>;
  if (error) return <Empty title="Could not load the directory" body={error} />;

  const team = data?.team || [];

  return (
    <>
      <SectionTitle note="Role decides which dashboards a seat can open">Seats</SectionTitle>

      <div className="card overflow-hidden">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Dashboards</th>
            </tr>
          </thead>
          <tbody>
            {team.map((u) => (
              <tr key={u.id}>
                <td className="font-medium t-ink">{u.name}</td>
                <td className="t-mut">{u.email}</td>
                <td><Badge kind="accent">{ROLE_LABEL[u.role] || u.role}</Badge></td>
                <td>
                  <div className="flex flex-wrap gap-1.5">
                    {(u.dashboards || []).map((d) => <Badge key={d}>{DASH_LABEL[d] || d}</Badge>)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-4 mt-3">
        <div className="eyebrow mb-1.5">Next slice</div>
        <p className="text-[13px] t-mut">
          Creating seats and re-permissioning dashboards runs through the same directory this table
          reads. In production the directory moves to InsForge Auth behind the same interface.
        </p>
      </div>
    </>
  );
}
