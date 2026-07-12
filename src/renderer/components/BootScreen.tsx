import { useEffect, useState } from 'react';

// The "Study OS" splash: the logo fades in, holds, then the whole screen fades
// out and unmounts. Shown once per app launch.
export default function BootScreen() {
  const [gone, setGone] = useState(() => sessionStorage.getItem('jp-booted') === '1');

  useEffect(() => {
    if (gone) return;
    const t = setTimeout(() => {
      sessionStorage.setItem('jp-booted', '1');
      setGone(true);
    }, 2750);
    return () => clearTimeout(t);
  }, [gone]);

  if (gone) return null;

  return (
    <div className="boot">
      <div className="boot-logo">
        <svg className="boot-mark" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l7 4v10l-7 4-7-4V7z" />
          <path d="M12 8v8 M8.5 10l3.5 2 3.5-2" />
        </svg>
        <div className="boot-word">
          Study<span> OS</span>
        </div>
        <div className="boot-sub">日本語 · 中文</div>
      </div>
    </div>
  );
}
