from utils.error_messages import sanitize_error_message


CHALLENGE_HTML = (
    '<!DOCTYPE html><html><head><title>Just a moment...</title></head>'
    '<body><script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script></body></html>'
)


def test_sanitize_error_message_replaces_antibot_html():
    message = sanitize_error_message(CHALLENGE_HTML)

    assert "blocking automated access" in message
    assert "<!DOCTYPE" not in message
    assert "challenge-platform" not in message


def test_sanitize_error_message_parses_json_detail():
    message = sanitize_error_message('{"detail":"Invalid video URL"}')

    assert message == "Invalid video URL"
