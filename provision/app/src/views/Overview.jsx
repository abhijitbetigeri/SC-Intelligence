import { getOverview } from '../lib/api.js';
import { useApiData } from '../lib/useApiData.js';
import { Kpi, KpiGrid, SectionTitle, InsightCard, Empty } from '../components/ui.jsx';

// The landing view: a KPI strip whose every number traces back to a record, then the insight
// feed. Each insight routes into the pillar that can act on it.
export default function Overview({ navigate }) {
  const { data, loading, error } = useApiData(getOverview);

  if (loading && !data) return <div className="t-mut py-10">Loading…</div>;
  if (error) return <Empty title="Could not load the overview" body={error} />;

  const { kpis = [], insights = [] } = data || {};

  return (
    <>
      <KpiGrid>
        {kpis.map((k) => <Kpi key={k.label} label={k.label} value={k.value} note={k.note} tone={k.tone} />)}
      </KpiGrid>

      <SectionTitle note={insights.length ? `${insights.length} findings, highest priority first` : null}>
        What needs you
      </SectionTitle>

      {insights.length ? (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,330px),1fr))]">
          {insights.map((x, i) => (
            <InsightCard key={i} x={x} onAct={() => navigate?.(x.view)} />
          ))}
        </div>
      ) : (
        <Empty title="Nothing needs you right now"
          body="Every item has more days of cover than its supplier lead time, and no orders are waiting on approval." />
      )}
    </>
  );
}
