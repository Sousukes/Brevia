"""外部 LLM 的最小 HTTP 边界。

会议数据仅由 Worker 在收到 ``consent`` 后传入本模块；本模块不读取本地
数据库，因此不会绕过 UI 的用户确认流程。
"""

import json
import re
import urllib.error
import urllib.parse
import urllib.request

from .config import SETTINGS


class _SameOriginRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Keep credentials and meeting content within the configured HTTP origin."""

    @staticmethod
    def _origin(url):
        parsed = urllib.parse.urlsplit(url)
        port = (
            parsed.port
            if parsed.port is not None
            else {"http": 80, "https": 443}.get(parsed.scheme)
        )
        return parsed.scheme, parsed.hostname, port

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Scheme changes include HTTPS downgrades; hostname or port changes
        # cross a trust boundary even when no API key is configured.
        if self._origin(req.full_url) != self._origin(newurl):
            if fp is not None:
                fp.close()
            raise urllib.error.URLError("Cross-origin LLM redirects are not allowed")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_HTTP_OPENER = urllib.request.build_opener(_SameOriginRedirectHandler())

# 部分 OpenAI 兼容中转站对模型名大小写敏感（要求全小写），而官网/文档常把模型展示成
# ``GPT-4o``。仅当首次请求已因「模型不存在」失败时才做一次小写重试，正常配置不受影响。
_MODEL_MISSING_HINT = re.compile(
    r"model.{0,80}?(?:not\s+(?:found|supported|exist)|does\s+not\s+exist|unsupported|unknown)"
    r"|\bmodel_not_found\b|(?:unknown|no\s+such)\s+model\b"
    r"|模型.{0,20}?(?:不存在|不支持)",
    re.IGNORECASE,
)


def _openai_endpoint(endpoint):
    """把 OpenAI 兼容地址补成可直接 POST 的完整路径。

    用户常只填站点根地址（如 ``https://api.chatanywhere.tech``），而 OpenAI 兼容接口的
    实际路径是 ``/v1/chat/completions``。此前只有 Claude 格式会自动补路径，OpenAI 格式
    原样发送，于是裸域名保存时通过校验、调用时才 404——典型「保存没问题、一用就报错」。
    这里补齐最常见的几种写法；已带完整路径的地址（含 Azure 的
    ``/openai/deployments/...``）不受影响。
    """
    parts = urllib.parse.urlsplit(endpoint)
    if parts.path.rstrip("/") in ("", "/v1", "/v1/chat"):
        return urllib.parse.urlunsplit(
            (parts.scheme, parts.netloc, "/v1/chat/completions", parts.query, "")
        )
    return endpoint


def _lowercase_model_retry(error, body, api_format):
    """判断是否值得把模型名转小写后重试一次；不值得则返回 ``None``。"""
    if api_format in {"anthropic", "claude"}:
        return None
    model = str(body.get("model") or "")
    lowered = model.lower()
    if not model or lowered == model:
        return None
    text = str(error)
    if not re.search(r"LLM request failed \((400|404)\)", text):
        return None
    if not _MODEL_MISSING_HINT.search(text):
        return None
    return lowered


def _post(endpoint, body, headers, timeout_seconds):
    """POST 一个 JSON 请求体并解析 JSON 响应；失败统一抛可读的 ``ValueError``。"""
    try:
        # Request 构造也放进 try：endpoint 非法（如缺 scheme）会在这里抛 ValueError，
        # 统一包装成可读的 "LLM request failed"，而不是把裸异常抛给上层。
        request = urllib.request.Request(
            endpoint, json.dumps(body).encode(), headers=headers, method="POST"
        )
        with _HTTP_OPENER.open(request, timeout=timeout_seconds) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")
        raise ValueError(f"LLM request failed ({error.code}): {detail}") from error
    except (urllib.error.URLError, OSError, ValueError) as error:
        raise ValueError(f"LLM request failed: {error}") from error


def complete(payload, prompt, json_mode=False):
    """调用 OpenAI/Claude 兼容端点并提取常见的文本字段。"""
    api_format = (payload.get("format") or "openai").lower()
    endpoint = payload["endpoint"].rstrip("/")
    # 不发送 tool_choice：本模块从不发送 tools，而部分 OpenAI 兼容网关（如
    # api.chatanywhere.tech）在缺少 tools 时会直接拒绝该字段并返回 400
    # "tool_choice is only allowed when 'tools' are specified"。既然没有工具可用，
    # 模型也不会发起工具调用；若真返回了 tool_calls，下方解析会显式报错。
    body = {
        "model": payload["model"],
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    headers = {"Content-Type": "application/json", "User-Agent": "Brevia/1.0"}
    if api_format in {"anthropic", "claude"}:
        if not endpoint.endswith("/v1/messages"):
            endpoint += "/v1/messages"
        body = {
            "model": payload["model"],
            "max_tokens": 2048,
            "messages": [{"role": "user", "content": prompt}],
        }
        if payload.get("api_key"):
            headers.update(
                {
                    "anthropic-version": "2023-06-01",
                    "x-api-key": payload["api_key"],
                }
            )
    else:
        # OpenAI 兼容格式：把裸域名 / 半截路径补成 /v1/chat/completions，避免用户只填
        # 站点根地址时保存通过、调用 404。
        endpoint = _openai_endpoint(endpoint)
        if payload.get("api_key"):
            headers["Authorization"] = f"Bearer {payload['api_key']}"
    # timeout 允许缺省；显式传 null 或非法值时回落到设置里的默认秒数，而不是抛 TypeError。
    timeout = payload.get("timeout")
    try:
        timeout_seconds = int(
            timeout if timeout is not None else SETTINGS["llm"]["timeout_seconds"]
        )
    except (TypeError, ValueError):
        timeout_seconds = int(SETTINGS["llm"]["timeout_seconds"])
    try:
        data = _post(endpoint, body, headers, timeout_seconds)
    except ValueError as error:
        lowered = _lowercase_model_retry(error, body, api_format)
        if lowered is None:
            raise
        # 兼容性兜底：部分中转站要求模型名全小写。只在首次已因「模型不存在」失败时重试
        # 一次，不改动正常配置；重试仍失败则抛回原始错误，不掩盖真正的问题。
        body = {**body, "model": lowered}
        try:
            data = _post(endpoint, body, headers, timeout_seconds)
        except ValueError:
            raise error from None
    content = data.get("message", {}).get("content")
    if content is None and data.get("choices"):
        message = data["choices"][0].get("message", {})
        content = message.get("content")
        tool_calls = message.get("tool_calls") or []
    else:
        tool_calls = []
    if content is None and isinstance(data.get("content"), list):
        content = data["content"]
    if isinstance(content, list):
        text = "".join(
            item.get("text", "") for item in content if item.get("type", "text") == "text"
        )
        tool_calls.extend(item for item in content if item.get("type") == "tool_use")
        if text:
            return text
    elif isinstance(content, str) and content.strip():
        return content
    if data.get("output_text"):
        return data["output_text"]
    if tool_calls:
        names = ", ".join(
            item.get("name") or item.get("function", {}).get("name", "unknown")
            for item in tool_calls
        )
        raise ValueError(f"LLM returned a tool call instead of text: {names}")
    raise ValueError("LLM response does not contain text")
