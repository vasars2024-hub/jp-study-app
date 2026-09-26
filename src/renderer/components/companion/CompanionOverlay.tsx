import CardPreview from './CardPreview';
import CompanionNotice from './CompanionNotice';
import CompanionWheel from './CompanionWheel';

/** The desktop companion's windows (`?companion=wheel|preview|notice`), one entry for all three. */
export default function CompanionOverlay({ kind }: { kind: string }) {
  if (kind === 'wheel') return <CompanionWheel />;
  if (kind === 'preview') return <CardPreview />;
  return <CompanionNotice />;
}
