import type { VerifiedStay } from './stays';

/**
 * 核实日期。来源：各住宿官网 / 连锁官网 / 州旅游局页面，评分来自 Booking.com、Expedia 等平台的公开页面（以搜索结果核对）。
 * 价格都是 12 月旺季的估算，以预订时报价为准。
 */
export const STAYS_CHECKED = '2026-11-22';

/** 过夜地（Day.to）→ 已核实的住宿 */
export const VERIFIED_STAYS: Record<string, VerifiedStay[]> = {

  "Apollo Bay VIC": [
    {
      "name": "Apollo Bay Holiday Park",
      "town": "Apollo Bay",
      "type": "度假村带厨房小木屋（可住 4–6 人）",
      "officialUrl": "",
      "bookingUrl": "https://www.booking.com/hotel/au/apollo-bay-holiday-park.html",
      "rating": "Expedia 8.4/10（约 316 条）",
      "priceNote": "估算约 $180–320/晚",
      "cost": 240,
      "note": "温水泳池、儿童游乐场和游戏室，离海滩约 100 米"
    },
    {
      "name": "Beachcomber Motel & Apartments",
      "town": "Apollo Bay",
      "type": "家庭公寓（一大床 + 两单人床，两间卧室）",
      "officialUrl": "",
      "bookingUrl": "https://www.wotif.com/Apollo-Bay-Hotels-Beachcomber-Motel-And-Apartments-Apollo-Bay.h9624904.Hotel-Information",
      "rating": "Expedia 9.0/10；Kayak 8.2/10（约 1,800 条）",
      "priceNote": "估算约 $250–400/晚",
      "cost": 300,
      "note": "公寓带厨房，评论说房间宽敞干净；订前确认是两卧的家庭公寓"
    },
    {
      "name": "The Apollo Apartments",
      "town": "Apollo Bay（169 Great Ocean Rd）",
      "type": "一卧 / 两卧公寓（两卧可住 6 人）",
      "officialUrl": "https://visitgreatoceanroad.org.au/accommodation/the-apollo-apartments/",
      "bookingUrl": "https://www.booking.com/hotel/au/the-apollo.html",
      "rating": "Booking.com 8.9（情侣评分）；两卧住客 9.5–10",
      "priceNote": "估算约 $230–380/晚",
      "cost": 300,
      "note": "步行一分钟到海滨，自带厨房；有楼梯没有电梯"
    }
  ],
  "Port Campbell VIC": [
    {
      "name": "NRMA Port Campbell Holiday Park",
      "town": "Port Campbell",
      "type": "度假村两卧小屋 / Creekside 别墅（可住 4–5 人）",
      "officialUrl": "https://www.nrmaparksandresorts.com.au/port-campbell/",
      "bookingUrl": "https://www.booking.com/hotel/au/port-campbell-holiday-park.html",
      "rating": "Booking.com 8.5/10",
      "priceNote": "估算约 $240–290/晚",
      "cost": 260,
      "note": "步行到小镇和海滩，有厨房和 BBQ；圣诞前后可能要求最少住几晚"
    },
    {
      "name": "Port Campbell Parkview Motel & Apartments",
      "town": "Port Campbell",
      "type": "汽车旅馆两卧家庭套房（可住 4–5 人）",
      "officialUrl": "",
      "bookingUrl": "https://www.booking.com/hotel/au/port-campbell-parkview-motel-amp-apartments.html",
      "rating": "Expedia 9.2/10",
      "priceNote": "估算约 $220–280/晚",
      "cost": 250,
      "note": "街道安静，步行到海滩，家庭房带厨房；不含早餐"
    },
    {
      "name": "Sea Foam Villas",
      "town": "Port Campbell",
      "type": "海湾两卧公寓（可住 4 人）",
      "officialUrl": "https://visitgreatoceanroad.org.au/accommodation/sea-foam-villas/",
      "bookingUrl": "https://www.booking.com/hotel/au/sea-foam-villas.html",
      "rating": "Booking.com 8.2/10（约 3,100 条）",
      "priceNote": "估算约 $300–380/晚",
      "cost": 330,
      "note": "正对海湾，有厨房；多数房间要走楼梯，车位较紧"
    }
  ],
  "Mount Gambier SA": [
    {
      "name": "The Barn Accommodation",
      "town": "Mount Gambier（Ob Flat，747 Glenelg River Rd）",
      "type": "两卧公寓（约 60㎡，可住 5 人）/ 家庭套房（最多 7 人）",
      "officialUrl": "https://www.barn.com.au/",
      "bookingUrl": "https://www.booking.com/hotel/au/barn-accommodation.html",
      "rating": "Expedia 9.2/10（约 1,000 条）；Kayak 8.9/10",
      "priceNote": "估算约 $250–320/晚（以官网报价为准）",
      "cost": 280,
      "note": "自带厨房的公寓，院内就是 The Barn Steakhouse 牛排馆，到了直接吃晚饭；离市中心和蓝湖约 8 km，傍晚路上袋鼠多"
    },
    {
      "name": "BIG4 Blue Lake Holiday Park",
      "town": "Mount Gambier",
      "type": "度假村两卧小屋（可住 4–6 人）",
      "officialUrl": "https://www.big4.com.au/caravan-parks/sa/limestone-coast/blue-lake-holiday-park",
      "bookingUrl": "https://www.booking.com/hotel/au/blue-lake-holiday-park.html",
      "rating": "Booking.com 9.2/10（325 条）",
      "priceNote": "估算约 $180–230/晚",
      "cost": 200,
      "note": "紧挨蓝湖，室内泳池带滑梯，有咖啡馆；床偏小"
    },
    {
      "name": "Comfort Inn The Lakes",
      "town": "Mount Gambier",
      "type": "连锁酒店家庭房（1 大床 + 2 单人床）",
      "officialUrl": "https://www.choicehotels.com/hotel/au953",
      "bookingUrl": "https://www.booking.com/hotel/au/lakes-resort-mount-gambier.html",
      "rating": "Booking.com 8.1/10（482 条）",
      "priceNote": "估算约 $170–210/晚",
      "cost": 190,
      "note": "步行约 5 分钟到蓝湖，有室内泳池和餐厅；订前确认家庭房"
    },
    {
      "name": "Aloha Central Luxury Apartments",
      "town": "Mount Gambier",
      "type": "市中心两卧公寓（可住 4 人）",
      "officialUrl": "https://www.aloha.au/mount-gambier",
      "bookingUrl": "https://www.booking.com/hotel/au/aloha-luxury-central.html",
      "rating": "Booking.com 9.5/10（197 条）",
      "priceNote": "估算约 $270–330/晚",
      "cost": 300,
      "note": "新而宽敞，有洗衣机；开车约 5 分钟到蓝湖"
    }
  ],
  "Robe SA": [
    {
      "name": "Discovery Parks - Robe",
      "town": "Robe",
      "type": "度假村两卧小屋（可住 4–6 人）",
      "officialUrl": "https://www.discoveryholidayparks.com.au/caravan-parks/south-australia/limestone-coast/robe",
      "bookingUrl": "https://www.booking.com/hotel/au/discovery-holiday-parks-robe.html",
      "rating": "Booking.com 8.4/10（669 条）",
      "priceNote": "估算约 $200–260/晚",
      "cost": 220,
      "note": "Long Beach 海边，室内恒温泳池、游乐场；离镇中心约 2 km"
    },
    {
      "name": "Harbour View Motel",
      "town": "Robe",
      "type": "汽车旅馆家庭房（1 大床 + 2 单人床）",
      "officialUrl": "https://southaustralia.com/products/limestone-coast/accommodation/robe-harbour-view-motel",
      "bookingUrl": "https://www.booking.com/hotel/au/harbour-view-motel.html",
      "rating": "Booking.com 8.5/10（859 条）",
      "priceNote": "估算约 $180–230/晚",
      "cost": 200,
      "note": "有儿童游乐场和 BBQ，步行到镇中心；设施稍旧"
    },
    {
      "name": "Robe Marina Accommodation",
      "town": "Robe",
      "type": "码头两卧公寓（可住 4 人）",
      "officialUrl": "https://www.robemarinaaccommodation.com.au/",
      "bookingUrl": "https://www.booking.com/hotel/au/robe-marina-accommodation.html",
      "rating": "Expedia 8.6/10（164 条）",
      "priceNote": "估算约 $300–380/晚",
      "cost": 330,
      "note": "码头边近镇中心，全厨房带洗衣；旺季常要求最少住几晚"
    }
  ],
  "Adelaide SA": [
    {
      "name": "Majestic Old Lion Apartments",
      "town": "North Adelaide",
      "type": "两卧公寓（最多住 5 人）",
      "officialUrl": "https://southaustralia.com/products/adelaide/accommodation/majestic-old-lion-apartments/two-bedroom",
      "bookingUrl": "https://www.booking.com/hotel/au/majestic-old-lion-apartments.html",
      "rating": "Kayak 8.2–8.4/10（1,600+ 条）",
      "priceNote": "估算约 $250–310/晚",
      "cost": 280,
      "note": "离动物园最近（步行约 15 分钟），有厨房洗衣；停车约 $15/晚"
    },
    {
      "name": "Oaks Adelaide Embassy Suites",
      "town": "Adelaide",
      "type": "两卧公寓（可住 4–5 人）",
      "officialUrl": "https://www.minorhotels.com/en/oaks/oaks-embassy",
      "bookingUrl": "https://www.booking.com/hotel/au/oaks-embassy.html",
      "rating": "Traveloka 8.4/10（约 2,000 条）",
      "priceNote": "估算约 $300–360/晚",
      "cost": 330,
      "note": "North Terrace，步行 10 分钟到博物馆；隔壁停车场约 $30/晚"
    },
    {
      "name": "Oaks Adelaide Horizons Suites",
      "town": "Adelaide",
      "type": "两卧公寓（最多住 5 人）",
      "officialUrl": "https://www.minorhotels.com/en/oaks/oaks-horizons",
      "bookingUrl": "https://www.booking.com/hotel/au/oaks-horizons.html",
      "rating": "Trip.com 8.0/10",
      "priceNote": "估算约 $290–350/晚",
      "cost": 320,
      "note": "North Terrace，有厨房；停车 $30/晚、车位有限有限高，需预约"
    }
  ],
  "Vivonne Bay SA": [
    {
      "name": "Discovery Parks - Kangaroo Island",
      "town": "Karatta（Flinders Chase 旁）",
      "type": "度假村两卧木屋（可住 4 人）",
      "officialUrl": "https://www.discoveryholidayparks.com.au/caravan-parks/south-australia/kangaroo-island/kangaroo-island",
      "bookingUrl": "https://www.booking.com/hotel/au/western-k-i-caravan-park.html",
      "rating": "",
      "priceNote": "估算约 $230–300/晚",
      "cost": 260,
      "note": "山火后重建已营业；园内常见考拉袋鼠，离国家公园约 10 分钟"
    },
    {
      "name": "May's Homestead（Flinders Chase 国家公园内）",
      "town": "Flinders Chase",
      "type": "国家公园内老农舍（两卧，可住 4 人）",
      "officialUrl": "https://www.parks.sa.gov.au/parks/flinders-chase-national-park/booking/142802",
      "bookingUrl": "",
      "rating": "",
      "priceNote": "约 $284–326/晚起（南澳旅游局标价）",
      "cost": 300,
      "note": "南澳国家公园官方预订；至少住 2 晚，无 WiFi，信号弱"
    },
    {
      "name": "Island Time at Vivonne Bay",
      "town": "Vivonne Bay",
      "type": "整栋两卧度假屋（可住 4 人）",
      "officialUrl": "https://southaustralia.com/products/kangaroo-island/accommodation/island-time",
      "bookingUrl": "",
      "rating": "Vrbo 9.8/10；综合 4.9/5（185 条）",
      "priceNote": "估算约 $250–320/晚（Airbnb / Vrbo / Stayz 预订）",
      "cost": 280,
      "note": "离海滩约 200 米，有空调厨房；偏远需自备食物"
    }
  ],
  "Tailem Bend SA": [
    {
      "name": "Motel River Bend",
      "town": "Tailem Bend",
      "type": "汽车旅馆家庭房（1 大床 + 2 单人床）",
      "officialUrl": "https://southaustralia.com/products/murray-river-lakes-and-coorong/accommodation/motel-riverbend",
      "bookingUrl": "https://www.expedia.co.uk/Tailem-Bend-Hotels-Motel-River-Bend.h9624986.Hotel-Information",
      "rating": "Expedia 9.8/10（家庭房，评价较少）",
      "priceNote": "$120 起（南澳旅游局）；家庭房估算 $140–170",
      "cost": 150,
      "note": "免费停车和 WiFi，干净安静，实惠"
    },
    {
      "name": "BIG4 The Bend Holiday Park",
      "town": "Tailem Bend（赛车场内）",
      "type": "度假村木屋 / 三卧别墅",
      "officialUrl": "https://www.big4.com.au/caravan-parks/sa/murraylands/the-bend-holiday-park",
      "bookingUrl": "",
      "rating": "",
      "priceNote": "估算约 $180–300/晚",
      "cost": 240,
      "note": "连锁营地适合家庭；Studio 只住 2 人，订前确认房型，赛事期间涨价"
    },
    {
      "name": "Riverside Hotel Motel",
      "town": "Tailem Bend",
      "type": "家庭房（可住 4–6 人）",
      "officialUrl": "",
      "bookingUrl": "https://expedia.com.au/Tailem-Bend-Hotels-Riverside-Hotel-Motel.h37946920.Hotel-Reviews",
      "rating": "Expedia 8.0/10（54 条）",
      "priceNote": "估算约 $150–180/晚",
      "cost": 160,
      "note": "自带餐厅，晚饭方便；设施较基础"
    }
  ],
  "Dimboola VIC": [
    {
      "name": "Dimboola Riverside Holiday Park",
      "town": "Dimboola",
      "type": "河边营地两卧小屋（可住 4 人）",
      "officialUrl": "https://www.hindmarsh.vic.gov.au/Visit-Hindmarsh/Caravan-Parks/Dimboola-Riverside-Holiday-Park",
      "bookingUrl": "",
      "rating": "",
      "priceNote": "估算约 $140–170/晚（按 2 人计价，加人另收费）",
      "cost": 150,
      "note": "镇政府经营，Wimmera 河边、旁有游乐场；电话 03 5389 1416"
    },
    {
      "name": "The Victoria Hotel Dimboola",
      "town": "Dimboola",
      "type": "老酒馆客房（有 4 人房，共用卫浴）",
      "officialUrl": "https://apac.littlehotelier.com/properties/victoriahoteldimbooladirect",
      "bookingUrl": "",
      "rating": "",
      "priceNote": "估算约 $110–150/晚",
      "cost": 130,
      "note": "修复老建筑，楼下酒馆吃饭；酒吧上方房间较吵"
    },
    {
      "name": "Motel Dimboola",
      "town": "Dimboola",
      "type": "汽车旅馆家庭房",
      "officialUrl": "",
      "bookingUrl": "",
      "rating": "HotelsCombined 6.4/10（734 条）",
      "priceNote": "估算约 $130–160/晚",
      "cost": 140,
      "note": "只住一晚够用，免费停车；设施老旧、评分一般"
    }
  ],
  "Halls Gap VIC": [
    {
      "name": "NRMA Halls Gap Holiday Park",
      "town": "Halls Gap",
      "type": "度假村两卧小屋（可住 4–6 人）",
      "officialUrl": "https://www.nrmaparksandresorts.com.au/halls-gap/accommodation-and-sites/cabins-and-villas/",
      "bookingUrl": "https://www.booking.com/hotel/au/big4-grampians-parkgate-resort.html",
      "rating": "Booking.com 8.9/10（499 条）",
      "priceNote": "估算约 $200–260/晚",
      "cost": 230,
      "note": "泳池、跳跳枕、卡丁车，常有袋鼠；Booking 上可能用旧名 Parkgate"
    },
    {
      "name": "Halls Gap Log Cabins",
      "town": "Halls Gap",
      "type": "两卧木屋（可住 4 人）",
      "officialUrl": "https://www.visitgrampians.com.au/products/halls-gap-log-cabins",
      "bookingUrl": "https://www.booking.com/hotel/au/halls-gap-log-cabins.html",
      "rating": "Booking.com 9.3/10（830 条）",
      "priceNote": "估算约 $220–280/晚",
      "cost": 250,
      "note": "盐水泳池、游乐场，背靠国家公园；离镇中心约 1.5 km"
    },
    {
      "name": "Halls Gap Valley Lodges",
      "town": "Halls Gap",
      "type": "两卧独立 Lodge（85㎡，可住 4–5 人）",
      "officialUrl": "",
      "bookingUrl": "",
      "rating": "Expedia 9.6/10（153 条）",
      "priceNote": "估算约 $240–300/晚",
      "cost": 260,
      "note": "宽敞带全厨房；没有泳池"
    }
  ]
};
