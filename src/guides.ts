import type { Rec } from './types';

type R = Omit<Rec, 'id' | 'picked'>;

/**
 * 第 i 天（从 0 开始）的住宿 / 餐饮推荐。
 * 来源：2025–2026 年 Tripadvisor、Wanderlog、OpenTable、各地官方旅游网站上仍在营业的商家。
 * 价格为 12 月旺季一家四口估算，预订前请以官网为准。
 */
export const GUIDES: Record<number, { stays?: R[]; dining?: R[] }> = {
  "0": {
    "stays": [
      {
        "name": "Apollo Bay Holiday Park",
        "type": "度假村小木屋",
        "price": "约 $180–320/晚",
        "cost": 250,
        "note": "有温水泳池和儿童游乐场，离海滩约 100 米，木屋带厨房",
        "where": "Apollo Bay"
      },
      {
        "name": "Beachcomber Motel and Apartments",
        "type": "汽车旅馆/公寓",
        "price": "约 $250–400/晚",
        "cost": 320,
        "note": "有两居室家庭公寓（一大床 + 两单人床）",
        "where": "Apollo Bay"
      },
      {
        "name": "The Apollo Apartments",
        "type": "公寓",
        "price": "约 $230–380/晚",
        "cost": 300,
        "note": "一居/两居公寓，步行一分钟到海滨",
        "where": "Apollo Bay"
      }
    ],
    "dining": [
      {
        "name": "Ipsos",
        "type": "现代希腊菜 · 午餐",
        "price": "$$$",
        "note": "家族经营，有厨师帽评级，旺季需预订",
        "where": "Lorne"
      },
      {
        "name": "The Salty Dog Fish & Chippery",
        "type": "炸鱼薯条 · 午餐",
        "price": "$",
        "note": "买了去海边吃，高峰要排队",
        "where": "Lorne"
      },
      {
        "name": "The Bottle of Milk",
        "type": "汉堡/咖啡 · 午餐",
        "price": "$",
        "note": "营业时间长，孩子吃饭快捷",
        "where": "Lorne"
      },
      {
        "name": "Apollo Bay Fishermen's Co-op",
        "type": "海鲜/炸鱼薯条 · 晚餐",
        "price": "$",
        "note": "渔港直供鲜鱼，经营超过 75 年，可堂食可外带",
        "where": "Apollo Bay"
      },
      {
        "name": "Great Ocean Road Brewhouse",
        "type": "精酿酒吧餐厅 · 晚餐",
        "price": "$$",
        "note": "上菜快，大人小孩都有得吃",
        "where": "Apollo Bay"
      },
      {
        "name": "Casalingo",
        "type": "意大利菜 · 晚餐",
        "price": "$$",
        "note": "温馨海滨小馆，晚餐高峰早点到",
        "where": "Apollo Bay"
      }
    ]
  },
  "1": {
    "stays": [
      {
        "name": "Warrnambool Motel and Holiday Park",
        "type": "汽车旅馆 + 度假村",
        "price": "约 $180–300/晚",
        "cost": 240,
        "note": "儿童游乐场和季节性泳池（12 月开放）",
        "where": "Warrnambool"
      },
      {
        "name": "Discovery Parks - Warrnambool",
        "type": "度假村小木屋",
        "price": "约 $200–350/晚",
        "cost": 280,
        "note": "室外泳池、热水池、游乐场和游戏厅",
        "where": "Warrnambool"
      },
      {
        "name": "Quest Warrnambool",
        "type": "酒店式公寓",
        "price": "约 $250–400/晚",
        "cost": 320,
        "note": "带厨房，方便自己做饭",
        "where": "Warrnambool"
      }
    ],
    "dining": [
      {
        "name": "12 Rocks Cafe & Beach Bar",
        "type": "海景咖啡馆 · 午餐",
        "price": "$$",
        "note": "汉堡、炸鱼薯条，厨房约 15:30 停止出餐",
        "where": "Port Campbell"
      },
      {
        "name": "Grassroots Deli Cafe",
        "type": "咖啡馆/熟食 · 午餐",
        "price": "$",
        "note": "早午餐新鲜，当地推荐",
        "where": "Port Campbell"
      },
      {
        "name": "Port Campbell Hotel",
        "type": "酒吧餐厅 · 午餐",
        "price": "$$",
        "note": "经典酒吧菜，午餐时段有限请先确认",
        "where": "Port Campbell"
      },
      {
        "name": "Rafferty's Tavern",
        "type": "家庭酒吧餐厅 · 晚餐",
        "price": "$$",
        "note": "有专人看护的多层儿童游戏室",
        "where": "Warrnambool"
      },
      {
        "name": "Flying Horse Bar & Brewery",
        "type": "自酿啤酒餐厅 · 晚餐",
        "price": "$$",
        "note": "有大型室内儿童游乐区",
        "where": "Warrnambool"
      },
      {
        "name": "Cattleya Thai Restaurant",
        "type": "泰国菜 · 晚餐",
        "price": "$$",
        "note": "Wanderlog 4.6 分，评论称适合家庭",
        "where": "Warrnambool"
      }
    ]
  },
  "2": {
    "stays": [
      {
        "name": "Blue Lake Holiday Park",
        "type": "度假村（小木屋/公寓）",
        "price": "约 $160–300/晚",
        "cost": 230,
        "note": "有泳池、网球场，靠近蓝湖，最常被推荐给家庭",
        "where": "Mount Gambier"
      },
      {
        "name": "Southgate Motel",
        "type": "汽车旅馆",
        "price": "约 $170–250/晚",
        "cost": 210,
        "note": "家庭经营的四星汽车旅馆",
        "where": "Mount Gambier"
      },
      {
        "name": "Arkana Motor Inn & Terrace Apartments",
        "type": "汽车旅馆/公寓",
        "price": "约 $160–260/晚",
        "cost": 210,
        "note": "家庭性价比高，有烧烤炉和露台",
        "where": "Mount Gambier"
      }
    ],
    "dining": [
      {
        "name": "Coffin Sally",
        "type": "柴火披萨 · 午餐",
        "price": "$$",
        "note": "1840 年代老作坊改建，休闲适合家庭",
        "where": "Port Fairy"
      },
      {
        "name": "Conlan's Wine Store",
        "type": "早午餐/简餐 · 午餐",
        "price": "$$",
        "note": "老建筑里的餐厅兼商店",
        "where": "Port Fairy"
      },
      {
        "name": "Gregory's Cafe Restaurant",
        "type": "咖啡馆餐厅 · 午餐",
        "price": "$$",
        "note": "午餐选择多，建议预订",
        "where": "Port Fairy"
      },
      {
        "name": "Wild Ginger Thai",
        "type": "泰国菜 · 晚餐",
        "price": "$$",
        "note": "城里口碑最好的泰餐之一，17 点起供应晚餐",
        "where": "Mount Gambier"
      },
      {
        "name": "The Barn Steakhouse",
        "type": "牛排馆 · 晚餐",
        "price": "$$$",
        "note": "有儿童高脚椅，家庭评价好",
        "where": "Mount Gambier"
      },
      {
        "name": "The Gates",
        "type": "牛排/酒馆餐厅 · 晚餐",
        "price": "$$",
        "note": "适合休闲家庭聚餐",
        "where": "Mount Gambier"
      }
    ]
  },
  "3": {
    "stays": [
      {
        "name": "Robe Holiday Park",
        "type": "度假村小木屋",
        "price": "约 $160–300/晚",
        "cost": 230,
        "note": "两室木屋最多住 6 人，可租脚踏车",
        "where": "Robe"
      },
      {
        "name": "Discovery Parks - Robe",
        "type": "度假村小木屋",
        "price": "约 $200–380/晚",
        "cost": 290,
        "note": "海边家庭度假村，有室内泳池和儿童池",
        "where": "Robe"
      },
      {
        "name": "Robe Harbour View Motel",
        "type": "汽车旅馆",
        "price": "约 $160–260/晚",
        "cost": 210,
        "note": "可看码头和 Guichen Bay 全景",
        "where": "Robe"
      }
    ],
    "dining": [
      {
        "name": "Caledonian Inn",
        "type": "老酒馆菜",
        "price": "$$",
        "note": "招牌炸肉排和生蚝",
        "where": "Robe"
      },
      {
        "name": "Sails at Robe",
        "type": "现代澳洲菜/海鲜",
        "price": "$$$",
        "note": "海鲜拼盘，氛围比想象中休闲",
        "where": "Robe"
      },
      {
        "name": "Robe Hotel",
        "type": "酒吧餐厅",
        "price": "$$",
        "note": "离海滩很近，经典酒吧菜",
        "where": "Robe"
      }
    ]
  },
  "4": {
    "stays": [
      {
        "name": "Adina Apartment Hotel Adelaide Treasury",
        "type": "酒店式公寓",
        "price": "约 $320–480/晚",
        "cost": 400,
        "note": "市中心，两居家庭公寓带厨房洗衣机，免费婴儿床",
        "where": "Adelaide"
      },
      {
        "name": "Oaks Adelaide Embassy Suites",
        "type": "酒店式公寓",
        "price": "约 $280–450/晚",
        "cost": 360,
        "note": "North Terrace，一至三居，步行到 Rundle Mall",
        "where": "Adelaide"
      },
      {
        "name": "Discovery Parks - West Beach Parks",
        "type": "海滨度假村小木屋",
        "price": "约 $220–420/晚",
        "cost": 320,
        "note": "泻湖泳池、戏水区、跳跳垫、卡丁车，靠近 Glenelg",
        "where": "Adelaide"
      }
    ],
    "dining": [
      {
        "name": "Breeze Cafe",
        "type": "外卖咖啡馆 · 午餐",
        "price": "$",
        "note": "Meningie 湖边，可试当地 Coorong 鲻鱼",
        "where": "Meningie"
      },
      {
        "name": "Larry the Big Lobster",
        "type": "外卖/简餐 · 午餐",
        "price": "$",
        "note": "Kingston SE 巨型龙虾地标，店内营业时间请先确认",
        "where": "Meningie"
      },
      {
        "name": "Hahndorf Inn",
        "type": "德国菜 · 晚餐",
        "price": "$$",
        "note": "1863 年老旅馆，最多人推荐，提前订位",
        "where": "Hahndorf"
      },
      {
        "name": "The Haus Restaurant",
        "type": "德国菜/现代澳洲菜 · 晚餐",
        "price": "$$",
        "note": "很受欢迎，强烈建议订位",
        "where": "Hahndorf"
      },
      {
        "name": "German Arms Hotel",
        "type": "德国乡村酒馆菜 · 晚餐",
        "price": "$$",
        "note": "150 多年历史的德式酒馆",
        "where": "Hahndorf"
      }
    ]
  },
  "5": {
    "stays": [
      {
        "name": "Adina Apartment Hotel Adelaide Treasury",
        "type": "酒店式公寓",
        "price": "约 $320–480/晚",
        "cost": 400,
        "note": "市中心，两居家庭公寓带厨房洗衣机，免费婴儿床",
        "where": "Adelaide"
      },
      {
        "name": "Oaks Adelaide Embassy Suites",
        "type": "酒店式公寓",
        "price": "约 $280–450/晚",
        "cost": 360,
        "note": "North Terrace，一至三居，步行到 Rundle Mall",
        "where": "Adelaide"
      },
      {
        "name": "Discovery Parks - West Beach Parks",
        "type": "海滨度假村小木屋",
        "price": "约 $220–420/晚",
        "cost": 320,
        "note": "泻湖泳池、戏水区、跳跳垫、卡丁车，靠近 Glenelg",
        "where": "Adelaide"
      }
    ],
    "dining": [
      {
        "name": "Adelaide Central Market",
        "type": "室内食品市场",
        "price": "$",
        "note": "选择多，共享长桌，周一、周日休市",
        "where": "Adelaide"
      },
      {
        "name": "Doughballs",
        "type": "披萨",
        "price": "$$",
        "note": "有儿童菜单，Glenelg 店近海滨游乐场",
        "where": "Adelaide"
      },
      {
        "name": "The Moseley Bar & Kitchen",
        "type": "酒吧餐厅",
        "price": "$$",
        "note": "Glenelg，有封闭式儿童游乐区",
        "where": "Adelaide"
      }
    ]
  },
  "6": {
    "stays": [
      {
        "name": "Adina Apartment Hotel Adelaide Treasury",
        "type": "酒店式公寓",
        "price": "约 $320–480/晚",
        "cost": 400,
        "note": "市中心，两居家庭公寓带厨房洗衣机，免费婴儿床",
        "where": "Adelaide"
      },
      {
        "name": "Oaks Adelaide Embassy Suites",
        "type": "酒店式公寓",
        "price": "约 $280–450/晚",
        "cost": 360,
        "note": "North Terrace，一至三居，步行到 Rundle Mall",
        "where": "Adelaide"
      },
      {
        "name": "Discovery Parks - West Beach Parks",
        "type": "海滨度假村小木屋",
        "price": "约 $220–420/晚",
        "cost": 320,
        "note": "泻湖泳池、戏水区、跳跳垫、卡丁车，靠近 Glenelg",
        "where": "Adelaide"
      }
    ],
    "dining": [
      {
        "name": "Maggie Beer's Farm Shop",
        "type": "农场店/简餐 · 午餐",
        "price": "$$",
        "note": "湖边步道，适合亲子",
        "where": "Barossa"
      },
      {
        "name": "Fino at Seppeltsfield",
        "type": "酒庄餐厅 · 午餐",
        "price": "$$$",
        "note": "每天 12–15 点，当季本地食材",
        "where": "Barossa"
      },
      {
        "name": "Whistler Wines",
        "type": "酒庄拼盘 · 午餐",
        "price": "$$",
        "note": "有游乐设施和可爬的树",
        "where": "Barossa"
      }
    ]
  },
  "7": {
    "stays": [
      {
        "name": "NRMA Halls Gap Holiday Park",
        "type": "度假村小木屋/别墅",
        "price": "约 $180–350/晚",
        "cost": 260,
        "note": "泳池、单车泵道、跳跳垫，亲子设施最全",
        "where": "Halls Gap"
      },
      {
        "name": "Breeze Holiday Parks - Halls Gap",
        "type": "度假村小木屋/别墅",
        "price": "约 $170–320/晚",
        "cost": 240,
        "note": "步行 10 分钟到国家公园",
        "where": "Halls Gap"
      },
      {
        "name": "Kookaburra Lodge Motel",
        "type": "汽车旅馆",
        "price": "约 $160–250/晚",
        "cost": 200,
        "note": "房间全在一楼，在村中心",
        "where": "Halls Gap"
      }
    ],
    "dining": [
      {
        "name": "Spirit of Punjab",
        "type": "印度菜",
        "price": "$$",
        "note": "17 点起供应晚餐，有素食选择",
        "where": "Halls Gap"
      },
      {
        "name": "Halls Gap Hotel",
        "type": "现代澳洲/酒吧菜",
        "price": "$$",
        "note": "适合休闲家庭晚餐",
        "where": "Halls Gap"
      },
      {
        "name": "Livefast Cafe",
        "type": "咖啡馆/早午餐",
        "price": "$",
        "note": "咖啡好，本地食材",
        "where": "Halls Gap"
      }
    ]
  },
  "8": {
    "stays": [],
    "dining": [
      {
        "name": "Golden Point Hotel",
        "type": "家庭酒吧餐厅 · 午餐",
        "price": "$$",
        "note": "Sovereign Hill 对面，大型室内游乐场",
        "where": "Ballarat"
      },
      {
        "name": "Hydrant Food Hall",
        "type": "咖啡馆/早午餐 · 午餐",
        "price": "$",
        "note": "老巷子里，每天 7:30–14:30",
        "where": "Ballarat"
      },
      {
        "name": "Aunty Jacks",
        "type": "自酿酒吧餐厅 · 午餐",
        "price": "$$",
        "note": "市中心，亲子用餐清单常客",
        "where": "Ballarat"
      }
    ]
  }
};
