// The crash screen's words (AppErrorBoundary.tsx), outside the i18n system on
// purpose: it shows when something is broken, and that can be i18n itself. The
// language is read the way i18n.ts stores it (localStorage `ui-lang`, then <html lang>).

export type CrashScreenLang = 'en' | 'ja' | 'zh' | 'ru';

export type CrashScreenText = { title: string; body: string; reload: string };

export const CRASH_SCREEN_TEXT: Readonly<Record<CrashScreenLang, CrashScreenText>> = {
  en: {
    title: 'Something went wrong.',
    body: 'This window ran into an unexpected error. Your saved data is untouched. The error was written to the diagnostic log.',
    reload: 'Reload',
  },
  ja: {
    title: '問題が発生しました。',
    body: 'このウィンドウで予期しないエラーが起きました。保存済みのデータはそのままです。エラーは診断ログに記録されました。',
    reload: '再読み込み',
  },
  zh: {
    title: '出现了问题。',
    body: '此窗口遇到了意外错误。已保存的数据不受影响。错误已写入诊断日志。',
    reload: '重新加载',
  },
  ru: {
    title: 'Что-то пошло не так.',
    body: 'В этом окне произошла непредвиденная ошибка. Сохранённые данные не затронуты. Ошибка записана в журнал диагностики.',
    reload: 'Перезагрузить',
  },
};

function asLang(value: unknown): CrashScreenLang | null {
  const base = typeof value === 'string' ? value.toLowerCase().split('-')[0] : '';
  return Object.prototype.hasOwnProperty.call(CRASH_SCREEN_TEXT, base) ? (base as CrashScreenLang) : null;
}

export function crashScreenLang(): CrashScreenLang {
  try {
    const stored = asLang(localStorage.getItem('ui-lang'));
    if (stored) return stored;
  } catch {
    /* storage unavailable */
  }
  try {
    return asLang(document.documentElement.getAttribute('lang')) ?? 'en';
  } catch {
    return 'en';
  }
}

export function crashScreenText(lang: CrashScreenLang = crashScreenLang()): CrashScreenText {
  return CRASH_SCREEN_TEXT[lang] ?? CRASH_SCREEN_TEXT.en;
}
