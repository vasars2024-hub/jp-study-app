// Traditional → Simplified Chinese, one character at a time: the fold that
// lets 學習 and 学习 share one knowledge key (`shared/knowledgeKey.ts`).
//
// OpenCC-style (its `TSCharacters` direction and its one-character-to-one-
// character model), but NOT copied from OpenCC or any other data set: the
// table below was written for Gum by hand, following the standard
// Traditional/Simplified correspondence that the Table of General Standard
// Chinese Characters (通用规范汉字表, 2013) lists, limited to what a learner
// meets — the everyday characters and the common components. No third-party
// data is bundled, so it needs no entry in `thirdPartyBundled.json`.
//
// THE RULE
//
//  - Only characters whose Traditional form is NOT also a Simplified word of
//    its own are folded. 乾 (乾坤 stays 乾), 著 (著名 stays 著), 藉, 瞭, 夥 and
//    the like are left alone: folding them would merge distinct Simplified
//    words, which is worse than missing a fold.
//  - Many-to-one is fine (發/髮 → 发, 後 → 后, 臺/颱/檯 → 台): the fold only ever
//    runs Traditional → Simplified, so nothing has to be split again.
//  - Idempotent: no Simplified value is itself a key, so folding twice is
//    folding once. `zhVariants.test` checks that.
//
// About 1,600 pairs, ~10 KB of source: parsed into a Map on first use, never at
// import, so a Japanese- or Russian-only session never pays for it.

/** Alternating pairs: each Traditional character followed by its Simplified form. */
const PAIRS: readonly string[] = [
  '語语話话說说讀读請请謝谢認认識识記记計计訂订討讨訓训議议讓让該该詞词試试詩诗誌志課课誰谁調调談谈論论諸诸謂谓譯译護护讚赞證证評评',
  '設设許许訪访訴诉診诊詳详誤误誠诚誇夸詢询諾诺謀谋講讲謎谜譜谱變变訊讯託托詐诈誘诱誕诞謙谦謠谣譏讥諒谅諮咨謹谨譽誉訟讼詛诅詠咏誼谊',
  '諷讽謬谬譴谴訣诀詭诡詮诠誦诵諧谐謊谎謁谒訝讶訛讹詼诙誹诽諦谛諱讳謄誊譁哗詔诏詣诣誨诲諭谕訖讫詰诘誥诰諂谄諄谆謔谑謾谩訃讣訌讧讒谗',
  '讞谳錢钱銀银鐵铁鋼钢銅铜錯错鐘钟鍾钟針针釘钉鈴铃鉛铅銷销鋒锋鋪铺鎖锁鏡镜鐮镰鑰钥錄录鈔钞鈕钮鉤钩銳锐鋁铝錫锡錦锦鍋锅鍵键鎮镇鏈链',
  '鑽钻鑄铸鑑鉴鑒鉴錶表銘铭鋤锄鋸锯錘锤鍛锻鏟铲鐲镯鈍钝鈣钙鈉钠鉀钾鉑铂銹锈鏽锈錨锚鍍镀鎢钨鐳镭鑼锣鈞钧釣钓鈸钹鉗钳鉸铰銜衔鋅锌錐锥',
  '錠锭鍬锹鎊镑鏢镖鐐镣鐺铛鑲镶鑾銮錮锢鋇钡鈷钴鉻铬鎳镍鋰锂鈦钛鉅巨鐫镌鏗铿鏘锵鍊炼鎗枪鉚铆飯饭飲饮餓饿館馆餅饼餃饺饅馒飽饱飼饲飾饰',
  '餘余饑饥飢饥餵喂餡馅饒饶饋馈饞馋蝕蚀餞饯餚肴餒馁餿馊饌馔飪饪飩饨餌饵饃馍饉馑餽馈饗飨經经紅红給给約约級级紀纪純纯紙纸細细終终組组',
  '結结絕绝統统絲丝綠绿維维網网緊紧線线練练編编縮缩總总績绩織织繼继續续纜缆紡纺紛纷紋纹納纳紐纽絡络絨绒綁绑綜综緒绪緣缘緩缓緯纬縣县',
  '縫缝縱纵繩绳繪绘繫系繳缴纖纤纏缠纓缨綱纲綿绵緻致縛缚繞绕繡绣縷缕繃绷紗纱紳绅紹绍絞绞絹绢綢绸綵彩綽绰緝缉緬缅締缔繭茧紮扎紓纾絢绚',
  '綺绮綻绽緞缎縝缜縈萦繽缤綴缀紕纰紆纡綸纶縐绉繹绎纔才絆绊綏绥緘缄繚缭糾纠紉纫紜纭絳绛綹绺緋绯緲缈緶缏縊缢纍累門门問问間间開开關关',
  '閉闭閃闪閒闲閑闲閱阅闊阔闖闯闡阐闢辟閣阁閥阀閨闺閩闽閘闸閻阎闆板闔阖闌阑闕阙鬧闹閏闰閔闵閡阂閭闾閾阈闈闱闐阗馬马媽妈嗎吗罵骂碼码',
  '騎骑驗验驚惊騙骗驅驱駕驾駐驻駛驶驢驴驟骤騰腾駝驼駱骆驕骄驛驿騷骚驥骥驪骊駁驳駒驹駿骏騁骋騾骡馴驯馳驰駭骇駢骈驀蓦篤笃瑪玛螞蚂騫骞',
  '騖骛驍骁魚鱼鮮鲜鯨鲸鯉鲤鯊鲨鰻鳗鱷鳄鱗鳞鮑鲍鯽鲫鰐鳄鱈鳕鱒鳟鱸鲈鰭鳍鯰鲶鮭鲑鰱鲢鱔鳝魯鲁漁渔蘇苏穌稣鰲鳌鯛鲷鰓鳃鰍鳅鮪鲔鯖鲭鰹鲣',
  '鯧鲳鳥鸟鳴鸣鴨鸭鵝鹅鴿鸽鷹鹰鶴鹤雞鸡鷄鸡鵬鹏鷗鸥鴉鸦鵲鹊鸚鹦鵡鹉鸞鸾鳳凤鴻鸿鷺鹭鶯莺鴛鸳鴦鸯鵑鹃鴕鸵鶩鹜鷲鹫鵠鹄鷓鹧鴣鸪鸛鹳鷸鹬',
  '鸕鸬鷂鹞鷥鸶鶉鹑鵪鹌鳩鸠鴇鸨鴟鸱鵰雕貝贝買买賣卖費费貴贵資资賓宾賞赏賠赔賬账財财貨货貧贫販贩貪贪責责貢贡購购貿贸賀贺賊贼賄贿賂赂',
  '賃赁賜赐賦赋質质賴赖贈赠贊赞贏赢贖赎賺赚負负敗败則则側侧測测廁厕貫贯貼贴貯贮賽赛賭赌賤贱贓赃贍赡貸贷貶贬貽贻賑赈賒赊賢贤賈贾贅赘',
  '贛赣員员圓圆損损韻韵勛勋勳勋隕陨殞殒貞贞偵侦幀帧禎祯賅赅惻恻鍘铡頁页頂顶項项順顺須须預预領领頭头題题顏颜願愿類类顧顾顯显額额頻频',
  '顆颗頓顿頒颁頌颂頗颇頸颈頰颊頹颓顫颤顛颠顱颅顎颚頑顽碩硕煩烦傾倾穎颖顴颧囂嚣頤颐頡颉顓颛頦颏車车軍军輕轻輛辆輪轮轉转載载較较輸输',
  '轟轰輔辅輯辑轄辖軌轨軒轩軟软軸轴轎轿輝辉輩辈轍辙轅辕庫库褲裤連连運运陣阵揮挥渾浑暈晕蓮莲漣涟斬斩暫暂漸渐慚惭嶄崭範范擊击輿舆輾辗',
  '轆辘軋轧軛轭軻轲軼轶輒辄輓挽輻辐轡辔軲轱塹堑槧椠璉琏見见觀观規规視视親亲覺觉覽览現现覓觅寬宽硯砚覲觐覷觑覦觎覬觊靚靓莧苋攬揽欖榄',
  '檻槛艦舰濫滥籃篮藍蓝襤褴尷尴學学習习國国東东長长時时書书會会來来個个們们這这還还過过進进遠远達达選选邊边遊游適适遲迟遞递遷迁遺遗',
  '邏逻遼辽邁迈對对號号點点當当實实寫写為为爲为樣样樂乐業业從从發发髮发後后無无機机歲岁歷历曆历氣气漢汉爭争電电動动勞劳務务勝胜勢势',
  '勵励區区醫医華华協协單单衛卫廠厂壓压厭厌參参雙双叢丛嚴严喪丧營营圍围團团圖图園园聖圣場场塊块堅坚報报墳坟壞坏壯壮聲声處处備备復复',
  '複复夠够夢梦奪夺奮奋婦妇孫孙寧宁寢寝審审寶宝將将專专尋寻導导屆届屬属層层嶺岭幣币帥帅師师帳帐帶带幫帮幹干廣广莊庄慶庆廢废廳厅彈弹',
  '強强歸归彙汇匯汇徑径徹彻恆恒恥耻悅悦惡恶惱恼愛爱態态慣惯慘惨憂忧慮虑憶忆應应懷怀懶懒戀恋戰战戲戏戯戏戶户執执擴扩掃扫掛挂採采換换',
  '據据擔担擁拥擇择擠挤擺摆擾扰攝摄攜携搶抢搖摇撲扑撐撑擬拟擋挡撿捡敵敌數数斷断晝昼曉晓暢畅朧胧條条楊杨極极構构槍枪樓楼標标樹树橋桥',
  '檢检欄栏權权歡欢歐欧殺杀殼壳毀毁決决沒没況况淚泪淺浅濟济溫温滿满滅灭滾滚漲涨潔洁潛潜澤泽濃浓濕湿灣湾灘滩灑洒災灾爐炉烏乌煙烟熱热',
  '燈灯燒烧爺爷牆墙獨独獄狱獎奖獲获獵猎獸兽狀状猶犹環环瑣琐產产畫画畢毕異异療疗瘋疯癢痒癡痴盜盗盡尽監监盤盘眾众衆众睜睁瞞瞒礦矿確确',
  '礙碍禮礼禱祷禍祸離离種种稱称穩稳積积窮穷竊窃競竞筆笔節节築筑簡简籠笼糧粮罰罚羅罗義义聞闻聯联聰聪聽听職职肅肃腦脑腳脚膽胆臉脸臨临',
  '與与興兴舉举舊旧藝艺蘭兰藥药蘋苹蘿萝虛虚蟲虫蠶蚕蠻蛮補补裝装製制襪袜襯衬觸触豐丰豬猪貓猫趕赶趨趋跡迹踐践蹤踪躍跃軀躯辦办辭辞農农',
  '郵邮鄉乡鄰邻鄭郑醜丑釋释裡里裏里陽阳陰阴陳陈陸陆隊队階阶際际隨随險险隱隐隸隶雖虽雜杂難难雲云靈灵靜静響响風风飛飞飄飘颱台臺台檯台',
  '體体髒脏鬆松鬥斗鬱郁麥麦黃黄齊齐齒齿龍龙龜龟億亿價价儀仪優优償偿儲储傘伞傳传傷伤僅仅偉伟傑杰債债傭佣僕仆僑侨儉俭儘尽兒儿內内兩两',
  '冊册凍冻淨净劃划劇剧劍剑劑剂創创剛刚剝剥勁劲勻匀卻却厲厉吳吴唄呗啞哑喚唤喬乔嗚呜嘆叹歎叹嘗尝嚐尝噸吨噴喷嚇吓嚨咙嚮向囑嘱堯尧塗涂',
  '塵尘墊垫墜坠壇坛罈坛壘垒壩坝夾夹奧奥妝妆婁娄嬰婴嫵妩嬌娇宮宫寵宠壽寿屍尸屜屉岡冈島岛峽峡嶼屿巖岩巒峦鞏巩幟帜幾几廂厢廈厦廚厨廟庙',
  '弔吊張张彌弥彎弯徵征憑凭愴怆慫怂憐怜憲宪懇恳懲惩懸悬懼惧拋抛挾挟捨舍掙挣揚扬搗捣摟搂摯挚摻掺撥拨撫抚撓挠撈捞撻挞擰拧擱搁擲掷攏拢',
  '攔拦攙搀攤摊攪搅敘叙斂敛斃毙於于晉晋暉晖曬晒曠旷柵栅棄弃棗枣棟栋楓枫榮荣槓杠槳桨樁桩樞枢橫横檔档櫃柜櫻樱殘残殯殡毆殴氈毡氫氢沖冲',
  '衝冲淒凄涼凉減减湯汤滄沧準准溝沟滲渗滬沪漬渍潑泼澀涩濁浊濤涛濱滨瀉泻瀏浏瀕濒瀝沥瀟潇煉炼燉炖燦灿燭烛爛烂爾尔牽牵犧牺狹狭狽狈猙狰',
  '獰狞獻献瑩莹瓊琼甕瓮畝亩疊叠瘡疮癒愈癥症皺皱盞盏睏困矚瞩礎础祕秘禪禅禦御稅税稜棱穀谷窩窝窯窑竄窜竅窍筍笋箏筝簍篓簾帘簽签籤签籌筹',
  '籬篱粵粤糞粪糰团罷罢翹翘聳耸脅胁脈脉脫脱脹胀腎肾膚肤膠胶膩腻膿脓臍脐臘腊臟脏臥卧艱艰艷艳豔艳莖茎萬万葉叶葦苇蓋盖蒼苍蔣蒋蔥葱蔭荫',
  '薦荐薑姜薩萨蘆芦虜虏虧亏蝦虾螢萤蠅蝇蠍蝎襖袄豈岂豎竖竪竖貍狸趙赵躊踌辮辫醞酝醬酱釀酿陝陕隴陇雛雏霧雾靄霭韌韧韓韩韋韦違违颳刮颶飓',
  '颼飕飆飙骯肮鬍胡黨党黴霉齋斋龐庞龔龚龕龛鹽盐麗丽麼么齡龄齣出隻只週周麵面麪面劉刘蕭萧馮冯鄧邓盧卢譚谭鄒邹啟启啓启兇凶喫吃嘩哗噁恶',
  '囉啰壺壶屢屡弒弑懺忏捲卷揀拣擄掳攢攒昇升暱昵曖暧棲栖櫥橱氾泛汙污渙涣渦涡湧涌滯滞滷卤鹵卤潰溃潤润澆浇濺溅獅狮璽玺甦苏疇畴瘍疡瘓痪',
  '癱瘫矯矫礫砾祿禄稟禀穢秽篩筛簫箫羶膻聶聂艙舱蕩荡蕪芜薈荟蘊蕴蟬蝉蟻蚁蠟蜡迴回逕径釐厘隄堤鬢鬓髏髅麩麸傢家傖伧儈侩儂侬儕侪儔俦儺傩',
  '兗兖冪幂凜凛剄刭剮剐劊刽勸劝匭匦厙厍嘍喽噯嗳嚀咛圇囵墾垦壙圹奐奂妳你媧娲嬸婶孿孪屨屦峴岘崗岗嵐岚巔巅幗帼廬庐彥彦徠徕悵怅惲恽愜惬',
  '慟恸慪怄憊惫憫悯懌怿懨恹戇戆揹背搾榨摑掴摜掼撏挦擷撷擻擞攣挛曇昙梘枧棧栈椏桠楨桢榿桤槨椁樸朴橈桡檜桧櫓橹櫚榈欒栾歟欤殲歼氌氇洶汹',
  '涇泾淵渊渢沨溈沩滸浒漚沤潿涠澗涧澠渑濘泞濰潍瀋沈瀾澜灕漓灩滟烴烃煒炜熾炽燁烨燙烫燜焖犢犊獁犸獷犷玀猡瑋玮璣玑甌瓯畬畲疿痱痙痉瘞瘗',
  '瘻瘘癆痨癇痫癟瘪皚皑睞睐瞼睑砲炮碭砀磚砖磯矶礬矾禿秃穡穑窪洼窶窭竇窦筧笕箋笺篋箧篳筚簀箦簞箪籜箨糝糁糴籴糶粜紂纣絀绌綞缍縞缟縵缦',
  '繒缯罌罂羥羟翬翚耬耧聹聍脛胫脣唇腖胨膾脍臏膑艤舣艫舻芻刍茲兹莢荚蒔莳蓀荪蓴莼蔞蒌蕎荞蕘荛薊蓟藎荩藪薮蘄蕲蘚藓虯虬蛺蛱蜆蚬蝸蜗螻蝼',
  '蟄蛰蠱蛊衊蔑袞衮裊袅褸褛襠裆覡觋觴觞訐讦訥讷詒诒誆诓諉诿謨谟譖谮譎谲讕谰讖谶豶豮貲赀貺贶賁贲賚赉賡赓贄贽贐赆赬赪趲趱躋跻躑踯躡蹑',
  '軫轸輅辂輊轾輥辊轔辚邐逦郟郏鄖郧鄴邺酈郦鈀钯鈁钫鈮铌銻锑鋨锇鍥锲鍶锶鎂镁鏤镂鐒铹鑠铄閶阊闋阕闓闿闥闼隉陧雋隽霑沾靦腼鞦秋韁缰韞韫',
  '頎颀颮飑颯飒颺飏飫饫餉饷餛馄餳饧餷馇饈馐饢馕騅骓騍骒驂骖驃骠驊骅驌骕鬩阋魎魉魘魇鯗鲞鶼鹣鷙鸷黿鼋鼴鼹齏齑齪龊齦龈鬮阄黷黩',
];

let table: Map<string, string> | null = null;

function foldTable(): Map<string, string> {
  if (table) return table;
  table = new Map();
  for (const line of PAIRS) {
    const chars = [...line];
    for (let i = 0; i + 1 < chars.length; i += 2) table.set(chars[i], chars[i + 1]);
  }
  return table;
}

/** Han characters: the only ones the table can hold, so anything else skips the lookup. */
const HAN = /[㐀-鿿豈-﫿𠀀-𯨟]/u;

/** `text` with every Traditional character this table knows folded to Simplified. */
export function toSimplifiedChinese(text: string): string {
  if (!text || !HAN.test(text)) return text;
  const map = foldTable();
  let out = '';
  let changed = false;
  for (const ch of text) {
    const folded = map.get(ch);
    if (folded) {
      out += folded;
      changed = true;
    } else {
      out += ch;
    }
  }
  return changed ? out : text;
}

/** True when `text` holds at least one Traditional character the fold changes. */
export function hasTraditionalChinese(text: string): boolean {
  return toSimplifiedChinese(text) !== text;
}

/** How many characters the table folds. */
export function zhVariantPairCount(): number {
  return foldTable().size;
}
