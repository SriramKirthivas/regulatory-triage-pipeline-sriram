"""Configuration tests, mostly guarding the deployment path.

The database URL rewrite is the highest-risk line in the deploy: it runs at import
time, and if it is wrong the service dies before the logging config is even
installed. That failure looks like a blank crash loop on the hosting dashboard,
which is a miserable thing to debug from a deploy log.
"""

import pytest
from sqlalchemy.engine import make_url

from app.config import Settings


@pytest.mark.parametrize(
    "supplied,expected",
    [
        # What Render, Heroku and Fly actually hand out.
        (
            "postgres://user:pw@dpg-abc.frankfurt-postgres.render.com/rtp",
            "postgresql+psycopg://user:pw@dpg-abc.frankfurt-postgres.render.com/rtp",
        ),
        # Bare postgresql:// resolves to psycopg2, which is not installed.
        (
            "postgresql://user:pw@host:5432/db",
            "postgresql+psycopg://user:pw@host:5432/db",
        ),
        # Already correct — must be left alone.
        (
            "postgresql+psycopg://rtp:rtp@localhost:5433/rtp",
            "postgresql+psycopg://rtp:rtp@localhost:5433/rtp",
        ),
    ],
)
def test_database_url_is_normalised_for_sqlalchemy(supplied, expected):
    assert Settings(database_url=supplied).database_url == expected


def test_normalised_url_is_actually_parseable_by_sqlalchemy():
    """The real assertion: SQLAlchemy accepts it and picks the psycopg driver.

    String equality alone would not catch a driver name that looks right but does
    not resolve.
    """
    settings = Settings(
        database_url="postgres://user:pw@dpg-abc.frankfurt-postgres.render.com/rtp"
    )
    url = make_url(settings.database_url)
    assert url.drivername == "postgresql+psycopg"
    assert url.host == "dpg-abc.frankfurt-postgres.render.com"
    assert url.database == "rtp"
    assert url.username == "user"


def test_password_special_characters_survive_rewrite():
    """Hosted providers generate passwords containing URL-significant characters."""
    raw = "postgres://u:p%2Fw%40x@host/db"
    url = make_url(Settings(database_url=raw).database_url)
    assert url.password == "p/w@x"


def test_cors_origins_parse_to_a_list():
    settings = Settings(cors_origins="https://a.vercel.app, https://b.vercel.app")
    assert settings.cors_origin_list == ["https://a.vercel.app", "https://b.vercel.app"]
    assert settings.allow_all_origins is False


def test_wildcard_origin_is_detected():
    assert Settings(cors_origins="*").allow_all_origins is True
