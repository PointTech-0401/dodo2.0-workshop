from dodo_workshop.weather import CITY_ALIASES, resolve_city


def test_chinese_city_names_resolve_to_the_ascii_name_openweathermap_knows() -> None:
    """豆豆 is invited to call the tool in Chinese, so 「臺北」 must work first try.

    Before this mapping OpenWeatherMap returned 404 for the Chinese name and the
    model had to notice the error and retry in English — which surfaced in the
    transcript as a 「找不到「臺北」…」 status followed by a second lookup.
    """

    assert resolve_city("臺北") == "Taipei"
    assert resolve_city("台北") == "Taipei"
    assert resolve_city("高雄") == "Kaohsiung"
    assert resolve_city("新北") == "New Taipei"
    assert resolve_city("東京") == "Tokyo"


def test_city_suffixes_and_whitespace_are_normalized() -> None:
    assert resolve_city("臺北市") == "Taipei"
    assert resolve_city("台南市") == "Tainan"
    assert resolve_city("新竹縣") == "Hsinchu"
    assert resolve_city("  臺中市  ") == "Taichung"


def test_unmatched_and_english_input_passes_through_untouched() -> None:
    # The weather API-key check validates with the literal "Taipei", and the
    # tool description also allows English — ASCII passthrough is load-bearing.
    assert resolve_city("Taipei") == "Taipei"
    assert resolve_city("Kaohsiung") == "Kaohsiung"
    assert resolve_city("Reykjavik") == "Reykjavik"
    # Unknown Chinese names still reach the API, which returns a 404 whose
    # message now tells the model to switch to English.
    assert resolve_city("不存在的城市") == "不存在的城市"
    assert resolve_city("") == ""


def test_every_alias_maps_to_an_ascii_name() -> None:
    for chinese, ascii_name in CITY_ALIASES.items():
        assert ascii_name.isascii(), f"{chinese} → {ascii_name} 不是 ASCII"
        assert "臺" not in chinese, f"{chinese} 應以「台」收錄，resolve_city 會先正規化"
