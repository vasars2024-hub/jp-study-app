import { useEffect, useState } from 'react';
import Icon from '../Icons';
import { isDnd, onNotificationsChanged, unreadCount } from '../../notificationStore';
import { useT } from '../../i18n';

const TOGGLE_EVENT = 'shell:toggleNotifications';

export default function NotificationBell() {
  const { t } = useT();
  const [, tick] = useState(0);
  const unread = unreadCount();
  const dnd = isDnd();

  useEffect(() => onNotificationsChanged(() => tick((n) => n + 1)), []);

  return (
    <button
      type="button"
      className="os-tray-btn"
      title={dnd ? t('notifications.title.dnd') : t('notifications.title')}
      aria-label={t('notifications.title')}
      onClick={() => window.dispatchEvent(new CustomEvent(TOGGLE_EVENT))}
    >
      <Icon name="bell" size={18} />
      {unread > 0 && !dnd ? (
        <span className="os-tray-badge" aria-hidden="true">
          {unread > 9 ? '9+' : unread}
        </span>
      ) : null}
    </button>
  );
}

export { TOGGLE_EVENT as NOTIFICATION_TOGGLE_EVENT };
