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
  'malSync.noAutoSyncPush': 'Загрузка и отправка — только вручную, ничего не запускается по расписанию. Ваш список на MyAnimeList меняется, только когда вы нажимаете «Отправить».',
  'malSync.push': 'Отправка изменений',
  'malSync.pushDesc': 'Отправляет изменения из приложения (статус, оценку, число просмотренных серий) в ваш список MyAnimeList — по сравнению с последней загрузкой.',
  'malSync.pushButton': { one: 'Отправить {count} изменение в MyAnimeList', few: 'Отправить {count} изменения в MyAnimeList', many: 'Отправить {count} изменений в MyAnimeList', other: 'Отправить {count} изменения в MyAnimeList' },
  'malSync.pushNone': 'Отличий от списка MyAnimeList нет.',
  'malSync.pushNeedsFetch': 'Сначала загрузите и сохраните список, чтобы было с чем сравнивать.',
  'malSync.pushPushing': 'Отправка…',
  'malSync.pushResult': 'Отправлено: {sent}, с ошибкой: {failed}.',
  'malSync.pushRemaining': { one: 'Ещё {count} ждёт следующей отправки.', few: 'Ещё {count} ждут следующей отправки.', many: 'Ещё {count} ждут следующей отправки.', other: 'Ещё {count} ждут следующей отправки.' },
  'malSync.pushChangedOnMal': { one: '{count} тайтл изменён на MyAnimeList после последней загрузки и оставлен как есть. Загрузите список снова, чтобы сравнить:', few: '{count} тайтла изменены на MyAnimeList после последней загрузки и оставлены как есть. Загрузите список снова, чтобы сравнить:', many: '{count} тайтлов изменены на MyAnimeList после последней загрузки и оставлены как есть. Загрузите список снова, чтобы сравнить:', other: '{count} тайтла изменены на MyAnimeList после последней загрузки и оставлены как есть. Загрузите список снова, чтобы сравнить:' },
  'malSync.pushAdded': 'новое в MyAnimeList',
  'malSync.pushField.status': 'статус',
  'malSync.pushField.score': 'оценка',
  'malSync.pushField.episodes': 'серии',
  'malSync.pushField.rewatching': 'пересмотр',
  'malSync.pushChangeLine': '{field}: {from} → {to}',
  'malSync.pushMore': { one: '…и ещё {count}', few: '…и ещё {count}', many: '…и ещё {count}', other: '…и ещё {count}' },
  'malSync.yes': 'да',
  'malSync.no': 'нет',
  'malSync.related': 'Добавить продолжения и связанные тайтлы',
  'malSync.relatedDesc': 'Ищет тайтлы, связанные с просмотренными и текущими (один запрос к MyAnimeList на тайтл, не более {limit}), и сохраняет их в библиотеке для инструментов субтитров и словаря. В ваш список они не добавляются.',
  'malSync.relatedWorking': 'Поиск связанных тайтлов…',
  'malSync.relatedResult': { one: 'Найден {count} связанный тайтл, новых: {added}.', few: 'Найдено {count} связанных тайтла, новых: {added}.', many: 'Найдено {count} связанных тайтлов, новых: {added}.', other: 'Найдено {count} связанного тайтла, новых: {added}.' },
  'malSync.relatedTruncated': 'Остановлено на лимите запросов; запустите снова, чтобы продолжить.',
  'malSync.relatedNeedsLibrary': 'Сначала сохраните список в библиотеку.',
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
