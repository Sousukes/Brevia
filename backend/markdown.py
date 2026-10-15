"""纪要 Markdown 的保守格式修复，不改写保存的原始响应。"""

import re


def normalize_summary_markdown(markdown):
    """修复模型将加粗章节标题、句末列表项连在同一行的输出。"""
    text = str(markdown or "")
    protected = re.compile(
        r"(?m)^(?P<fence>`{3,}|~{3,})[^\n]*\n[\s\S]*?"
        r"(?:^(?P=fence)[ \t]*(?=\n|$)|\Z)"
        r"|(?P<ticks>`+)[^`]*?(?P=ticks)"
        r"|!?\[[^\]\n]*\]\([^\)\n]*\)"
    )
    heading = re.compile(r"(?<=[^\s#\\])([ \t]*)(#{1,6}[ \t]+\*\*[^\n*]+\*\*)")
    parts = []
    offset = 0
    for match in protected.finditer(text):
        parts.append((False, text[offset : match.start()]))
        parts.append((True, match.group()))
        offset = match.end()
    parts.append((False, text[offset:]))
    if not any(not keep and heading.search(part) for keep, part in parts):
        return text
    repaired = []
    for keep, part in parts:
        if not keep:
            part = heading.sub(r"\n\n\2", part)
            lines = part.split("\n")
            for index, line in enumerate(lines):
                if re.match(r"^[ \t]*[-*][ \t]+", line):
                    # shortcut: 仅识别加粗章节和句末列表；模型出现其他缺行格式时再扩展。
                    lines[index] = re.sub(
                        r"(?<=[。！？；.!?;])[ \t]*([-*][ \t]+)(?=\S)", r"\n\1", line
                    )
            part = "\n".join(lines)
        repaired.append(part)
    return "".join(repaired)
