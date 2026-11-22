import type { Place } from './types';

/**
 * 默认行程用到的地点。name 必须与 defaultTrip 中出发地/目的地/途经点字符串完全一致。
 * 坐标精确到约 100 米；wiki 为英文维基百科条目名，App 运行时据此加载风景照片。
 */
export const DEFAULT_PLACES: Place[] = [
  { name: 'Melbourne VIC', label: '墨尔本', lat: -37.8136, lng: 144.9631, wiki: 'Melbourne' },
  {
    name: 'Torquay VIC', label: 'Torquay 托尔坎', lat: -38.331, lng: 144.326, wiki: 'Torquay, Victoria',
    desc: '大洋路起点，澳洲冲浪之都。可逛 Surf Coast 冲浪品牌店、Torquay 前滩散步，适合第一站喝咖啡休息。',
  },
  {
    name: 'Bells Beach VIC', label: 'Bells Beach 钟声海滩', lat: -38.3713, lng: 144.2817, wiki: 'Bells Beach',
    desc: '世界知名冲浪海滩，Rip Curl Pro 比赛举办地。观景台俯瞰海浪，停留 15–20 分钟即可。',
  },
  {
    name: 'Split Point Lighthouse, Aireys Inlet VIC', label: 'Split Point 灯塔', lat: -38.4675, lng: 144.1053,
    wiki: 'Split Point Lighthouse',
    desc: '白色灯塔立在红色悬崖上，儿童剧《Round the Twist》取景地。可参加灯塔导览登顶。',
  },
  {
    name: 'Lorne VIC', label: 'Lorne 洛恩', lat: -38.542, lng: 143.975, wiki: 'Lorne, Victoria',
    desc: '大洋路上最热闹的海滨小镇，海滩适合孩子玩水；附近 Erskine Falls 瀑布值得绕一下。午餐好选择。',
  },
  {
    name: 'Apollo Bay VIC', label: 'Apollo Bay 阿波罗湾', lat: -38.757, lng: 143.67, wiki: 'Apollo Bay',
    desc: '依山傍海的渔港小镇，Otway 雨林的门户。傍晚港口散步、吃海鲜，Marriners Lookout 可看全景。',
  },
  {
    name: 'Great Otway National Park VIC', label: '奥特威国家公园', lat: -38.75, lng: 143.55, wiki: 'Great Otway National Park',
    desc: '温带雨林，Maits Rest 雨林步道（约 30 分钟）适合孩子；Cape Otway 路边桉树上常能看到野生考拉。',
  },
  {
    name: 'Twelve Apostles VIC', label: '十二门徒岩', lat: -38.6621, lng: 143.1051, wiki: 'The Twelve Apostles (Victoria)',
    desc: '大洋路标志性景观，海中矗立的石灰岩柱。从游客中心走地下通道到观景台，日落时分最美。',
  },
  {
    name: 'Loch Ard Gorge VIC', label: '洛克阿德峡谷', lat: -38.646, lng: 143.07, wiki: 'Loch Ard Gorge',
    desc: '离十二门徒岩几分钟车程，峡谷内有小沙滩可下去，背后有 1878 年沉船的故事。',
  },
  {
    name: 'London Bridge, Port Campbell VIC', label: '伦敦拱门', lat: -38.622, lng: 142.931, wiki: 'London Arch',
    desc: '原本连着陆地的“伦敦桥”1990 年坍塌一半，成为孤立的海上拱门。顺路停留 10 分钟。',
  },
  {
    name: 'Warrnambool VIC', label: 'Warrnambool 沃南布尔', lat: -38.383, lng: 142.483, wiki: 'Warrnambool',
    desc: '大洋路西端的区域中心城市。Flagstaff Hill 海事博物馆晚上有沉船灯光秀，孩子喜欢。',
  },
  {
    name: 'Tower Hill Wildlife Reserve VIC', label: 'Tower Hill 野生动物保护区', lat: -38.317, lng: 142.36,
    wiki: 'Tower Hill Wildlife Reserve',
    desc: '死火山口里的保护区，免费入园，很容易看到鸸鹋、考拉和袋鼠。',
  },
  {
    name: 'Port Fairy VIC', label: 'Port Fairy 仙女港', lat: -38.385, lng: 142.237, wiki: 'Port Fairy',
    desc: '保存完好的 19 世纪渔村，Griffiths Island 环岛步道（约 1 小时）可看灯塔和短尾鹱。',
  },
  {
    name: 'Mount Gambier SA', label: 'Mount Gambier 甘比尔山', lat: -37.829, lng: 140.783, wiki: 'Mount Gambier',
    desc: '建在死火山上的城市，以火山湖和天坑闻名。',
  },
  {
    name: 'Blue Lake, Mount Gambier SA', label: '蓝湖', lat: -37.846, lng: 140.777, wiki: 'Blue Lake / Warwar',
    desc: '火山口湖，每年 11 月至次年 3 月湖水变成钴蓝色——12 月正是最蓝的时候。环湖步道约 3.6 km。',
  },
  {
    name: 'Umpherston Sinkhole SA', label: 'Umpherston 天坑花园', lat: -37.838, lng: 140.797, wiki: 'Umpherston Sinkhole',
    desc: '塌陷的石灰岩天坑里建成的下沉花园，免费。傍晚有负鼠出来觅食。',
  },
  {
    name: 'Beachport SA', label: 'Beachport 海滩港', lat: -37.48, lng: 140.012, wiki: 'Beachport',
    desc: '有南澳第二长的木栈桥；附近 Pool of Siloam 盐湖浮力很大，孩子可以体验漂浮。',
  },
  {
    name: 'Robe SA', label: 'Robe 罗布', lat: -37.163, lng: 139.758, wiki: 'Robe, South Australia',
    desc: '历史海滨小镇，Long Beach 可开车上沙滩，Obelisk 方尖碑和海岸步道风景好，小镇很适合慢逛。',
  },
  {
    name: 'Kingston SE SA', label: 'Kingston SE（大龙虾）', lat: -36.829, lng: 139.853, wiki: 'Kingston SE',
    desc: '路边的“Larry the Lobster”巨型龙虾雕塑是经典打卡点，适合中途休息。',
  },
  {
    name: 'Coorong National Park SA', label: '库隆国家公园', lat: -36.13, lng: 139.65, wiki: 'Coorong National Park',
    desc: '沿海 130 km 的潟湖和沙丘，鹈鹕成群。Princes Hwy 沿线有多个观景点；部分季节湖水呈粉色。',
  },
  {
    name: 'Hahndorf SA', label: 'Hahndorf 汉多夫德国村', lat: -35.029, lng: 138.809, wiki: 'Hahndorf, South Australia',
    desc: '澳洲最古老的德国移民小镇，主街满是德式餐馆、糖果店和手工艺店。夏季附近可摘草莓。',
  },
  { name: 'Adelaide SA', label: '阿德莱德', lat: -34.9285, lng: 138.6007, wiki: 'Adelaide' },
  {
    name: 'Adelaide Central Market SA', label: '阿德莱德中央市场', lat: -34.93, lng: 138.598, wiki: 'Adelaide Central Market',
    desc: '南半球最大的室内农产品市场之一，适合早午餐和买水果零食；旁边就是唐人街。周一、周日休市。',
  },
  {
    name: 'Adelaide Botanic Garden SA', label: '阿德莱德植物园', lat: -34.918, lng: 138.61, wiki: 'Adelaide Botanic Garden',
    desc: '免费开放，维多利亚时代的棕榈温室和热带雨林温室很出片，草坪适合孩子跑。',
  },
  {
    name: 'Glenelg SA', label: 'Glenelg 格雷内尔格海滩', lat: -34.98, lng: 138.515, wiki: 'Glenelg, South Australia',
    desc: '从市区坐电车直达的海滨区，Jetty Road 吃喝逛，海滩看日落；夏天很热闹。',
  },
  {
    name: 'Cleland Wildlife Park SA', label: 'Cleland 野生动物园', lat: -34.968, lng: 138.695, wiki: 'Cleland National Park',
    desc: '可以近距离喂袋鼠、和考拉合影（需预约时段），孩子最爱。可顺路上 Mount Lofty 观景台看城市全景。',
  },
  {
    name: 'Barossa Valley SA', label: '巴罗萨谷', lat: -34.523, lng: 138.959, wiki: 'Barossa Valley',
    desc: '澳洲最著名的葡萄酒产区。带孩子可去 Maggie Beer’s Farm Shop、Whispering Wall 回音墙，大人可品酒（司机注意）。',
  },
  { name: 'Tailem Bend SA', label: 'Tailem Bend', lat: -35.254, lng: 139.455, wiki: 'Tailem Bend, South Australia', desc: '墨累河边小镇，返程第一站加油休息。' },
  { name: 'Bordertown SA', label: 'Bordertown', lat: -36.311, lng: 140.771, wiki: 'Bordertown, South Australia', desc: '南澳边境小镇，镇上有白袋鼠保护区（免费）。' },
  { name: 'Horsham VIC', label: 'Horsham', lat: -36.711, lng: 142.199, wiki: 'Horsham, Victoria', desc: '维州西部区域中心，午餐和加油。' },
  {
    name: 'Halls Gap VIC', label: 'Halls Gap 霍尔斯盖普', lat: -37.137, lng: 142.519, wiki: 'Halls Gap',
    desc: '格兰扁国家公园中心的山间小镇，傍晚草地上常有成群袋鼠，周边有多条瀑布和观景步道。',
  },
  {
    name: 'The Pinnacle Lookout, Grampians VIC', label: 'Pinnacle 观景台（格兰扁）', lat: -37.155, lng: 142.505,
    wiki: 'Grampians National Park',
    desc: '格兰扁最经典的观景点。从 Sundial 停车场出发往返约 4 km，适合大一点的孩子；也可去 MacKenzie Falls 瀑布。',
  },
  {
    name: 'Ballarat VIC', label: 'Ballarat 巴拉瑞特', lat: -37.5622, lng: 143.8503, wiki: 'Ballarat',
    desc: '淘金热古城，Sovereign Hill 淘金镇可体验淘金（门票较贵，需半天）；只吃午饭的话 Lydiard St 一带很漂亮。',
  },
];
