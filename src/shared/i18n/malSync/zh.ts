// MyAnimeList sync panel — Simplified Chinese. See ./en.ts for why this block did not exist.
import type { Catalog } from '../core';

export const MAL_SYNC_ZH: Catalog = {
  'malSync.title': 'MyAnimeList',
  'malSync.desc': '连接你的 MyAnimeList 账号，把动画列表拉取到应用里。',

  'malSync.setup': '设置',
  'malSync.clientIdDesc':
    '在 MyAnimeList 上注册一个 API 应用，然后把它的 Client ID 粘贴到这里。本应用不会接触你的 MyAnimeList 密码。',
  'malSync.clientId': 'Client ID',
  'malSync.clientIdStored': '已保存——粘贴新的 ID 即可替换',
  'malSync.clientIdPlaceholder': '粘贴你的 MyAnimeList Client ID',
  'malSync.clientIdSave': '保存',
  'malSync.register': '注册应用',
  'malSync.notConfigured': '请先填入 Client ID 再连接。',

  'malSync.account': '账号',
  'malSync.connectedAs': '已作为 {username} 连接。',
  'malSync.notConnected': '未连接。',
  'malSync.plaintextWarning':
    '此设备无法加密保存的凭据，因此访问令牌会以明文形式存放在你的配置文件夹中。',

  'malSync.profileNotice': '这会把 MyAnimeList 连接到位于 {dir} 的配置文件。',
  'malSync.nonDefaultProfileWarning':
    '本应用正运行在非默认的配置文件夹中。你在 MyAnimeList 上的授权是永久且覆盖整个账号的，但令牌只保存在这个文件夹里——如果它是临时的或被删除，你的账号仍处于已授权状态，却无法再从这里使用。若发生这种情况，请到 MyAnimeList 设置中撤销访问权限。',

  'malSync.connect': '连接 MyAnimeList',
  'malSync.callbackCode': '授权码',
  'malSync.callbackPlaceholder': '从跳转后的地址中粘贴授权码',
  'malSync.finish': '完成连接',
  'malSync.callbackDesc':
    '在浏览器中同意授权，然后从跳转到的地址里复制“code”的值并粘贴到上方。该授权码几分钟后失效。',
  'malSync.signOut': '退出登录',

  'malSync.list': '动画列表',
  'malSync.noAutoSync': '拉取是手动且只读的——不会定时执行，也不会写回 MyAnimeList。',
  'malSync.fetching': '拉取中…',
  'malSync.fetchList': '拉取我的列表',
  'malSync.listCount': '已拉取 {count} 条。',
  'malSync.truncated': '达到分页上限时 MyAnimeList 仍有后续页面，因此这份列表并不完整。',

  'malSync.error.not-configured': '尚未配置 MyAnimeList 的 Client ID。',
  'malSync.error.not-authenticated': '尚未连接 MyAnimeList，请先连接账号。',
  'malSync.error.reauth-required': 'MyAnimeList 需要你重新登录，请再连接一次账号。',
  'malSync.error.transient': 'MyAnimeList 没有响应，请稍后重试。',
  'malSync.error.request-failed': '向 MyAnimeList 发出的请求失败。',
};
