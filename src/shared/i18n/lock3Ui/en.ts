// The lock, round 3 (lock3): the lock screen as a study surface, recovery,
// auto-lock, and Settings -> Lockscreen asking for the current PIN. English
// source of truth.

import type { Catalog } from '../core';

export const LOCK3_UI_EN: Catalog = {
  // The study panel on every lock screen skin.
  'lock3.study.label': 'Study',
  'lock3.study.due': {
    one: '{count} card due today',
    other: '{count} cards due today',
  },
  'lock3.study.noneDue': 'Nothing due today.',
  'lock3.study.cardOfDay': 'Card of the day',
  'lock3.study.showAnswer': 'Show answer',
  'lock3.study.hideAnswer': 'Hide answer',
  // "Answer a card to unlock".
  'lock3.challenge.title': 'Answer a card to unlock',
  'lock3.challenge.prompt': 'What does this mean? Pick one, or press 1 to 4.',
  'lock3.challenge.optionsLabel': 'Answers',
  'lock3.challenge.wrong': 'Not quite: it means “{answer}”. Try another card.',
  'lock3.challenge.next': 'Another card',
  'lock3.challenge.right': 'Correct.',
  'lock3.challenge.selfCheck': 'Recall the meaning, then check it.',
  'lock3.challenge.remembered': 'I remembered it',
  'lock3.challenge.empty': 'Your deck has no cards to ask yet.',
  'lock3.challenge.continue': 'Continue',
  // Forgotten PIN.
  'lock3.recovery.link': 'Forgot your PIN?',
  'lock3.recovery.hint':
    'Enter the recovery code Gum showed you when you first set a PIN. It removes the PIN; set a new one in Settings afterwards.',
  'lock3.recovery.label': 'Recovery code',
  'lock3.recovery.submit': 'Unlock with code',
  'lock3.recovery.cancel': 'Back to PIN',
  'lock3.recovery.wrong': 'That recovery code is not right.',
  'lock3.recovery.done': 'Your PIN was removed with the recovery code. Set a new one in Settings > Lockscreen.',
  // For screen readers: the big clock is decorative.
  'lock3.clock.sr': 'It is {time}, {date}.',
  // Lock now.
  'lock3.lockNow.needPin': 'Set a PIN in Settings > Lockscreen first. Without one there is nothing to lock.',
  'lock3.tray.lockNow': 'Lock Gum now',
  'lock3.note.data':
    'While Gum is locked, none of its windows can read or change your study data through the app: their requests wait until you unlock. Clipboard reads and notifications are off, and pop-up messages are held back.',
  // Settings -> Lockscreen.
  'lock3.settings.currentPin': 'Current passcode',
  'lock3.settings.currentHint': 'Changing or clearing the passcode needs the current one.',
  'lock3.settings.currentNeeded': 'Enter your current passcode first.',
  'lock3.settings.wrongCurrent': 'The current passcode is not right.',
  'lock3.settings.disableNeedsPin': 'Turning this off needs your current passcode (in the card below).',
  'lock3.settings.lockNow': 'Lock now',
  'lock3.settings.lockNowHint': 'Also in the tray menu and the command palette; give it a shortcut in Settings > Shortcuts.',
  'lock3.settings.recovery.title': 'Recovery code',
  'lock3.settings.recovery.desc':
    'If you forget your PIN, this code opens Gum once and removes the PIN. Keep it somewhere outside Gum.',
  'lock3.settings.recovery.shownOnce': 'Write this down now. Gum keeps only a hash of it and cannot show it again.',
  'lock3.settings.recovery.copy': 'Copy',
  'lock3.settings.recovery.copied': 'Copied',
  'lock3.settings.recovery.dismiss': 'I wrote it down',
  'lock3.settings.recovery.noPin': 'A recovery code is made when you set a PIN.',
  'lock3.settings.recovery.have': 'A recovery code is set. Making a new one stops the old one from working.',
  'lock3.settings.recovery.none': 'This PIN has no recovery code yet.',
  'lock3.settings.recovery.new': 'Make a new recovery code',
  'lock3.settings.recovery.usesCurrent': 'Uses the current passcode entered above.',
  'lock3.settings.recovery.made': 'New recovery code made. The old one no longer works.',
  'lock3.settings.recovery.blancShown': 'Recovery code: {code}. Write it down now; it is not shown again.',
  'lock3.settings.auto.title': 'Lock automatically',
  'lock3.settings.auto.desc': 'Gum can lock itself. It never unlocks itself. Needs a PIN.',
  'lock3.settings.auto.idle': 'When the PC has been idle for',
  'lock3.settings.auto.never': 'Never',
  'lock3.settings.auto.minutes': {
    one: '{count} minute',
    other: '{count} minutes',
  },
  'lock3.settings.auto.idleNote':
    'Idle means no keyboard or mouse input anywhere on the PC. A video or audio playing in Gum counts as activity, and the idle time starts again when it stops.',
  'lock3.settings.auto.sleep': 'When the PC goes to sleep',
  'lock3.settings.auto.screenLock': 'When Windows locks (Win+L)',
  'lock3.settings.study.title': 'Study on the lock screen',
  'lock3.settings.study.desc': 'Anyone at the screen can see what the lock screen shows.',
  'lock3.settings.study.off': 'Nothing',
  'lock3.settings.study.count': 'Cards due (a number)',
  'lock3.settings.study.card': 'A card from my deck',
  'lock3.settings.study.answer': 'Answer a card before the PIN',
  'lock3.settings.study.answerNote':
    'A multiple-choice card from your deck comes first. With a PIN, the PIN is still required afterwards. Without a PIN, this is a study habit at launch, not a lock.',
  // lock4 (eager: the lock draws before a lazy pack could load).
  'lock4.pad.enter': 'Enter',
  'lock4.pad.enterLabel': 'Unlock with this PIN',
  'lock4.prompt.pin': 'Enter your PIN, then press Enter',
  'lock4.prompt.passphrase': 'Enter your passphrase',
  'lock4.passphrase.label': 'Passphrase',
  'lock4.tooShort': 'Too short: a PIN has at least 4 digits, a passphrase at least 6 characters.',
  'lock4.settings.kind.label': 'Type of passcode',
  'lock4.settings.kind.pin': 'PIN (4 to 12 digits)',
  'lock4.settings.kind.passphrase': 'Passphrase',
  'lock4.settings.kind.hintPin': 'A 4-digit PIN unlocks as soon as the fourth digit is typed. A longer PIN is harder to guess; press Enter after it.',
  'lock4.settings.kind.hintPassphrase': '6 to 64 characters, at least one of them not a digit. Spaces inside it count; spaces at either end are ignored.',
  'lock4.settings.needPin': 'Enter a PIN of 4 to 12 digits.',
  'lock4.settings.needPassphrase': 'A passphrase needs 6 to 64 characters, at least one of them not a digit.',
  'lock4.blanc.hint': 'A PIN of 4 to 12 digits, or a passphrase of 6 or more characters.',
  'lock4.blanc.unlock': 'Unlock',
};
