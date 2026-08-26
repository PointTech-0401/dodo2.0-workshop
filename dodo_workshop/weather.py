from __future__ import annotations

from typing import Any

import httpx


WEATHER_URL = "https://api.openweathermap.org/data/2.5/weather"

# OpenWeatherMap's `q` lookup does not resolve most place names written in
# Chinese — 「臺北」 comes back 404. The tool description invites 豆豆 to call in
# Chinese, so without this table the first call always failed and the model had
# to notice the error and retry in English (visible in the transcript as a
# 「找不到…」 status followed by a second lookup).
CITY_ALIASES: dict[str, str] = {
    # 直轄市與縣市
    "台北": "Taipei",
    "新北": "New Taipei",
    "桃園": "Taoyuan",
    "台中": "Taichung",
    "台南": "Tainan",
    "高雄": "Kaohsiung",
    "基隆": "Keelung",
    "新竹": "Hsinchu",
    "嘉義": "Chiayi",
    "苗栗": "Miaoli",
    "彰化": "Changhua",
    "南投": "Nantou",
    "雲林": "Douliu",
    "屏東": "Pingtung",
    "宜蘭": "Yilan",
    "花蓮": "Hualien",
    "台東": "Taitung",
    "澎湖": "Magong",
    "金門": "Kinmen",
    "馬祖": "Nangan",
    "連江": "Nangan",
    # 常見海外城市
    "東京": "Tokyo",
    "大阪": "Osaka",
    "京都": "Kyoto",
    "名古屋": "Nagoya",
    "福岡": "Fukuoka",
    "札幌": "Sapporo",
    "沖繩": "Okinawa",
    "首爾": "Seoul",
    "釜山": "Busan",
    "北京": "Beijing",
    "上海": "Shanghai",
    "香港": "Hong Kong",
    "澳門": "Macau",
    "新加坡": "Singapore",
    "曼谷": "Bangkok",
    "吉隆坡": "Kuala Lumpur",
    "馬尼拉": "Manila",
    "紐約": "New York",
    "舊金山": "San Francisco",
    "洛杉磯": "Los Angeles",
    "西雅圖": "Seattle",
    "溫哥華": "Vancouver",
    "多倫多": "Toronto",
    "倫敦": "London",
    "巴黎": "Paris",
    "柏林": "Berlin",
    "羅馬": "Rome",
    "雪梨": "Sydney",
    "墨爾本": "Melbourne",
}

_CITY_SUFFIXES = ("市", "縣", "區")


def resolve_city(city: str) -> str:
    """Map a Chinese city name onto the ASCII name OpenWeatherMap recognises.

    Unmatched input passes through untouched, so English names (and the literal
    "Taipei" used to validate the API key) keep working.
    """

    normalized = city.strip().replace("臺", "台")
    if not normalized:
        return normalized
    # 台北市 / 新竹縣 are as likely as 台北 / 新竹.
    for suffix in _CITY_SUFFIXES:
        if normalized.endswith(suffix) and len(normalized) > len(suffix) + 1:
            normalized = normalized[: -len(suffix)]
            break
    return CITY_ALIASES.get(normalized, city.strip())


async def get_weather(city: str, api_key: str) -> dict[str, Any]:
    """Return current weather using the same OpenWeatherMap tool as Workshop 1.0."""

    requested = city.strip()
    if not requested:
        raise ValueError("請提供城市名稱。")
    city = resolve_city(requested)

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            WEATHER_URL,
            params={
                "q": city,
                "appid": api_key,
                "units": "metric",
                "lang": "zh_tw",
            },
        )

    if response.status_code == 401:
        raise ValueError("WEATHER_API_KEY 無效或尚未生效。")
    if response.status_code == 404:
        raise ValueError(
            f"找不到「{requested}」的天氣，請改用英文城市名稱（例如 Taipei、Tokyo）。"
        )
    response.raise_for_status()

    data = response.json()
    return {
        # Echo the name the user actually asked for; `data["name"]` would show
        # the ASCII alias ("Taipei") and 豆豆 would read it out in English.
        "city": requested,
        "resolved_as": data.get("name") or city,
        "description": data["weather"][0]["description"],
        "temperature_c": data["main"]["temp"],
        "feels_like_c": data["main"].get("feels_like"),
        "humidity_percent": data["main"]["humidity"],
    }
