import type { CityPresentationModel, EraDesignation } from '../../engine/types';
import type { NoctisComposite } from './NoctisDiorama';
import { eraRank } from '../world/worldModel';
import shelterV01Url from '../../assets/runtime/environments/era1/ancestral_basin/shelter/shelter_v01_base.png';
import shelterV02Url from '../../assets/runtime/environments/era1/ancestral_basin/shelter/shelter_v02_base.png';
import shelterV03Url from '../../assets/runtime/environments/era1/ancestral_basin/shelter/shelter_v03_base.png';
import sporeHearthBaseUrl from '../../assets/runtime/environments/era1/ancestral_basin/spore_hearth/spore_hearth_v01_base.png';
import sporeHearthEmissiveUrl from '../../assets/runtime/environments/era1/ancestral_basin/spore_hearth/spore_hearth_v01_emissive.png';
import canopyV01Url from '../../assets/runtime/environments/era1/ancestral_basin/canopy/canopy_cluster_v01_base.png';
import canopyV02Url from '../../assets/runtime/environments/era1/ancestral_basin/canopy/canopy_cluster_v02_base.png';
import canopyV03Url from '../../assets/runtime/environments/era1/ancestral_basin/canopy/canopy_cluster_v03_base.png';
import rootPathStraightUrl from '../../assets/runtime/environments/era1/ancestral_basin/root_path/root_path_straight_v01_base.png';
import rootPathBendUrl from '../../assets/runtime/environments/era1/ancestral_basin/root_path/root_path_bend_v01_base.png';
import rootPathForkUrl from '../../assets/runtime/environments/era1/ancestral_basin/root_path/root_path_fork_v01_base.png';
import rootPathTerminalUrl from '../../assets/runtime/environments/era1/ancestral_basin/root_path/root_path_terminal_v01_base.png';

function selectedValue(selectedFocusId: string | null, focusId: string): 'true' | undefined {
  return selectedFocusId === focusId ? 'true' : undefined;
}

function eraRegionClass(base: string, era: EraDesignation, arrivingEra: EraDesignation | null): string {
  return `noctis-era-region ${base}${arrivingEra === era ? ' is-arriving' : ''}`;
}

function noctae(model: CityPresentationModel): JSX.Element[] {
  const count = Math.max(1, Math.min(12, Math.round(1 + model.civic.density01 * 6 + model.activity01 * 5)));
  return Array.from({ length: count }, (_, index) => {
    const x = 1510 + ((index * 137 + model.seed) % 610);
    const y = 1430 + ((index * 47 + model.seed) % 170);
    const scale = 0.72 + ((index * 17 + model.seed) % 20) / 100;
    return (
      <g key={index} className="noctis-nocta" transform={`translate(${x} ${y}) scale(${scale})`}>
        <ellipse cx="0" cy="7" rx="18" ry="7" className="noctis-nocta-shadow" />
        <path d="M-7 2 C-11-18-7-35 0-41 C7-35 11-18 7 2 Z" />
        <circle cx="-3" cy="-28" r="1.8" className="noctis-nocta-sense" />
        <circle cx="3" cy="-28" r="1.8" className="noctis-nocta-sense" />
        <path d="M-3-39 Q-14-51-17-61 M3-39 Q14-51 17-61" className="noctis-nocta-feelers" />
      </g>
    );
  });
}

function OriginBasin({ model, selectedFocusId }: { model: CityPresentationModel | null; selectedFocusId: string | null }) {
  return (
    <g data-region="origin_basin" className="noctis-region noctis-region-origin">
      <path className="noctis-origin-hollow" d="M1200 1100 Q1380 920 1600 980 Q1800 900 2000 980 Q2230 915 2400 1110 L2400 1780 1200 1780Z" />
      <g className="noctis-inspectable" data-focus-id="basin_ridges" data-selected={selectedValue(selectedFocusId, 'basin_ridges')}>
        <path className="noctis-ridge far" d="M1200 1260 L1290 1110 1400 1210 1510 1010 1640 1225 1780 1090 1900 1235 2040 1030 2190 1220 2310 1080 2400 1250 2400 1390 1200 1390Z" />
        <path className="noctis-ridge near" d="M1200 1370 L1370 1230 1490 1360 1635 1210 1790 1380 1970 1230 2100 1370 2260 1220 2400 1350 2400 1490 1200 1490Z" />
      </g>
      <path className="noctis-terrain" d="M1200 1350 Q1420 1300 1600 1360 T2000 1350 T2400 1370 L2400 1780 1200 1780Z" />
      <path className="noctis-cave-wall" d="M1200 920 Q1320 990 1380 1160 L1320 1510 Q1260 1630 1200 1780Z M2400 920 Q2280 990 2220 1160 L2280 1510 Q2340 1640 2400 1780Z" />
      <path className="noctis-cave-ceiling" d="M1200 920 H2400 L2320 1010 2200 980 2070 1060 1950 990 1810 1050 1660 990 1510 1060 1370 980 1260 1020Z" />
      <g className="noctis-canopies noctis-inspectable" data-focus-id="fungal_canopy" data-selected={selectedValue(selectedFocusId, 'fungal_canopy')}>
        <image className="noctis-canopy-asset" href={canopyV01Url} x="1265" y="1231" width="210" height="210" preserveAspectRatio="xMidYMid meet" />
        <image className="noctis-canopy-asset" href={canopyV02Url} x="2100" y="1192" width="240" height="240" preserveAspectRatio="xMidYMid meet" />
        <image className="noctis-canopy-asset" href={canopyV03Url} x="2195" y="1340" width="170" height="170" preserveAspectRatio="xMidYMid meet" />
      </g>
      <g className="noctis-root-paths noctis-inspectable" data-focus-id="living_root_paths" data-selected={selectedValue(selectedFocusId, 'living_root_paths')}>
        <g className="noctis-root-path-fallback">
          <path d="M1800 1440 C1640 1450 1540 1500 1440 1580" />
          <path d="M1800 1440 C1950 1460 2060 1510 2160 1580" />
          <path d="M1800 1460 C1850 1530 1930 1600 2050 1680" />
        </g>
        <image className="noctis-root-path-asset root-path-straight" href={rootPathStraightUrl} x="1680" y="1500" width="240" height="240" preserveAspectRatio="none" />
        <image className="noctis-root-path-asset root-path-fork" href={rootPathForkUrl} x="1640" y="1370" width="320" height="320" preserveAspectRatio="none" transform="rotate(180 1800 1530)" />
        <image className="noctis-root-path-asset root-path-bend" href={rootPathBendUrl} x="1440" y="1470" width="260" height="260" preserveAspectRatio="none" transform="rotate(135 1570 1600)" />
        <image className="noctis-root-path-asset root-path-terminal" href={rootPathTerminalUrl} x="1910" y="1500" width="240" height="240" preserveAspectRatio="none" transform="rotate(225 2030 1620)" />
      </g>
      <g className="noctis-inspectable" data-focus-id="first_current" data-selected={selectedValue(selectedFocusId, 'first_current')}>
        <path className="noctis-channel" d="M1200 1580 C1420 1530 1540 1640 1720 1610 C1930 1570 2150 1530 2400 1590 L2400 1690 C2160 1650 1930 1720 1720 1690 C1510 1660 1380 1630 1200 1700Z" fill="url(#noctis-water)" />
        <path className="noctis-current" d="M1220 1610 C1430 1570 1560 1660 1740 1640 C1950 1610 2160 1570 2370 1620" />
      </g>
      <g className="noctis-shelters noctis-inspectable" data-focus-id="ordinary_shelters" data-selected={selectedValue(selectedFocusId, 'ordinary_shelters')}>
        <image className="noctis-shelter-asset" href={shelterV01Url} x="1429" y="1270" width="172" height="172" preserveAspectRatio="xMidYMid meet" />
        <image className="noctis-shelter-asset" href={shelterV02Url} x="2002" y="1258" width="176" height="176" preserveAspectRatio="xMidYMid meet" />
        <image className="noctis-shelter-asset" href={shelterV03Url} x="2090" y="1375" width="148" height="148" preserveAspectRatio="xMidYMid meet" />
      </g>
      <g className="noctis-hearth noctis-inspectable" data-focus-id="ancestral_hearth" data-selected={selectedValue(selectedFocusId, 'ancestral_hearth')} transform="translate(1800 1452)">
        <ellipse className="noctis-hearth-contact" cx="0" cy="2" rx="121" ry="28" />
        <ellipse className="noctis-hearth-aura" cx="0" cy="8" rx="112" ry="54" filter="url(#noctis-soft-light)" />
        <image className="noctis-hearth-base-asset" href={sporeHearthBaseUrl} x="-135" y="-243" width="270" height="270" preserveAspectRatio="xMidYMid meet" />
        <image className="noctis-hearth-emissive-asset" href={sporeHearthEmissiveUrl} x="-135" y="-243" width="270" height="270" preserveAspectRatio="xMidYMid meet" />
      </g>
      <path className="noctis-root-mouth noctis-inspectable" data-focus-id="root_mouth" data-selected={selectedValue(selectedFocusId, 'root_mouth')} d="M1980 1660 Q2050 1585 2125 1660 Q2070 1710 1980 1660Z" />
      {model && model.status === 'active' ? (
        <g className="noctis-noctae noctis-inspectable" data-focus-id="noctae_gathering" data-selected={selectedValue(selectedFocusId, 'noctae_gathering')}>
          {noctae(model)}
        </g>
      ) : null}
      <path className="noctis-foreground" d="M1200 1660 Q1320 1570 1450 1690 Q1550 1620 1640 1745 L1640 1780 1200 1780Z M2070 1740 Q2180 1580 2290 1680 Q2350 1600 2400 1640 L2400 1780 2070 1780Z" />
    </g>
  );
}

function EraTwoWorld({ selectedFocusId, arrivingEra }: { selectedFocusId: string | null; arrivingEra: EraDesignation | null }) {
  return (
    <g className={eraRegionClass('noctis-era-two', 'CRYSTAL_INSCRIPTION', arrivingEra)}>
      <g className="noctis-growth-layer stage-foundation">
        <path className="noctis-region-ground" d="M260 1110 Q720 850 1260 1090 L1380 1600 Q800 1760 260 1510Z" />
        <path className="noctis-region-ground" d="M2220 1080 Q2800 830 3340 1100 L3340 1580 Q2790 1770 2220 1600Z" />
      </g>
      <g className="noctis-growth-layer stage-routes">
        <g className="noctis-terraces noctis-inspectable" data-focus-id="west_archive" data-selected={selectedValue(selectedFocusId, 'west_archive')}>
          <path d="M360 1380 Q760 1190 1250 1340" />
          <path d="M420 1480 Q800 1320 1280 1450" />
        </g>
        <g className="noctis-terraces noctis-inspectable" data-focus-id="east_aqueduct" data-selected={selectedValue(selectedFocusId, 'east_aqueduct')}>
          <path d="M2320 1370 Q2760 1190 3260 1370" />
          <path d="M2290 1480 Q2750 1320 3290 1480" />
        </g>
      </g>
      <path className="noctis-growth-layer stage-ecology noctis-aqueduct noctis-inspectable" data-focus-id="east_aqueduct" data-selected={selectedValue(selectedFocusId, 'east_aqueduct')} d="M330 1440 C780 1290 1110 1420 1420 1490 C1800 1570 2150 1470 2380 1390 C2720 1270 3010 1340 3310 1460" />
      <g className="noctis-growth-layer stage-civic noctis-era-buildings">
        <path className="noctis-inspectable" data-focus-id="west_archive" data-selected={selectedValue(selectedFocusId, 'west_archive')} d="M650 1270 L720 1160 790 1270 770 1370 670 1370Z" />
        <path className="noctis-inspectable" data-focus-id="east_aqueduct" data-selected={selectedValue(selectedFocusId, 'east_aqueduct')} d="M2720 1260 L2800 1110 2880 1260 2860 1370 2740 1370Z" />
        <path className="noctis-inspectable" data-focus-id="east_aqueduct" data-selected={selectedValue(selectedFocusId, 'east_aqueduct')} d="M3010 1390 Q3080 1260 3150 1390 L3130 1480 3030 1480Z" />
      </g>
    </g>
  );
}

function EraThreeWorld({ selectedFocusId, arrivingEra }: { selectedFocusId: string | null; arrivingEra: EraDesignation | null }) {
  return (
    <g className={eraRegionClass('noctis-era-three noctis-inspectable', 'PHONONIC_SUBTERRANEAN', arrivingEra)} data-focus-id="pressure_exchange" data-selected={selectedValue(selectedFocusId, 'pressure_exchange')}>
      <path className="noctis-growth-layer stage-foundation noctis-deep-wall" d="M720 1580 Q1100 1740 1420 1660 Q1800 1580 2180 1670 Q2550 1760 2900 1580 L2900 2340 720 2340Z" />
      <g className="noctis-growth-layer stage-routes noctis-deep-tiers">
        <path d="M850 1810 H1520 L1600 1890 H2260 L2340 1810 H2780" />
        <path d="M980 1990 H1380 L1470 2070 H2110 L2200 1990 H2650" />
        <path d="M1160 2180 H2440" />
      </g>
      <g className="noctis-growth-layer stage-civic noctis-pressure-lines">
        <path d="M1220 1740 V2200 M1800 1680 V2260 M2380 1740 V2200" />
        <circle cx="1220" cy="1990" r="48" /><circle cx="1800" cy="2070" r="62" /><circle cx="2380" cy="1990" r="48" />
      </g>
    </g>
  );
}

function EraFourWorld({ selectedFocusId, arrivingEra }: { selectedFocusId: string | null; arrivingEra: EraDesignation | null }) {
  return (
    <g className={eraRegionClass('noctis-era-four noctis-inspectable', 'OPTOGENETIC_CIRCUIT', arrivingEra)} data-focus-id="living_matrix" data-selected={selectedValue(selectedFocusId, 'living_matrix')}>
      <g className="noctis-growth-layer stage-routes noctis-network-lines">
        <path d="M120 780 C720 440 1150 700 1600 1020 S2620 920 3340 560" />
        <path d="M180 1980 C740 1680 1140 1920 1700 1780 S2720 1460 3320 1720" />
        <path d="M520 520 C980 940 1220 1260 1800 1420 C2360 1580 2740 1180 3260 900" />
      </g>
      <g className="noctis-growth-layer stage-civic noctis-matrix-nodes">
        <circle cx="520" cy="620" r="28" /><circle cx="980" cy="820" r="34" /><circle cx="3060" cy="650" r="46" />
        <circle cx="2900" cy="1650" r="34" /><circle cx="620" cy="1880" r="36" />
      </g>
    </g>
  );
}

function EraFiveWorld({ selectedFocusId, arrivingEra }: { selectedFocusId: string | null; arrivingEra: EraDesignation | null }) {
  return (
    <g className={eraRegionClass('noctis-era-five', 'COSMIC_STELLAR', arrivingEra)}>
      <path className="noctis-growth-layer stage-foundation noctis-stellar-rift noctis-inspectable" data-focus-id="rift_observatory" data-selected={selectedValue(selectedFocusId, 'rift_observatory')} d="M1040 1120 Q1190 650 1390 180 L1550 40 H2050 L2210 190 Q2440 680 2560 1120 Q2280 970 2140 820 Q1970 680 1800 720 Q1620 680 1450 830 Q1270 1010 1040 1120Z" />
      <g className="noctis-growth-layer stage-civic noctis-orbital-plates noctis-inspectable" data-focus-id="orbital_garden" data-selected={selectedValue(selectedFocusId, 'orbital_garden')}>
        <path d="M1320 510 Q1510 430 1690 510 Q1510 590 1320 510Z" />
        <path d="M1920 300 Q2200 190 2440 300 Q2200 410 1920 300Z" />
        <path d="M1640 660 Q1810 590 1980 660 Q1810 740 1640 660Z" />
      </g>
      <g className="noctis-growth-layer stage-routes noctis-stellar-tethers noctis-inspectable" data-focus-id="orbital_garden" data-selected={selectedValue(selectedFocusId, 'orbital_garden')}>
        <path d="M1510 510 L1680 1040 M2200 300 L2030 980 M1810 660 L1800 1110" />
      </g>
      <path className="noctis-growth-layer stage-light noctis-aurora" d="M1120 190 C1480 40 1770 260 2100 90 C2290 0 2440 70 2540 150" />
    </g>
  );
}

export default function NoctisWorldScene({
  model,
  composite,
  selectedFocusId,
  arrivingEra,
}: {
  model: CityPresentationModel | null;
  composite: NoctisComposite;
  selectedFocusId: string | null;
  arrivingEra: EraDesignation | null;
}) {
  const rank = eraRank(model ? model.era : 'SPORE_HEARTH');
  return (
    <>
      <defs>
        <linearGradient id="noctis-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#080c18" />
          <stop offset="0.55" stopColor="#151426" />
          <stop offset="1" stopColor="#2a1321" />
        </linearGradient>
        <linearGradient id="noctis-water" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#081a24" />
          <stop offset="0.5" stopColor="#17434a" />
          <stop offset="1" stopColor="#0a1824" />
        </linearGradient>
        <radialGradient id="noctis-hearth" cx="50%" cy="45%" r="55%">
          <stop offset="0" stopColor="#f2cc72" />
          <stop offset="0.48" stopColor="#e7a95b" />
          <stop offset="1" stopColor="#4a2533" />
        </radialGradient>
        <filter id="noctis-soft-light" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="24" />
        </filter>
      </defs>
      <rect width="3600" height="2400" fill="url(#noctis-sky)" />
      <g className="noctis-stars">
        {Array.from({ length: 34 }, (_, index) => (
          <circle key={index} cx={100 + (index * 389) % 3400} cy={70 + (index * 173) % 720} r={index % 3 === 0 ? 3 : 1.8} />
        ))}
      </g>
      {rank >= 4 ? <EraFiveWorld selectedFocusId={selectedFocusId} arrivingEra={arrivingEra} /> : null}
      {rank >= 3 ? <EraFourWorld selectedFocusId={selectedFocusId} arrivingEra={arrivingEra} /> : null}
      {rank >= 1 ? <EraTwoWorld selectedFocusId={selectedFocusId} arrivingEra={arrivingEra} /> : null}
      <OriginBasin model={model} selectedFocusId={selectedFocusId} />
      {rank >= 2 ? <EraThreeWorld selectedFocusId={selectedFocusId} arrivingEra={arrivingEra} /> : null}
      {composite === 'loading' ? <circle className="noctis-world-loading" cx="1800" cy="1420" r="42" /> : null}
    </>
  );
}
