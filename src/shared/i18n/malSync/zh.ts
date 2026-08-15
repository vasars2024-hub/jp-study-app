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

  'malSync.walkthroughTitle': '连接时会发生什么',
  'malSync.walkthroughStep1':
    '会在你平常用的浏览器中打开 MyAnimeList。请在那里登录并授权——本应用不会接触你的密码。',
  'malSync.walkthroughStep2':
    '随后 MyAnimeList 会跳转到 http://localhost/oauth/callback，而这个页面打不开。这是预期行为，不是故障：本应用有意不运行本地网页服务器来接收它。',
  'malSync.walkthroughStep3': '在浏览器地址栏中，复制“code=”后面那串很长的值。',
  'malSync.walkthroughStep4':
    '把它粘贴到这里出现的输入框，然后按“完成连接”。验证码只在几分钟内有效，请立即操作。',

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

  'malSync.library': '库',
  'malSync.libraryDesc':
    '保存后，已获取的作品会留在本应用中，供字幕与词汇工具使用。只保存你刚刚获取的内容，不会联网访问 MyAnimeList，也不会改动那边的列表。',
  'malSync.librarySave': '把已获取的作品保存到库',
  'malSync.librarySaving': '保存中…',
  'malSync.libraryResult': '已保存：新增 {added} 条，更新 {updated} 条，未变 {unchanged} 条。',
  'malSync.libraryRejected': '有 {rejected} 条无法读取，已跳过。',
  'malSync.libraryStored': '库中共有 {total} 部作品。',
  'malSync.libraryEmpty': '尚未保存任何内容。',
  'malSync.libraryDerivatives': '其中 {derivatives} 部是通过相关作品找到的。',
  'malSync.libraryNothingFetched': '请先获取列表，然后再保存。',
  'malSync.statusFilter': '显示',
  'malSync.statusAll': '列表全部',
  'malSync.statusCompleted': '仅已看完',
  'malSync.statusWatching': '仅在看',

  'malSync.error.not-configured': '尚未配置 MyAnimeList 的 Client ID。',
  'malSync.error.not-authenticated': '尚未连接 MyAnimeList，请先连接账号。',
  'malSync.error.reauth-required': 'MyAnimeList 需要你重新登录，请再连接一次账号。',
  'malSync.error.transient': 'MyAnimeList 没有响应，请稍后重试。',
  'malSync.error.request-failed': '向 MyAnimeList 发出的请求失败。',
};
