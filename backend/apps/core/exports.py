"""CSV downloads that open cleanly in Excel: UTF-8 with a byte-order mark (so Urdu names and
dashes show right), one header row, and no cell that Excel would run as a formula."""

import csv
import io
import re
from collections.abc import Iterable

from django.http import HttpResponse

_FORMULA = ("=", "+", "-", "@", "\t", "\r")


def _safe(value) -> str:
    """A cell as text. One starting like a formula gets a leading apostrophe, so a name such as
    "=HYPERLINK(...)" is shown, never run (CSV injection). Numbers stay numbers."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value)
    if text.startswith(_FORMULA) and not re.fullmatch(r"-?\d+(\.\d+)?", text):
        return "'" + text
    return text


def csv_response(filename: str, header: list[str], rows: Iterable[Iterable]) -> HttpResponse:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([_safe(h) for h in header])
    for row in rows:
        writer.writerow([_safe(v) for v in row])
    response = HttpResponse("﻿" + buffer.getvalue(), content_type="text/csv; charset=utf-8")
    safe_name = re.sub(r"[^\w.\- ]+", "-", filename).strip() or "export.csv"
    response["Content-Disposition"] = f'attachment; filename="{safe_name}"'
    response["Cache-Control"] = "private, no-store"
    return response
