from __future__ import annotations

from typing import Any

import httpx


WEATHER_URL = "https://api.openweathermap.org/data/2.5/weather"


async def get_weather(city: str, api_key: str) -> dict[str, Any]:
    """Return current weather using the same OpenWeatherMap tool as Workshop 1.0."""

    city = city.strip()
    if not city:
        raise ValueError("請提供城市名稱。")

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
        raise ValueError(f"找不到「{city}」的天氣，請換成較完整的城市名稱。")
    response.raise_for_status()

    data = response.json()
    return {
        "city": data.get("name") or city,
        "description": data["weather"][0]["description"],
        "temperature_c": data["main"]["temp"],
        "feels_like_c": data["main"].get("feels_like"),
        "humidity_percent": data["main"]["humidity"],
    }
