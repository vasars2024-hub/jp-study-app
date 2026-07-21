import { useEffect, useMemo, useRef, useState } from 'react';

import type { CityStateMessage } from '../ipc/channels';
import { projectCityPresentation } from '../engine/presentation';
import type { MemoryRecordType } from '../engine/types';
import NoctisDiorama, { NoctisComposite } from '../rendering/diorama/NoctisDiorama';
import { eraRank, type NoctisViewMode } from '../rendering/world/worldModel';
import {
  AppChrome,
  StatusBarField,
  StatusBarSpacer,
  Toolbar,
  MenuBarMenu,
} from '../../../renderer/components/ui';
import './noctis.css';

type Section = 'overview' | 'archive' | 'ecology' | 'civic' | 'discoveries';

const VIEW_MODES: Array<{ id: NoctisViewMode; label: string; minimumEra?: number }> = [
  { id: 'glance', label: 'Glance' },
  { id: 'district', label: 'District' },
  { id: 'detail', label: 'Detail' },
  { id: 'strata', label: 'Below' },
  { id: 'stellar', label: 'Stellar', minimumEra: 4 },
  { id: 'explorer', label: 'Night Drift' },
  { id: 'civilization', label: 'Whole' },
];

const SECTION_LABELS: Array<{ id: Section; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'archive', label: 'Archive' },
  { id: 'ecology', label: 'Ecology' },
  { id: 'civic', label: 'Civic Life' },
  { id: 'discoveries', label: 'Discoveries' },
];

const ERA_LABELS = {
  SPORE_HEARTH: 'Spore-Hearth Era',
  CRYSTAL_INSCRIPTION: 'Crystal Inscription Era',
  PHONONIC_SUBTERRANEAN: 'Phononic Subterranean Era',
  OPTOGENETIC_CIRCUIT: 'Optogenetic Circuit Era',
  COSMIC_STELLAR: 'Cosmic Stellar Era',
};

function quality(value: number): string {
  if (value < 0.12) return 'quiet';
  if (value < 0.36) return 'gathering';
  if (value < 0.68) return 'circulating';
  return 'resonant';
}

function recordLabel(type: MemoryRecordType): string {
  if (type === 'FIRST_LIGHT') return 'First light';
  if (type === 'MILESTONE') return 'Learning milestone';
  if (type === 'SUCCESSION_ADVANCE') return 'Ecological succession';
  if (type === 'VAULT_DISCOVERY') return 'Archive discovery';
  return 'Era transition';
}

function compositeFor(message: CityStateMessage | null, returning: boolean): NoctisComposite {
  if (!message) return 'loading';
  if (returning) return 'returning';
  if (message.state.status === 'hibernating') return 'hibernating';
  if (message.state.learning.sessions === 0) return 'newborn';
  if (message.state.ecology.illumination < 0.1) return 'dimmed';
  return 'active';
}

export default function NoctisWorkspace({ message }: { message: CityStateMessage | null }) {
  const [section, setSection] = useState<Section>('overview');
  const [viewMode, setViewMode] = useState<NoctisViewMode>('district');
  const priorStatus = useRef(message?.state.status);
  const [returning, setReturning] = useState(false);

  useEffect(() => {
    const next = message?.state.status;
    setReturning(priorStatus.current === 'hibernating' && next === 'active');
    priorStatus.current = next;
  }, [message?.state.revision, message?.state.status]);

  const model = useMemo(
    () => message ? projectCityPresentation(message.state, message.flags) : null,
    [message],
  );
  const composite = compositeFor(message, returning);
  const state = message?.state;
  const availableViewModes = VIEW_MODES.filter((mode) => (mode.minimumEra || 0) <= eraRank(model ? model.era : 'SPORE_HEARTH'));
  const eraLabel = state ? ERA_LABELS[state.era.designation] : 'Observation link';
  const summary = !state
    ? 'The local night field is preparing. Observation will resume when the mirror answers.'
    : state.status === 'hibernating'
      ? 'The currents are quiet. The archive remains intact.'
      : state.learning.sessions === 0
        ? 'One ancestral hearth waits in the basin. Study remains the only beginning required.'
        : returning
          ? 'A teal current is returning through the basin. Older paths remain where they were.'
          : 'Cold light moves through the basin. The civilization is changing without asking for command.';

  const menus: MenuBarMenu[] = [
    {
      id: 'view',
      label: 'View',
      items: availableViewModes.map((mode) => ({
        id: mode.id,
        label: mode.id === 'explorer'
          ? 'Start Night Drift'
          : mode.id === 'civilization'
            ? 'Whole civilization'
            : `${mode.label} view`,
        onSelect: () => setViewMode(mode.id),
      })),
    },
  ];

  return (
    <AppChrome
      menus={menus}
      className="noctis-chrome"
      status={
        <>
          <StatusBarField>{eraLabel}</StatusBarField>
          <StatusBarSpacer />
          <StatusBarField>{state?.status === 'hibernating' ? 'Archive secure' : state ? 'Observation live' : 'Observation paused'}</StatusBarField>
        </>
      }
    >
      <div className={`noctis-workspace view-${viewMode}`}>
        <Toolbar className="noctis-toolbar" aria-label="Noctis view controls">
          <strong>Noctis Observatory</strong>
          <span className="noctis-toolbar-spacer" />
          {availableViewModes.map((mode) => (
            <button
              type="button"
              key={mode.id}
              className={viewMode === mode.id ? 'active' : ''}
              aria-pressed={viewMode === mode.id}
              onClick={() => setViewMode(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </Toolbar>
        <div className="noctis-observatory">
          <main className="noctis-viewport-wrap">
            <NoctisDiorama
              model={model}
              composite={composite}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
            {viewMode !== 'explorer' && viewMode !== 'strata' && viewMode !== 'stellar' && viewMode !== 'civilization' ? (
              <div className="noctis-scene-caption" aria-live="polite">
                <span>{summary}</span>
                {state && viewMode === 'district' ? (
                  <button type="button" onClick={() => setViewMode('detail')}>Inspect the hearth</button>
                ) : null}
              </div>
            ) : null}
          </main>
          {viewMode === 'district' || viewMode === 'detail' ? (
            <aside className="noctis-utility" aria-label="Noctis observations">
              <nav className="noctis-section-nav" aria-label="Observation categories">
                {SECTION_LABELS.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={section === item.id ? 'active' : ''}
                    aria-current={section === item.id ? 'page' : undefined}
                    onClick={() => setSection(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
              <div className="noctis-inspection">
                {section === 'overview' && <Overview message={message} />}
                {section === 'archive' && <Archive message={message} />}
                {section === 'ecology' && <Ecology message={message} />}
                {section === 'civic' && <Civic message={message} />}
                {section === 'discoveries' && <Discoveries message={message} />}
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    </AppChrome>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="noctis-panel"><h2>{title}</h2>{children}</section>;
}

function Overview({ message }: { message: CityStateMessage | null }) {
  const state = message?.state;
  if (!state) return <Panel title="Observation"><p>Observation paused. The last valid local envelope remains protected.</p></Panel>;
  return (
    <Panel title="Basin condition">
      <dl>
        <div><dt>Local light</dt><dd>{quality(state.ecology.illumination)}</dd></div>
        <div><dt>Currents</dt><dd>{quality(state.ecology.circulation)}</dd></div>
        <div><dt>Civic rhythm</dt><dd>{quality(state.citizen.activity)}</dd></div>
      </dl>
      {state.learning.sessions > 0 ? (
        <div className="noctis-readings" aria-label="Environmental readings">
          <Reading label="Brine" value={state.ecology.reservoirs.brine} />
          <Reading label="Glucans" value={state.ecology.reservoirs.glucans} />
        </div>
      ) : <p>The deeper instruments remain quiet before first light.</p>}
    </Panel>
  );
}

function Reading({ label, value }: { label: string; value: number }) {
  const labelValue = quality(1 - Math.exp(-value / 60));
  return <div><span>{label}</span><strong>{labelValue}</strong></div>;
}

function Archive({ message }: { message: CityStateMessage | null }) {
  const records = message?.state.memory.records || [];
  return (
    <Panel title="Archive">
      {records.length === 0 ? <p>The archive is intact and has not yet received its first entry.</p> : (
        <ol className="noctis-records">
          {records.slice().reverse().map((record) => (
            <li key={record.ordinal}><strong>{recordLabel(record.type)}</strong><span>{record.note}</span></li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function Ecology({ message }: { message: CityStateMessage | null }) {
  const ecology = message?.state.ecology;
  return (
    <Panel title="Ecology">
      {!ecology ? <p>The ecological instruments are waiting for the mirror.</p> : (
        <dl>
          <div><dt>Succession</dt><dd>{['ancestral', 'rooted', 'interdependent', 'layered', 'deeply coupled'][ecology.successionStage - 1]}</dd></div>
          <div><dt>Mycelial reach</dt><dd>{quality(ecology.circulationReach)}</dd></div>
          <div><dt>Crystal order</dt><dd>{quality(1 - Math.exp(-ecology.crystalRecord / 180))}</dd></div>
          <div><dt>Stability</dt><dd>{quality(ecology.stability)}</dd></div>
        </dl>
      )}
    </Panel>
  );
}

function Civic({ message }: { message: CityStateMessage | null }) {
  const state = message?.state;
  return (
    <Panel title="Civic life">
      {!state ? <p>Civic observation is paused.</p> : (
        <>
          <p>{state.status === 'hibernating' ? 'Noctae activity has settled into protected quiet.' : 'Noctae move along grown routes and shared institutions.'}</p>
          <dl>
            <div><dt>Participation</dt><dd>{quality(state.citizen.institutionalParticipation)}</dd></div>
            <div><dt>Transmission</dt><dd>{quality(state.citizen.skillTransmission)}</dd></div>
            <div><dt>Expression</dt><dd>{quality(state.culture.activeExpression)}</dd></div>
          </dl>
        </>
      )}
    </Panel>
  );
}

function Discoveries({ message }: { message: CityStateMessage | null }) {
  const records = (message?.state.memory.records || []).filter((record) => record.type !== 'FIRST_LIGHT');
  return (
    <Panel title="Discoveries">
      {records.length === 0 ? <p>No discovery has been committed yet. Ordinary study needs no spectacle.</p> : (
        <ul className="noctis-discoveries">
          {records.slice().reverse().map((record) => <li key={record.ordinal}>{recordLabel(record.type)}</li>)}
        </ul>
      )}
    </Panel>
  );
}
