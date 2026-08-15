// MyAnimeList sync panel — Russian. See ./en.ts for why this block did not exist.
//
// `malSync.listCount` is the only `{count}` key here, so it is the only one that
// takes CLDR plural forms (../core.ts:97 selects on `vars.count`).
import type { Catalog } from '../core';

export const MAL_SYNC_RU: Catalog = {
  'malSync.title': 'MyAnimeList',
  'malSync.desc': 'Подключите аккаунт MyAnimeList и загрузите свой список аниме в приложение.',

  'malSync.setup': 'Настройка',
  'malSync.clientIdDesc':
    'Зарегистрируйте приложение API на MyAnimeList и вставьте сюда его Client ID. Приложение никогда не видит ваш пароль от MyAnimeList.',
  'malSync.clientId': 'Client ID',
  'malSync.clientIdStored': 'Сохранён — вставьте новый id, чтобы заменить',
  'malSync.clientIdPlaceholder': 'Вставьте ваш Client ID с MyAnimeList',
  'malSync.clientIdSave': 'Сохранить',
  'malSync.register': 'Зарегистрировать приложение',
  'malSync.notConfigured': 'Укажите Client ID перед подключением.',

  'malSync.account': 'Аккаунт',
  'malSync.connectedAs': 'Подключено как {username}.',
  'malSync.notConnected': 'Не подключено.',
  'malSync.plaintextWarning':
    'Это устройство не умеет шифровать сохранённые учётные данные, поэтому токен доступа хранится открытым текстом в папке вашего профиля.',

  'malSync.profileNotice': 'MyAnimeList будет подключён к профилю в папке {dir}.',
  'malSync.nonDefaultProfileWarning':
    'Приложение работает не в стандартной папке профиля. Разрешение, которое вы даёте на MyAnimeList, постоянно и действует на весь аккаунт, но токен сохраняется только в этой папке — если она временная или будет удалена, аккаунт останется авторизованным, а воспользоваться этим отсюда будет нельзя. В этом случае отзовите доступ в настройках MyAnimeList.',

  'malSync.walkthroughTitle': 'Что произойдёт при подключении',
  'malSync.walkthroughStep1':
    'Откроется ваш обычный браузер на MyAnimeList. Войдите там и разрешите доступ — приложение не видит ваш пароль.',
  'malSync.walkthroughStep2':
    'Затем MyAnimeList перенаправит вас на http://localhost/oauth/callback, и эта страница не загрузится. Так и должно быть: приложение намеренно не поднимает локальный веб-сервер, чтобы её поймать.',
  'malSync.walkthroughStep3':
    'В адресной строке браузера скопируйте длинное значение после «code=».',
  'malSync.walkthroughStep4':
    'Вставьте его в поле, которое появится здесь, и нажмите «Завершить подключение». Код действует всего несколько минут, так что сделайте это сразу.',

  'malSync.connect': 'Подключить MyAnimeList',
  'malSync.callbackCode': 'Код авторизации',
  'malSync.callbackPlaceholder': 'Вставьте код из адреса перенаправления',
  'malSync.finish': 'Завершить подключение',
  'malSync.callbackDesc':
    'Подтвердите доступ в браузере, затем скопируйте значение «code» из адреса, на который вас перенаправили, и вставьте его выше. Код действует несколько минут.',
  'malSync.signOut': 'Выйти',

  'malSync.list': 'Список аниме',
  'malSync.noAutoSync':
    'Загрузка выполняется вручную и только на чтение — ничего не запускается по расписанию и ничего не записывается обратно в MyAnimeList.',
  'malSync.fetching': 'Загрузка…',
  'malSync.fetchList': 'Загрузить мой список',
  'malSync.listCount': {
    one: 'Загружена {count} запись.',
    few: 'Загружено {count} записи.',
    many: 'Загружено {count} записей.',
    other: 'Загружено {count} записи.',
  },
  'malSync.truncated':
    'При достижении предела страниц у MyAnimeList оставались ещё страницы, поэтому список неполный.',

  'malSync.library': 'Библиотека',
  'malSync.libraryDesc':
    'Сохранение оставляет полученные тайтлы внутри приложения, чтобы инструменты субтитров и словаря могли с ними работать. Сохраняется только то, что вы уже получили: обращений к MyAnimeList нет, ваш список там не меняется.',
  'malSync.librarySave': 'Сохранить полученные тайтлы в библиотеку',
  'malSync.librarySaving': 'Сохранение…',
  'malSync.libraryResult': 'Сохранено: {added} новых, {updated} обновлено, {unchanged} без изменений.',
  'malSync.libraryRejected': '{rejected} записей не удалось прочитать, они пропущены.',
  'malSync.libraryStored': 'В библиотеке {total} тайтлов.',
  'malSync.libraryEmpty': 'Пока ничего не сохранено.',
  'malSync.libraryDerivatives': 'Из них {derivatives} найдены через связанные тайтлы.',
  'malSync.libraryNothingFetched': 'Сначала получите список, затем сохраните его.',
  'malSync.statusFilter': 'Показывать',
  'malSync.statusAll': 'Весь список',
  'malSync.statusCompleted': 'Только завершённые',
  'malSync.statusWatching': 'Только смотрю',

  'malSync.error.not-configured': 'Client ID для MyAnimeList ещё не настроен.',
  'malSync.error.not-authenticated': 'Нет подключения к MyAnimeList. Сначала подключите аккаунт.',
  'malSync.error.reauth-required': 'MyAnimeList требует войти заново. Подключите аккаунт ещё раз.',
  'malSync.error.transient': 'MyAnimeList не ответил. Попробуйте ещё раз через минуту.',
  'malSync.error.request-failed': 'Запрос к MyAnimeList не удался.',
};
