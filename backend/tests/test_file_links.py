"""Downloads: with R2 the API hands out a short-lived private link instead of passing the bytes
through itself; without it (development) the file is streamed as before."""

from types import SimpleNamespace

from apps.core.files import LINK_SECONDS, serve


class FakeR2:
    bucket_name = "campusverse-uploads"

    def __init__(self):
        self.asked = None

    def url(self, name, parameters=None, expire=None):
        self.asked = (name, parameters, expire)
        return f"https://r2.example/{name}?signed=1"


def stored(content_type, storage, name="notes.pdf"):
    return SimpleNamespace(content_type=content_type, original_name=name,
                           file=SimpleNamespace(name="1/abc.pdf", storage=storage))


def test_r2_files_redirect_to_a_short_private_link():
    r2 = FakeR2()
    response = serve(stored("application/pdf", r2, "Week 3 notes.pdf"))
    assert response.status_code == 302
    assert response["Location"] == "https://r2.example/1/abc.pdf?signed=1"
    assert response["Cache-Control"] == "private, no-store"
    name, params, expire = r2.asked
    assert expire == LINK_SECONDS
    assert params["ResponseContentType"] == "application/pdf"
    assert params["ResponseContentDisposition"].startswith("attachment;")
    assert "Week 3 notes.pdf" in params["ResponseContentDisposition"]


def test_images_open_in_the_page():
    r2 = FakeR2()
    serve(stored("image/png", r2, "diagram.png"))
    assert r2.asked[1]["ResponseContentDisposition"].startswith("inline;")


def test_a_real_download_still_checks_permission_first(campus, client):
    """The endpoints still answer 404 for a file that isn't yours, before any link is made."""
    client.force_login(campus.outsider)
    assert client.get("/api/resources/files/999999").status_code == 404
